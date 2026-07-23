import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AppStage, CombatState, GameState, MessageRole } from '../../types';
import { deepClone } from '../../utils/clone';

vi.mock('../../utils/random', () => ({
  cryptoRoll: vi.fn(() => 10),
}));

vi.mock('../../utils/envHelper', () => ({
  getEnv: vi.fn(),
}));

vi.mock('../../utils/debug', () => ({
  isDebugMode: false,
}));

const mcpServerMock = {
  getFullState: vi.fn(),
  getTarget: vi.fn(),
  getCharacterProgression: vi.fn(),
  getResource: vi.fn(),
  beginTransaction: vi.fn(),
  commitTransaction: vi.fn(),
  rollbackTransaction: vi.fn(),
  saveRewindPoint: vi.fn(),
  loadRewindPoint: vi.fn(),
  clearRewindPoint: vi.fn(),
  saveEmergencySnapshot: vi.fn(),
  loadEmergencySnapshot: vi.fn(),
  clearEmergencySnapshot: vi.fn(),
  restoreSnapshot: vi.fn(),
  joinParty: vi.fn(),
  roll_dice: vi.fn(),
  loadState: vi.fn(),
  setLastSuggestions: vi.fn(),
};

vi.mock('../../services/mcpService', () => ({
  mcpServer: mcpServerMock,
}));

