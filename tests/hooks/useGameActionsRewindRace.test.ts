import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { renderHook, act } from '@testing-library/react';
import { GameState, Message, MessageRole } from '../../types';

vi.mock('../../utils/random', () => ({
  cryptoRoll: vi.fn(() => 10),
}));

const { cryptoRoll } = await import('../../utils/random');

vi.mock('../../utils/envHelper', () => ({
  getEnv: vi.fn(),
  getThinkingDisabledBody: vi.fn(),
}));

vi.mock('../../utils/debug', () => ({
  isDebugMode: false,
}));

const mockRunAgentLoop = vi.fn();
const mockGenerateTightNarration = vi.fn();

vi.mock('../../services/llm', () => ({
  runAgentLoop: (...args: unknown[]) => mockRunAgentLoop(...args),
  generateTightNarration: (...args: unknown[]) => mockGenerateTightNarration(...args),
  estimateTokens: vi.fn(() => 10),
  compressRawToCheckpoint: vi.fn().mockResolvedValue(''),
  enforceTokenBudget: vi.fn().mockImplementation(({ frozenMessages }: { activeMessages: unknown[]; frozenMessages: unknown[] }) => ({
    trimmedFrozen: frozenMessages || [],
    droppedRaw: false,
    droppedCheckpoints: 0,
    tiersTriggered: [],
    trimActiveCount: 0,
  })),
  computePayloadTokens: vi.fn(() => 0),
  RAW_CAP: 30000,
  CONTEXT_BUDGET: 180000,
}));

