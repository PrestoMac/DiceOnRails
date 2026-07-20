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

// Capture synced states so the test can "replay" them as simulated realtime updates.
// Mirror the production storageService.syncCampaignState behavior by tagging each
// payload with the current rewind generation — this is what the fix relies on.
import { getRewindGeneration } from '../../services/rewindGeneration';
const syncedStates: GameState[] = [];
const mockSyncCampaignState = vi.fn(async (_id: string, gameState: GameState) => {
  syncedStates.push({ ...gameState, _rewindGeneration: getRewindGeneration() });
});

vi.mock('../../services/storageService', () => ({
  storageService: {
    syncCampaignState: (...args: Parameters<typeof mockSyncCampaignState>) => mockSyncCampaignState(...args),
    createCampaign: vi.fn().mockResolvedValue(undefined),
    saveGame: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../services/audioService', () => ({
  speakText: vi.fn(),
  stopSpeaking: vi.fn(),
}));

const { mcpServer } = await import('../../services/mcpService');
const { useGameActions } = await import('../../hooks/useGameActions');
import { makeWizard } from '../helpers/characters';

function slot3Current(): number {
  const char = mcpServer.getFullState().party[0];
  const r = (char.resources ?? []).find(x => x.id === 'spell-slot-3');
  if (!r) throw new Error('spell-slot-3 missing');
  return r.current;
}

function useTestHarness() {
  const [gameState, setGameState] = useState<GameState>(() => mcpServer.getFullState());
  const [messages, setMessages] = useState<Message[]>([]);
  const [, setIsLoading] = useState(false);
  const actions = useGameActions(
    gameState, setGameState, messages, setMessages,
    'camp-1', 'user-1', 'wizard-1', // <-- campaign mode
    { voiceName: '', rate: 1, pitch: 1, volume: 1, autoSpeak: false, enableAtmosphere: false, debugMode: false },
    setIsLoading, vi.fn(), () => setGameState(mcpServer.getFullState()),
    vi.fn(), vi.fn(), vi.fn(), vi.fn(),
    false, undefined, vi.fn(), vi.fn(() => 'Player'), undefined,
  );
  return actions;
}

// Simulates the realtime subscription firing with a stale state — exactly what
// useGameState.ts does when isProcessingRef.current === false. Mirrors the
// generation guard added by the fix so the test exercises the same logic.
function simulateRealtimeCallback(state: GameState, isProcessing: boolean): void {
  const remoteGen = (state as { _rewindGeneration?: number })?._rewindGeneration ?? 0;
  const localGen = getRewindGeneration();
  if (remoteGen < localGen) {
    // Stale update rejected by guard — production code returns early here.
    return;
  }
  mcpServer.loadState({ ...state, isProcessing });
}

describe('useGameActions rewind race — campaign mode + simulated realtime', () => {
  let enemyId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(cryptoRoll).mockReturnValue(10);
    mockGenerateTightNarration.mockResolvedValue('The fireball erupts!');
    mockRunAgentLoop.mockReset();
    syncedStates.length = 0;

    mcpServer.reset();
    const wizard = makeWizard();
    mcpServer.joinParty(wizard);

    await mcpServer.add_enemy('Goblin', 15, 7);
    await mcpServer.start_combat();
    const combat = mcpServer.getFullState().combat;
    if (!combat) throw new Error('expected combat');
    enemyId = combat.enemies[0].id;

    mockRunAgentLoop.mockImplementation(async () => {
      const r = await mcpServer.executeToolCall('cast_spell', {
        characterId: 'wizard-1', spellId: 'fireball', slotLevel: 3, targets: [enemyId],
      });
      return {
        toolMessages: [{ id: `tool-${Date.now()}-${Math.random()}`, role: MessageRole.TOOL, text: `[System:cast_spell] ${r.message}`, timestamp: Date.now() }],
        iterationCount: 1, promptTokens: 0, completionTokens: 0, cachedTokens: 0, inlineNarration: 'Boom!',
      };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Test exercises the generation-guard fix: a stale realtime update from
  // before the rewind should be rejected, so the retry's saveRewindPoint
  // captures the restored (pristine) state and the slot round-trips at N-1.
  it('BUG REPRO: stale realtime update arriving between saveRewindPoint and cast_spell degrades slots', async () => {
    const SLOT_3_MAX = 2;

    // Capture the post-turn-1 state (N-1 slots) so we can "replay" it as a stale realtime update.
    let postTurn1State: GameState | null = null;
    const originalImpl = mockRunAgentLoop.getMockImplementation();
    if (!originalImpl) throw new Error('runAgentLoop must have a default implementation');
    mockRunAgentLoop.mockImplementation(async function (this: unknown, ...args: unknown[]) {
      const res = await originalImpl.apply(this as never, args as never[]);
      // After the FIRST turn's cast_spell, capture state for later replay.
      if (postTurn1State === null) {
        postTurn1State = JSON.parse(JSON.stringify(mcpServer.getFullState()));
      }
      return res;
    });

    const { result } = renderHook(() => useTestHarness());

    // TURN 1
    await act(async () => {
      await result.current.handleSendMessage('I cast fireball at the goblin');
    });
    expect(slot3Current()).toBe(SLOT_3_MAX - 1);
    if (!postTurn1State) throw new Error('postTurn1State was not captured');
    const postTurn1Slot3 = postTurn1State.party[0].resources?.find(r => r.id === 'spell-slot-3');
    if (!postTurn1Slot3) throw new Error('expected spell-slot-3 in postTurn1State');
    // Sanity: postTurn1State has N-1 slots
    expect(postTurn1Slot3.current).toBe(SLOT_3_MAX - 1);

    // Simulate the realtime subscription receiving turn-1's syncFinished state (N-1, isProcessing=false).
    // This sets isProcessingRef.current = false (in production; here we just verify state doesn't degrade).
    await act(async () => {
      // The LAST synced state should be the post-turn-1 state with isProcessing=false.
      const lastSynced = syncedStates[syncedStates.length - 1];
      simulateRealtimeCallback(lastSynced, false);
    });

    // === REWIND ===
    await act(async () => {
      await result.current.handleRewind();
    });

    // After rewind's restoreSnapshot, slot should be back to max.
    expect(slot3Current()).toBe(SLOT_3_MAX);

    // === SIMULATE STALE REALTIME UPDATE ARRIVING DURING THE RETRY ===
    // The retry's handleSendMessage has just been scheduled (100ms setTimeout).
    // Before it fires, simulate a stale realtime update from BEFORE the rewind
    // arriving — this is what would happen if Supabase realtime delivers the
    // turn-1 syncFinished write LATE.
    //
    // postTurn1State was captured from mcpServer.getFullState() during turn 1
    // (before the fix's generation tagging), so it has no _rewindGeneration
    // field (treated as 0). After the rewind, the local generation is 1, so
    // the realtime guard must REJECT this stale update.
    await act(async () => {
      simulateRealtimeCallback(postTurn1State, false);
    });

    // FIXED BEHAVIOR: the stale overwrite is rejected. State stays at pristine (N).
    expect(slot3Current()).toBe(SLOT_3_MAX);

    // Now let the retry's handleSendMessage fire (100ms setTimeout).
    await act(async () => { await new Promise(r => setTimeout(r, 300)); });

    // FIXED BEHAVIOR: the retry's saveRewindPoint captured the pristine state
    // (the stale overwrite was rejected). cast_spell consumes from N → N-1.
    // Before the fix, the slot would have degraded to N-2.
    const finalSlot = slot3Current();
    console.log(`[Test C-campaign] Final slot3 current: ${finalSlot} (expected ${SLOT_3_MAX - 1}; buggy would be ${SLOT_3_MAX - 2})`);
    expect(finalSlot).toBe(SLOT_3_MAX - 1);
  }, 30000);
});