const mockGenerateNarration = vi.fn();
const mockGenerateNarrationStream = vi.fn();
const mockRunAgentLoop = vi.fn();
vi.mock('../../services/llm', () => ({
  generateNarration: (...args: unknown[]) => mockGenerateNarration(...args),
  generateNarrationStream: (...args: unknown[]) => mockGenerateNarrationStream(...args),
  runAgentLoop: (...args: unknown[]) => mockRunAgentLoop(...args),
  estimateTokens: vi.fn(() => 10),
  compressRawToCheckpoint: vi.fn().mockResolvedValue(''),
  enforceTokenBudget: vi.fn().mockImplementation(({ activeMessages: _activeMessages, frozenMessages }: { activeMessages: unknown[]; frozenMessages: unknown[] }) => ({
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

const { useGameActions } = await import('../../hooks/useGameActions');
import { storageService } from '../../services/storageService';

function makeBaseState(): GameState {
  return {
    party: [{
      id: 'hero-1', name: 'Hero', class: 'Fighter', race: 'Human', level: 1,
      hp: { current: 12, max: 12 },
      stats: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 14 },
      inventory: [{ name: 'Longsword', quantity: 1, type: 'weapon', equipped: true }],
      currency: { gp: 10, sp: 0, cp: 0 },
      location: 'Tavern', experience: 0, experienceToNextLevel: 300,
      unusedStatPoints: 0, maxHpBonus: 0, hitDice: { current: 1, max: 1 },
      resources: [], knownSpells: [], preparedSpells: [], racialTraits: [], unlockedSubclassFeatures: [],
    }],
    worldDescription: 'A dark tavern',
    sessionLogs: [], quests: [], lore: [], actionQueue: [],
    isProcessing: false,
  };
}

describe('useGameActions', () => {
  const setGameState = vi.fn();
  const setMessages = vi.fn();
  const setIsLoading = vi.fn();
  const syncState = vi.fn();
  const performAtmosphereUpdate = vi.fn();
  const setStage = vi.fn();
  const setViewingCharacterId = vi.fn();
  const setMyCharacterId = vi.fn();
  const setIsNewCampaign = vi.fn();
  const getSenderName = vi.fn(() => 'Player');
  const onCloseLevelUp = vi.fn();

  const defaultProps = {
    gameState: makeBaseState(),
    setGameState,
    messages: [],
    setMessages,
    currentCampaignId: undefined as string | undefined,
    userId: undefined as string | undefined,
    myCharacterId: 'hero-1',
    settings: {
      voiceName: '', rate: 1, pitch: 1, volume: 1,
      autoSpeak: false, enableAtmosphere: false, debugMode: false,
    },
    setIsLoading,
    syncState,
    performAtmosphereUpdate,
    setStage,
    setViewingCharacterId,
    setMyCharacterId,
    isNewCampaign: false,
    campaignName: undefined as string | undefined,
    setIsNewCampaign,
    getSenderName,
    onCloseLevelUp,
    onTriggerDiceRoll: undefined,
  };

  beforeEach(() => {
    defaultProps.messages = [];
    vi.clearAllMocks();
    vi.stubGlobal('Date', { now: () => 1000 });
    mcpServerMock.getFullState.mockReturnValue(makeBaseState());
    mcpServerMock.getTarget.mockReturnValue(makeBaseState().party[0]);
    mcpServerMock.getCharacterProgression.mockReturnValue('Level 1');
    mcpServerMock.getResource.mockReturnValue({ location: 'Tavern', description: 'A dark tavern' });
    mockGenerateNarration.mockResolvedValue({ text: 'The adventure continues...' });
    mockGenerateNarrationStream.mockReturnValue({
      promise: Promise.resolve('The adventure continues...'),
      cancel: vi.fn()
    });
    mockRunAgentLoop.mockResolvedValue({ toolMessages: [], iterationCount: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const render = () =>
    renderHook(() => useGameActions(
      defaultProps.gameState, setGameState, defaultProps.messages, setMessages,
      defaultProps.currentCampaignId, defaultProps.userId, defaultProps.myCharacterId,
      defaultProps.settings, setIsLoading, defaultProps.onCloseLevelUp, syncState, performAtmosphereUpdate,
      setStage, setViewingCharacterId, setMyCharacterId,
      defaultProps.isNewCampaign, defaultProps.campaignName, setIsNewCampaign,
      getSenderName, defaultProps.onTriggerDiceRoll,
    ));

  it('returns handler functions', () => {
    const { result } = render();
    expect(result.current.handleSendMessage).toBeDefined();
    expect(result.current.handleExecuteBatch).toBeDefined();
    expect(result.current.handleCharacterCreated).toBeDefined();
    expect(result.current.handleUndo).toBeDefined();
    expect(result.current.handleRewind).toBeDefined();
    expect(result.current.resetContextState).toBeDefined();
  });

  describe('resetContextState (campaign switch isolation)', () => {
    afterEach(() => {
      // Restore defaultProps.gameState to a clean base so subsequent describes aren't polluted.
      defaultProps.gameState = makeBaseState();
    });

    it('synchronously re-hydrates ctxRef from the current gameState.ctx', async () => {
      // Start in Campaign A with no ctx.
      defaultProps.gameState = makeBaseState();
      const { result, rerender } = render();

      // Switch gameState to Campaign B which has a populated ctx.
      const campaignBState: GameState = {
        ...makeBaseState(),
        ctx: {
          episodeCheckpoints: ['B summary: the heroes met the king'],
          frozenRawHistory: 'B earlier events',
          frozenRawTokens: 42,
          frozenMessageCount: 3,
          turnCounter: 1,
          generation: 7,
        } as unknown as GameState['ctx'],
      };
      defaultProps.gameState = campaignBState;
      rerender();

      // Call resetContextState — should synchronously pick up B's ctx.
      act(() => {
        result.current.resetContextState();
      });

      // The proof that re-hydration occurred: trigger a handleSendMessage and
      // inspect the arguments passed to runAgentLoop (it receives frozen msgs
      // built from ctxRef via prepContext). We verify the frozen array reflects
      // Campaign B's checkpoint, not Campaign A's empty state.
      mockRunAgentLoop.mockClear();
      await act(async () => {
        await result.current.handleSendMessage('I look around');
      });

      expect(mockRunAgentLoop).toHaveBeenCalledTimes(1);
      const frozenArg = mockRunAgentLoop.mock.calls[0][2];
      // frozenArg is an array of { role, content }; Campaign B's checkpoint
      // is wrapped as `[RECENT SESSION]\nB summary...`.
      const frozenText = Array.isArray(frozenArg)
        ? frozenArg.map((m: { content?: string }) => m.content || '').join('\n')
        : '';
      expect(frozenText).toContain('B summary');
      expect(frozenText).toContain('B earlier events');
    });

    it('produces an empty frozen layer when gameState has no ctx (no bleed)', async () => {
      // Campaign A had ctx.
      defaultProps.gameState = {
        ...makeBaseState(),
        ctx: {
          episodeCheckpoints: ['A summary'],
          frozenRawHistory: 'A earlier events',
          frozenRawTokens: 99,
          frozenMessageCount: 5,
          turnCounter: 2,
          generation: 3,
        } as unknown as GameState['ctx'],
      };
      const { result, rerender } = render();

      // Switch to Campaign B with no ctx at all.
      defaultProps.gameState = makeBaseState();
      rerender();

      act(() => {
        result.current.resetContextState();
      });

      mockRunAgentLoop.mockClear();
      await act(async () => {
        await result.current.handleSendMessage('I do something');
      });

      expect(mockRunAgentLoop).toHaveBeenCalledTimes(1);
      const frozenArg = mockRunAgentLoop.mock.calls[0][2];
      // Frozen should NOT contain Campaign A's data.
      const frozenText = Array.isArray(frozenArg)
        ? frozenArg.map((m: { content?: string }) => m.content || '').join('\n')
        : '';
      expect(frozenText).not.toContain('A summary');
      expect(frozenText).not.toContain('A earlier events');
    });
  });

  it('handleSendMessage creates user message and calls generateNarration', async () => {
    mockGenerateNarration.mockResolvedValue({ text: 'The hero attacks!' });
    mockGenerateNarrationStream.mockReturnValue({
      promise: Promise.resolve('The hero attacks!'),
      cancel: vi.fn()
    });

    const { result } = render();
    const msgPromise = act(async () => {
      await result.current.handleSendMessage('I attack the goblin');
    });

    await msgPromise;

    expect(setMessages).toHaveBeenCalled();
    expect(setIsLoading).toHaveBeenCalledWith(true);
    expect(mockRunAgentLoop).toHaveBeenCalledTimes(1);
  });

  it('handleSendMessage blocks duplicate processing', async () => {
    const { result } = render();
    const msgPromise1 = act(async () => {
      await result.current.handleSendMessage('I attack');
    });
    const msgPromise2 = act(async () => {
      await result.current.handleSendMessage('I also attack');
    });

    await Promise.all([msgPromise1, msgPromise2]);
    expect(mockRunAgentLoop).toHaveBeenCalledTimes(1);
  });

  it('handleSendMessage syncs campaign state for authenticated users', async () => {
    const propsWithCampaign = {
      ...defaultProps,
      currentCampaignId: 'camp-1',
      userId: 'user-1',
    };

    const { result } = renderHook(() => useGameActions(
      propsWithCampaign.gameState, setGameState,
      propsWithCampaign.messages, setMessages,
      propsWithCampaign.currentCampaignId, propsWithCampaign.userId,
      propsWithCampaign.myCharacterId, propsWithCampaign.settings,
      setIsLoading, propsWithCampaign.onCloseLevelUp, syncState, performAtmosphereUpdate,
      setStage, setViewingCharacterId, setMyCharacterId,
      propsWithCampaign.isNewCampaign, propsWithCampaign.campaignName,
      setIsNewCampaign, getSenderName, propsWithCampaign.onTriggerDiceRoll,
    ));

    await act(async () => {
      await result.current.handleSendMessage('Hello');
    });

    expect(storageService.syncCampaignState).toHaveBeenCalled();
    expect(storageService.syncCampaignState).toHaveBeenCalledTimes(2);
    expect(setGameState).toHaveBeenCalled();
  });

  it('handleCharacterCreated joins party and sets stage', async () => {
    const char = makeBaseState().party[0];
    const { result } = render();

    await act(async () => {
      await result.current.handleCharacterCreated(char);
    });

    expect(mcpServerMock.joinParty).toHaveBeenCalledWith(char);
    expect(setMyCharacterId).toHaveBeenCalledWith(char.id);
    expect(setStage).toHaveBeenCalledWith(AppStage.PLAY);
  });

  it('handleCharacterCreated shows welcome message', async () => {
    const char = makeBaseState().party[0];
    const { result } = render();

    await act(async () => {
      await result.current.handleCharacterCreated(char);
    });

    expect(setMessages).toHaveBeenCalled();
    const setMessagesCall = vi.mocked(setMessages).mock.calls[0][0];
    expect(setMessagesCall[0].role).toBe(MessageRole.MODEL);
    expect(setMessagesCall[0].text).toContain('Greetings');
  });

  it('handleCharacterCreated persists via syncCampaignState for anonymous campaigns (no Supabase createCampaign)', async () => {
    const char = makeBaseState().party[0];
    defaultProps.currentCampaignId = 'anonymous';
    defaultProps.userId = undefined;
    defaultProps.isNewCampaign = true;
    const { result } = render();

    await act(async () => {
      await result.current.handleCharacterCreated(char);
    });

    expect(storageService.syncCampaignState).toHaveBeenCalledWith('anonymous', expect.anything(), expect.anything());
    expect(storageService.createCampaign).not.toHaveBeenCalled();
    expect(setIsNewCampaign).toHaveBeenCalledWith(false);

    // Reset for downstream tests
    defaultProps.currentCampaignId = undefined;
    defaultProps.userId = undefined;
    defaultProps.isNewCampaign = false;
  });

  it('handleRewind returns early when no snapshot and no user message', () => {
    mcpServerMock.loadRewindPoint.mockReturnValue(null);
    const { result } = render();
    act(() => { result.current.handleRewind(); });
    expect(syncState).not.toHaveBeenCalled();
  });

  it('handleRewind restores snapshot and reprocesses', async () => {
    const snapshot = {
      gameState: makeBaseState(),
      messages: [
        { id: 'user-msg', role: MessageRole.USER, text: 'Retry action', timestamp: 0 },
      ],
    };
    mcpServerMock.loadRewindPoint.mockReturnValue(snapshot);
    mcpServerMock.getFullState.mockReturnValue(makeBaseState());

    const { result } = render();

    await act(async () => {
      await result.current.handleRewind();
    });

    expect(mcpServerMock.restoreSnapshot).toHaveBeenCalledWith(snapshot.gameState);
  });

  it('handleRewind Branch A restores state from emergency snapshot when no rewind point', async () => {
    const baseState = makeBaseState();
    baseState.party[0].hp.current = 5;
    baseState.party[0].resources = [
      { id: 'sr1', name: 'Spell Slots', current: 1, max: 3, resetOn: 'long', source: 'class', sourceId: 'src1' },
    ];
    baseState.party[0].conditions = [
      { id: 'cond1', source: 'src1', duration: 60 },
    ];

    mcpServerMock.loadRewindPoint.mockReturnValue(null);
    mcpServerMock.loadEmergencySnapshot.mockReturnValue(deepClone(baseState));
    mcpServerMock.getFullState.mockReturnValue(baseState);

    defaultProps.messages = [{ id: 'user-msg', role: MessageRole.USER, text: 'Test action', timestamp: 0 }];
    const { result } = render();

    await act(async () => {
      await result.current.handleRewind();
    });

    expect(mcpServerMock.restoreSnapshot).toHaveBeenCalled();
    const restoredArg = mcpServerMock.restoreSnapshot.mock.calls[0][0];
    expect(restoredArg.party[0].hp.current).toBe(5);
    expect(restoredArg.party[0].resources).toEqual([
      { id: 'sr1', name: 'Spell Slots', current: 1, max: 3, resetOn: 'long', source: 'class', sourceId: 'src1' },
    ]);
    expect(restoredArg.party[0].conditions).toEqual([
      { id: 'cond1', source: 'src1', duration: 60 },
    ]);
  });

  it('handleRewind Branch A returns early when no user message and no snapshot', () => {
    mcpServerMock.loadRewindPoint.mockReturnValue(null);
    mcpServerMock.getFullState.mockReturnValue(makeBaseState());

    const { result } = render();

    act(() => { result.current.handleRewind(); });

    expect(mcpServerMock.restoreSnapshot).not.toHaveBeenCalled();
  });

  it('handleRewind Branch B preserves combat state from snapshot', async () => {
    const baseState = makeBaseState();
    const combatState: CombatState = {
      isActive: true,
      round: 2,
      turnIndex: 0,
      initiative: [
        { id: 'hero1', name: 'Hero', initiative: 18, type: 'player', isDead: false, hasActedThisTurn: false },
        { id: 'enemy1', name: 'Goblin', initiative: 10, type: 'enemy', isDead: false, hasActedThisTurn: false },
      ],
      enemies: [
        { id: 'enemy1', name: 'Goblin', ac: 13, hp: { current: 5, max: 7 }, attacks: [], isDead: false },
      ],
    };
    baseState.combat = combatState;

    const snapshot = {
      gameState: deepClone(baseState),
      messages: [
        { id: 'user-msg', role: MessageRole.USER, text: 'Attack goblin', timestamp: 0 },
      ],
    };
    mcpServerMock.loadRewindPoint.mockReturnValue(snapshot);
    mcpServerMock.getFullState.mockReturnValue(baseState);

    const { result } = render();

    await act(async () => {
      await result.current.handleRewind();
    });

    expect(mcpServerMock.restoreSnapshot).toHaveBeenCalledWith(snapshot.gameState);

    const setGameStateCalls = vi.mocked(setGameState).mock.calls;
    const lastSetState = setGameStateCalls[setGameStateCalls.length - 1][0];
    expect(lastSetState.combat).toBeDefined();
    expect(lastSetState.combat).toBeDefined();
    expect(lastSetState.combat.round).toBe(2);
  });

  it('handleRewind Branch B restores character fields (HP, resources, conditions)', async () => {
    const baseState = makeBaseState();
    baseState.party[0].hp.current = 7;
    baseState.party[0].tempHp = 3;
    baseState.party[0].resources = [
      { id: 'sr2', name: 'Spell Slots', current: 2, max: 3, resetOn: 'long', source: 'class', sourceId: 'src2' },
    ];
    baseState.party[0].conditions = [
      { id: 'cond2', source: 'src2', duration: 60 },
    ];
    baseState.party[0].reactionAvailable = false;
    baseState.party[0].raging = true;

    const snapshot = {
      gameState: deepClone(baseState),
      messages: [
        { id: 'user-msg', role: MessageRole.USER, text: 'Test action', timestamp: 0 },
      ],
    };
    mcpServerMock.loadRewindPoint.mockReturnValue(snapshot);
    mcpServerMock.getFullState.mockReturnValue(baseState);

    const { result } = render();

    await act(async () => {
      await result.current.handleRewind();
    });

    expect(mcpServerMock.restoreSnapshot).toHaveBeenCalled();

    const setGameStateCalls = vi.mocked(setGameState).mock.calls;
    const lastSetState = setGameStateCalls[setGameStateCalls.length - 1][0];
    const restoredChar = lastSetState.party[0];
    expect(restoredChar.hp.current).toBe(7);
    expect(restoredChar.tempHp).toBe(3);
    expect(restoredChar.resources).toEqual([
      { id: 'sr2', name: 'Spell Slots', current: 2, max: 3, resetOn: 'long', source: 'class', sourceId: 'src2' },
    ]);
    expect(restoredChar.conditions).toEqual([
      { id: 'cond2', source: 'src2', duration: 60 },
    ]);
    expect(restoredChar.reactionAvailable).toBe(false);
    expect(restoredChar.raging).toBe(true);
  });

  it('handleRewind calls stopSpeaking', async () => {
    const snapshot = {
      gameState: makeBaseState(),
      messages: [
        { id: 'user-msg', role: MessageRole.USER, text: 'Hi', timestamp: 0 },
      ],
    };
    mcpServerMock.loadRewindPoint.mockReturnValue(snapshot);
    mcpServerMock.getFullState.mockReturnValue(makeBaseState());

    const { result } = render();

    const { stopSpeaking } = await import('../../services/audioService');

    await act(async () => {
      await result.current.handleRewind();
    });

    expect(stopSpeaking).toHaveBeenCalled();
    expect(mcpServerMock.restoreSnapshot).toHaveBeenCalled();
  });

  it('handleRewind resets viewingCharacterId to myCharacterId', async () => {
    const snapshot = {
      gameState: makeBaseState(),
      messages: [
        { id: 'user-msg', role: MessageRole.USER, text: 'Test', timestamp: 0 },
      ],
    };
    mcpServerMock.loadRewindPoint.mockReturnValue(snapshot);
    mcpServerMock.getFullState.mockReturnValue(makeBaseState());

    const { result } = render();

    const setViewingCharacterId = vi.mocked(defaultProps.setViewingCharacterId);

    await act(async () => {
      await result.current.handleRewind();
    });

    expect(setViewingCharacterId).toHaveBeenCalledWith('hero-1');
  });

  it('handleRewind calls onCloseLevelUp', async () => {
    const snapshot = {
      gameState: makeBaseState(),
      messages: [
        { id: 'user-msg', role: MessageRole.USER, text: 'Test', timestamp: 0 },
      ],
    };
    mcpServerMock.loadRewindPoint.mockReturnValue(snapshot);
    mcpServerMock.getFullState.mockReturnValue(makeBaseState());

    const { result } = render();

    await act(async () => {
      await result.current.handleRewind();
    });

    expect(defaultProps.onCloseLevelUp).toHaveBeenCalled();
    expect(mcpServerMock.clearRewindPoint).toHaveBeenCalled();
  });

  it('handleRewind Branch A uses messagesRef instead of stale messages closure', async () => {
    const baseState = makeBaseState();
    mcpServerMock.loadRewindPoint.mockReturnValue(null);
    mcpServerMock.loadEmergencySnapshot.mockReturnValue(deepClone(baseState));
    mcpServerMock.getFullState.mockReturnValue(baseState);

    const messages = [
      { id: 'user-1', role: MessageRole.USER, text: 'Old message', timestamp: 0 },
    ];

    const { result } = renderHook(() => useGameActions(
      defaultProps.gameState, defaultProps.setGameState, messages, defaultProps.setMessages,
      defaultProps.currentCampaignId, defaultProps.userId, defaultProps.myCharacterId,
      defaultProps.settings, defaultProps.setIsLoading, defaultProps.onCloseLevelUp,
      defaultProps.syncState, defaultProps.performAtmosphereUpdate, defaultProps.setStage,
      defaultProps.setViewingCharacterId, defaultProps.setMyCharacterId,
      defaultProps.isNewCampaign, defaultProps.campaignName, defaultProps.setIsNewCampaign,
      defaultProps.getSenderName, undefined
    ));

    await act(async () => {
      await result.current.handleRewind();
    });

    expect(mcpServerMock.restoreSnapshot).toHaveBeenCalled();
    expect(mcpServerMock.clearRewindPoint).toHaveBeenCalled();
    expect(mcpServerMock.loadEmergencySnapshot).toHaveBeenCalled();
  });

  describe('handleUndo (pure undo — restores without re-sending)', () => {
    afterEach(() => {
      defaultProps.isNewCampaign = false;
    });

    it('handleUndo Branch B restores the snapshot but does NOT reprocess the message', async () => {
      const snapshot = {
        gameState: makeBaseState(),
        messages: [
          { id: 'user-msg', role: MessageRole.USER, text: 'I attack the goblin', timestamp: 0 },
        ],
      };
      mcpServerMock.loadRewindPoint.mockReturnValue(snapshot);
      mcpServerMock.getFullState.mockReturnValue(makeBaseState());

      const { result } = render();

      await act(async () => {
        await result.current.handleUndo();
      });

      expect(mcpServerMock.restoreSnapshot).toHaveBeenCalledWith(snapshot.gameState);
      expect(mcpServerMock.clearRewindPoint).toHaveBeenCalled();
      // The defining guarantee of pure undo: no retry, so the agent loop never runs.
      expect(mockRunAgentLoop).not.toHaveBeenCalled();
    });

    it('handleUndo Branch A restores from emergency snapshot without reprocessing', async () => {
      const baseState = makeBaseState();
      mcpServerMock.loadRewindPoint.mockReturnValue(null);
      mcpServerMock.loadEmergencySnapshot.mockReturnValue(deepClone(baseState));
      mcpServerMock.getFullState.mockReturnValue(baseState);
      defaultProps.messages = [{ id: 'user-msg', role: MessageRole.USER, text: 'I search the room', timestamp: 0 }];

      const { result } = render();

      await act(async () => {
        await result.current.handleUndo();
      });

      expect(mcpServerMock.restoreSnapshot).toHaveBeenCalled();
      expect(mockRunAgentLoop).not.toHaveBeenCalled();
    });

    it('handleUndo returns early when no snapshot and no user message', async () => {
      mcpServerMock.loadRewindPoint.mockReturnValue(null);
      mcpServerMock.loadEmergencySnapshot.mockReturnValue(null);
      defaultProps.messages = [];

      const { result } = render();

      await act(async () => {
        await result.current.handleUndo();
      });

      expect(mcpServerMock.restoreSnapshot).not.toHaveBeenCalled();
      expect(mockRunAgentLoop).not.toHaveBeenCalled();
    });
  });

  it('handleExecuteBatch returns early when queue is empty', async () => {
    const { result } = render();
    await act(async () => { await result.current.handleExecuteBatch(); });
    expect(setIsLoading).not.toHaveBeenCalled();
  });

  it('handleExecuteBatch processes queue when items exist', async () => {
    const stateWithQueue = {
      ...makeBaseState(),
      actionQueue: [
        { id: 'a1', playerId: 'p1', playerName: 'Player', text: 'I attack', type: 'action' as const, timestamp: 0 },
      ],
    };

    const { result } = renderHook(() => useGameActions(
      stateWithQueue, setGameState, [], setMessages,
      'camp-1', 'user-1', 'hero-1', defaultProps.settings,
      setIsLoading, onCloseLevelUp, syncState, performAtmosphereUpdate,
      setStage, setViewingCharacterId, setMyCharacterId,
      false, undefined, setIsNewCampaign, getSenderName, undefined,
    ));

    await act(async () => {
      await result.current.handleExecuteBatch();
    });

    expect(setIsLoading).toHaveBeenCalledWith(true);
    expect(mockRunAgentLoop).toHaveBeenCalled();
  });

  it('handleSendMessage rolls back on error', async () => {
    mockRunAgentLoop.mockRejectedValue(new Error('API failure'));

    const { result } = render();

    await act(async () => {
      await result.current.handleSendMessage('I attack');
    });

    expect(setIsLoading).toHaveBeenCalledWith(false);
  });
});