vi.mock('../../services/storageService', () => ({
  storageService: {
    syncCampaignState: vi.fn().mockResolvedValue(undefined),
    createCampaign: vi.fn().mockResolvedValue(undefined),
    saveGame: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../services/audioService', () => ({
  speakText: vi.fn(),
  stopSpeaking: vi.fn(),
}));

// Use the REAL MockMCPServer singleton — this is the whole point of Test C.
const { mcpServer } = await import('../../services/mcpService');
const { useGameActions } = await import('../../hooks/useGameActions');
import { makeWizard } from '../helpers/characters';

async function flushRetry(timeoutMs = 600): Promise<void> {
  // handleRewind schedules setTimeout(handleSendMessage, 100). Wait for it.
  await new Promise(r => setTimeout(r, timeoutMs));
}

function slot3Current(): number {
  const char = mcpServer.getFullState().party[0];
  const r = (char.resources ?? []).find(x => x.id === 'spell-slot-3');
  if (!r) throw new Error('spell-slot-3 missing from character resources');
  return r.current;
}

function useTestHarness() {
  const [gameState, setGameState] = useState<GameState>(() => mcpServer.getFullState());
  const [messages, setMessages] = useState<Message[]>([]);
  const [, setIsLoading] = useState(false);
  const actions = useGameActions(
    gameState, setGameState, messages, setMessages,
    undefined, undefined, 'wizard-1',
    { voiceName: '', rate: 1, pitch: 1, volume: 1, autoSpeak: false, enableAtmosphere: false, debugMode: false },
    setIsLoading, vi.fn(), () => setGameState(mcpServer.getFullState()),
    vi.fn(), vi.fn(), vi.fn(), vi.fn(),
    false, undefined, vi.fn(), vi.fn(() => 'Player'), undefined,
  );
  return actions;
}

describe('useGameActions rewind race (real mcpServer + mocked agent loop)', () => {
  let enemyId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(cryptoRoll).mockReturnValue(10);
    mockGenerateTightNarration.mockResolvedValue('The fireball erupts!');
    mockRunAgentLoop.mockReset();

    // Reset the singleton's state and set up a fresh wizard + combat.
    mcpServer.reset();
    const wizard = makeWizard();
    mcpServer.joinParty(wizard);

    await mcpServer.add_enemy('Goblin', 15, 7);
    await mcpServer.start_combat();
    const combat = mcpServer.getFullState().combat;
    if (!combat) throw new Error('expected combat');
    enemyId = combat.enemies[0].id;

    // Wire runAgentLoop to call cast_spell on the real mcpServer, exactly once per call.
    mockRunAgentLoop.mockImplementation(async () => {
      const r = await mcpServer.executeToolCall('cast_spell', {
        characterId: 'wizard-1',
        spellId: 'fireball',
        slotLevel: 3,
        targets: [enemyId],
      });
      const toolMessage: Message = {
        id: `tool-${Date.now()}-${Math.random()}`,
        role: MessageRole.TOOL,
        text: `[System:cast_spell] ${r.message}`,
        timestamp: Date.now(),
      };
      return { toolMessages: [toolMessage], iterationCount: 1, promptTokens: 0, completionTokens: 0, cachedTokens: 0, inlineNarration: 'The fireball erupts!' };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('multiple rewind+retry cycles keep spell slot at max-1 (not degrading)', async () => {
    const SLOT_3_MAX = 2;

    const { result } = renderHook(() => useTestHarness());

    // Sanity: slots at max before anything
    expect(slot3Current()).toBe(SLOT_3_MAX);

    // === TURN 1: cast fireball ===
    await act(async () => {
      await result.current.handleSendMessage('I cast fireball at the goblin');
    });
    expect(mockRunAgentLoop).toHaveBeenCalledTimes(1);
    expect(slot3Current()).toBe(SLOT_3_MAX - 1);

    // === REWIND 1 ===
    await act(async () => {
      await result.current.handleRewind();
    });
    await act(async () => { await flushRetry(); });

    expect(mockRunAgentLoop).toHaveBeenCalledTimes(2);
    expect(slot3Current()).toBe(SLOT_3_MAX - 1);

    // === REWIND 2 ===
    await act(async () => {
      await result.current.handleRewind();
    });
    await act(async () => { await flushRetry(); });

    expect(mockRunAgentLoop).toHaveBeenCalledTimes(3);
    expect(slot3Current()).toBe(SLOT_3_MAX - 1);

    // === REWIND 3 ===
    await act(async () => {
      await result.current.handleRewind();
    });
    await act(async () => { await flushRetry(); });

    expect(mockRunAgentLoop).toHaveBeenCalledTimes(4);
    // CRITICAL: slot must NOT have degraded. Still N-1 after 3 rewinds.
    expect(slot3Current()).toBe(SLOT_3_MAX - 1);
  }, 30000);

  it('rewind+retry with L1 cantrip + L3 fireball (multi-spell turn) stays stable', async () => {
    // Simulate a more realistic turn where the LLM casts multiple spells.
    // First cast magic-missile (L1), then fireball (L3). Total: 1 L1 + 1 L3 consumed per turn.
    const SLOT_1_MAX = 4;
    const SLOT_3_MAX = 2;

    mockRunAgentLoop.mockImplementation(async () => {
      // First spell: magic-missile (L1)
      await mcpServer.executeToolCall('cast_spell', {
        characterId: 'wizard-1', spellId: 'magic-missile', slotLevel: 1, targets: [enemyId],
      });
      // Second spell: fireball (L3)
      await mcpServer.executeToolCall('cast_spell', {
        characterId: 'wizard-1', spellId: 'fireball', slotLevel: 3, targets: [enemyId],
      });
      return { toolMessages: [], iterationCount: 1, promptTokens: 0, completionTokens: 0, cachedTokens: 0, inlineNarration: 'Spell combo!' };
    });

    const { result } = renderHook(() => useTestHarness());

    await act(async () => {
      await result.current.handleSendMessage('I cast magic missile then fireball');
    });
    expect(slot3Current()).toBe(SLOT_3_MAX - 1);

    function slot1Current(): number {
      const char = mcpServer.getFullState().party[0];
      const r = (char.resources ?? []).find(x => x.id === 'spell-slot-1');
      if (!r) throw new Error('spell-slot-1 missing');
      return r.current;
    }
    expect(slot1Current()).toBe(SLOT_1_MAX - 1);

    // Three rewind cycles
    for (let i = 0; i < 3; i++) {
      await act(async () => { await result.current.handleRewind(); });
      await act(async () => { await flushRetry(); });
      expect(slot3Current()).toBe(SLOT_3_MAX - 1);
      expect(slot1Current()).toBe(SLOT_1_MAX - 1);
    }
  }, 30000);

  it('rapid sequential rewinds (no wait between) still stable', async () => {
    // Test if hitting rewind rapidly causes issues. Each rewind waits for processingRef.
    const SLOT_3_MAX = 2;
    const { result } = renderHook(() => useTestHarness());

    await act(async () => {
      await result.current.handleSendMessage('I cast fireball at the goblin');
    });
    expect(slot3Current()).toBe(SLOT_3_MAX - 1);

    // Fire rewind 3 times in succession (relying on processingRef guard)
    for (let i = 0; i < 3; i++) {
      await act(async () => { await result.current.handleRewind(); });
      await act(async () => { await flushRetry(); });
      expect(slot3Current()).toBe(SLOT_3_MAX - 1);
    }
  }, 30000);
});
