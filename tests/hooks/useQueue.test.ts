import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { GameState, QueuedAction } from '../../types';

const mcpServerMock = {
  getTarget: vi.fn(),
  loadState: vi.fn(),
};

vi.mock('../../services/mcpService', () => ({
  mcpServer: mcpServerMock,
}));

vi.mock('../../services/storageService', () => ({
  storageService: {
    syncCampaignState: vi.fn().mockResolvedValue(undefined),
  },
}));

const { useQueue } = await import('../../hooks/useQueue');

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    party: [{
      id: 'char-1', name: 'Aragorn', class: 'Fighter', level: 1,
      hp: { current: 10, max: 10 },
      stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      inventory: [], currency: { gp: 0, sp: 0, cp: 0 },
      location: '', experience: 0, experienceToNextLevel: 300,
      unusedStatPoints: 0, maxHpBonus: 0, hitDice: { current: 1, max: 1 },
    }],
    worldDescription: '',
    sessionLogs: [], quests: [], lore: [], actionQueue: [],
    ...overrides,
  } as GameState;
}

function makeQueueItem(overrides: Partial<QueuedAction> = {}): QueuedAction {
  return {
    id: 'q-1', playerId: 'user-1', playerName: 'Aragorn',
    text: 'Hello', type: 'dialogue', timestamp: 1000,
    ...overrides,
  } as QueuedAction;
}

describe('useQueue', () => {
  const setGameState = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('Initial state', () => {
    it('queueNotification is null on mount', () => {
      const { result } = renderHook(() => useQueue(makeState(), setGameState, undefined, undefined, null));
      expect(result.current.queueNotification).toBeNull();
    });

    it('Returns all handler functions', () => {
      const { result } = renderHook(() => useQueue(makeState(), setGameState, undefined, undefined, null));
      expect(result.current.handleEnqueueAction).toBeDefined();
      expect(result.current.handleRemoveQueueItem).toBeDefined();
      expect(result.current.handleUpdateQueueItem).toBeDefined();
      expect(result.current.handleReorderQueue).toBeDefined();
      expect(result.current.getSenderName).toBeDefined();
    });
  });

  describe('handleEnqueueAction', () => {
    it('Adds item with correct shape', async () => {
      vi.stubGlobal('crypto', { randomUUID: vi.fn().mockReturnValue('test-uuid') });
      vi.stubGlobal('Date', { now: () => 5000 });

      const state = makeState();
      const { result } = renderHook(() => useQueue(state, setGameState, undefined, undefined, null));

      await act(async () => {
        await result.current.handleEnqueueAction('Hello', 'dialogue');
      });

      expect(setGameState).toHaveBeenCalledWith(expect.objectContaining({
        actionQueue: [expect.objectContaining({
          id: 'test-uuid',
          playerId: 'anonymous',
          playerName: 'You',
          text: 'Hello',
          type: 'dialogue',
          timestamp: 5000,
        })],
      }));
    });

    it('Appends to existing queue', async () => {
      const existingItem = makeQueueItem({ id: 'existing-1', text: 'First' });
      const state = makeState({ actionQueue: [existingItem] });
      const { result } = renderHook(() => useQueue(state, setGameState, undefined, undefined, null));

      await act(async () => {
        await result.current.handleEnqueueAction('Second', 'action');
      });

      const call = vi.mocked(setGameState).mock.calls[0][0];
      expect(call.actionQueue).toHaveLength(2);
      expect(call.actionQueue[0].id).toBe('existing-1');
      expect(call.actionQueue[1].text).toBe('Second');
    });

    it('Uses "anonymous" when userId is undefined', async () => {
      const { result } = renderHook(() => useQueue(makeState(), setGameState, undefined, undefined, null));

      await act(async () => {
        await result.current.handleEnqueueAction('Test', 'action');
      });

      const call = vi.mocked(setGameState).mock.calls[0][0];
      expect(call.actionQueue[0].playerId).toBe('anonymous');
    });

    it('Calls applyUpdate (setGameState + loadState + syncCampaignState)', async () => {
      const { result } = renderHook(() => useQueue(makeState(), setGameState, 'camp-1', 'user-1', null));

      await act(async () => {
        await result.current.handleEnqueueAction('Test', 'action');
      });

      expect(setGameState).toHaveBeenCalledTimes(1);
      expect(mcpServerMock.loadState).toHaveBeenCalledTimes(1);
      expect(mcpServerMock.loadState).toHaveBeenCalledWith(expect.objectContaining({
        actionQueue: expect.arrayContaining([expect.objectContaining({ text: 'Test' })]),
      }));
    });
  });

  describe('handleRemoveQueueItem', () => {
    it('Removes correct item by ID, keeps others', async () => {
      const items: QueuedAction[] = [
        makeQueueItem({ id: 'q-1', text: 'A' }),
        makeQueueItem({ id: 'q-2', text: 'B' }),
        makeQueueItem({ id: 'q-3', text: 'C' }),
      ];
      const state = makeState({ actionQueue: items });
      const { result } = renderHook(() => useQueue(state, setGameState, undefined, undefined, null));

      await act(async () => {
        await result.current.handleRemoveQueueItem('q-2');
      });

      const call = vi.mocked(setGameState).mock.calls[0][0];
      expect(call.actionQueue).toHaveLength(2);
      expect(call.actionQueue.map((i: QueuedAction) => i.id)).toEqual(['q-1', 'q-3']);
    });

    it('Keeps other items unchanged', async () => {
      const items: QueuedAction[] = [
        makeQueueItem({ id: 'q-1', text: 'Alpha' }),
        makeQueueItem({ id: 'q-2', text: 'Beta' }),
      ];
      const state = makeState({ actionQueue: items });
      const { result } = renderHook(() => useQueue(state, setGameState, undefined, undefined, null));

      await act(async () => {
        await result.current.handleRemoveQueueItem('q-1');
      });

      const call = vi.mocked(setGameState).mock.calls[0][0];
      expect(call.actionQueue).toHaveLength(1);
      expect(call.actionQueue[0].id).toBe('q-2');
      expect(call.actionQueue[0].text).toBe('Beta');
    });

    it('Empty array when removing last item', async () => {
      const state = makeState({ actionQueue: [makeQueueItem()] });
      const { result } = renderHook(() => useQueue(state, setGameState, undefined, undefined, null));

      await act(async () => {
        await result.current.handleRemoveQueueItem('q-1');
      });

      const call = vi.mocked(setGameState).mock.calls[0][0];
      expect(call.actionQueue).toEqual([]);
    });

    it('No-ops when ID not found', async () => {
      const items: QueuedAction[] = [makeQueueItem({ id: 'q-1' })];
      const state = makeState({ actionQueue: items });
      const { result } = renderHook(() => useQueue(state, setGameState, undefined, undefined, null));

      await act(async () => {
        await result.current.handleRemoveQueueItem('non-existent');
      });

      const call = vi.mocked(setGameState).mock.calls[0][0];
      expect(call.actionQueue).toHaveLength(1);
      expect(call.actionQueue[0].id).toBe('q-1');
    });
  });

  describe('handleUpdateQueueItem', () => {
    it('Updates text only, preserves other fields', async () => {
      const items: QueuedAction[] = [makeQueueItem({
        id: 'q-1', text: 'Hello', type: 'action', timestamp: 100,
      })];
      const state = makeState({ actionQueue: items });
      const { result } = renderHook(() => useQueue(state, setGameState, undefined, undefined, null));

      await act(async () => {
        await result.current.handleUpdateQueueItem('q-1', 'Updated Text');
      });

      const call = vi.mocked(setGameState).mock.calls[0][0];
      const updated = call.actionQueue[0];
      expect(updated.text).toBe('Updated Text');
      expect(updated.id).toBe('q-1');
      expect(updated.type).toBe('action');
      expect(updated.timestamp).toBe(100);
    });

    it('No-ops on non-existent ID', async () => {
      const items: QueuedAction[] = [makeQueueItem({ id: 'q-1', text: 'Hello' })];
      const state = makeState({ actionQueue: items });
      const { result } = renderHook(() => useQueue(state, setGameState, undefined, undefined, null));

      await act(async () => {
        await result.current.handleUpdateQueueItem('non-existent', 'New Text');
      });

      const call = vi.mocked(setGameState).mock.calls[0][0];
      expect(call.actionQueue[0].text).toBe('Hello');
    });

    it('Preserves array order', async () => {
      const items: QueuedAction[] = [
        makeQueueItem({ id: 'q-1', text: 'A' }),
        makeQueueItem({ id: 'q-2', text: 'B' }),
        makeQueueItem({ id: 'q-3', text: 'C' }),
      ];
      const state = makeState({ actionQueue: items });
      const { result } = renderHook(() => useQueue(state, setGameState, undefined, undefined, null));

      await act(async () => {
        await result.current.handleUpdateQueueItem('q-2', 'Updated');
      });

      const call = vi.mocked(setGameState).mock.calls[0][0];
      expect(call.actionQueue.map((i: QueuedAction) => i.id)).toEqual(['q-1', 'q-2', 'q-3']);
      expect(call.actionQueue.map((i: QueuedAction) => i.text)).toEqual(['A', 'Updated', 'C']);
    });
  });

  describe('handleReorderQueue', () => {
    it('Replaces entire queue (new items in, old out)', async () => {
      const oldItems: QueuedAction[] = [makeQueueItem({ id: 'q-1' })];
      const newItems: QueuedAction[] = [makeQueueItem({ id: 'q-new', text: 'New' })];
      const state = makeState({ actionQueue: oldItems });
      const { result } = renderHook(() => useQueue(state, setGameState, undefined, undefined, null));

      await act(async () => {
        await result.current.handleReorderQueue(newItems);
      });

      const call = vi.mocked(setGameState).mock.calls[0][0];
      expect(call.actionQueue).toEqual(newItems);
    });

    it('Accepts empty array (clearing)', async () => {
      const state = makeState({ actionQueue: [makeQueueItem()] });
      const { result } = renderHook(() => useQueue(state, setGameState, undefined, undefined, null));

      await act(async () => {
        await result.current.handleReorderQueue([]);
      });

      const call = vi.mocked(setGameState).mock.calls[0][0];
      expect(call.actionQueue).toEqual([]);
    });

    it('Accepts reordered same items', async () => {
      const items: QueuedAction[] = [
        makeQueueItem({ id: 'q-1', text: 'A' }),
        makeQueueItem({ id: 'q-2', text: 'B' }),
      ];
      const state = makeState({ actionQueue: items });
      const { result } = renderHook(() => useQueue(state, setGameState, undefined, undefined, null));

      await act(async () => {
        await result.current.handleReorderQueue([items[1], items[0]]);
      });

      const call = vi.mocked(setGameState).mock.calls[0][0];
      expect(call.actionQueue[0].id).toBe('q-2');
      expect(call.actionQueue[1].id).toBe('q-1');
    });
  });

  describe('getSenderName', () => {
    it('Returns character name when matched', () => {
      mcpServerMock.getTarget.mockReturnValue({ name: 'Aragorn' });
      const state = makeState();
      const { result } = renderHook(() => useQueue(state, setGameState, undefined, undefined, 'char-1'));
      expect(result.current.getSenderName()).toBe('Aragorn');
    });

    it('Returns "You" when myCharacterId is null', () => {
      const { result } = renderHook(() => useQueue(makeState(), setGameState, undefined, undefined, null));
      expect(result.current.getSenderName()).toBe('You');
    });

    it('Returns "You" when party is undefined', () => {
      const state = { ...makeState(), party: undefined } as GameState;
      const { result } = renderHook(() => useQueue(state, setGameState, undefined, undefined, 'char-1'));
      expect(result.current.getSenderName()).toBe('You');
    });

    it('Returns "You" when getTarget returns undefined', () => {
      mcpServerMock.getTarget.mockReturnValue(undefined);
      const state = makeState();
      const { result } = renderHook(() => useQueue(state, setGameState, undefined, undefined, 'char-1'));
      expect(result.current.getSenderName()).toBe('You');
    });

    it('Calls mcpServer.getTarget with myCharacterId', () => {
      mcpServerMock.getTarget.mockReturnValue({ name: 'Aragorn' });
      const state = makeState();
      const { result } = renderHook(() => useQueue(state, setGameState, undefined, undefined, 'char-1'));
      result.current.getSenderName();
      expect(mcpServerMock.getTarget).toHaveBeenCalledWith('char-1');
    });

    it('Non-existent myCharacterId returns "You"', () => {
      mcpServerMock.getTarget.mockReturnValue(undefined);
      const state = makeState({ party: [] });
      const { result } = renderHook(() => useQueue(state, setGameState, undefined, undefined, 'nonexistent'));
      expect(result.current.getSenderName()).toBe('You');
    });
  });

  describe('Queue notification', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('Shows notification on length increase (+1)', () => {
      const { rerender, result } = renderHook(
        ({ gs }: { gs: GameState }) => useQueue(gs, setGameState, undefined, undefined, null),
        { initialProps: { gs: makeState() } },
      );

      rerender({ gs: makeState({ actionQueue: [makeQueueItem()] }) });

      expect(result.current.queueNotification).toBe('New item added to Action Queue!');
    });

    it('Pluralized notification on increase >1', () => {
      const { rerender, result } = renderHook(
        ({ gs }: { gs: GameState }) => useQueue(gs, setGameState, undefined, undefined, null),
        { initialProps: { gs: makeState() } },
      );

      rerender({
        gs: makeState({
          actionQueue: [makeQueueItem({ id: 'q-1' }), makeQueueItem({ id: 'q-2' })],
        }),
      });

      expect(result.current.queueNotification).toBe('2 new items added to Action Queue!');
    });

    it('Auto-clears after 3000ms (boundary test at 2999 and 3000)', () => {
      const { rerender, result } = renderHook(
        ({ gs }: { gs: GameState }) => useQueue(gs, setGameState, undefined, undefined, null),
        { initialProps: { gs: makeState() } },
      );

      rerender({ gs: makeState({ actionQueue: [makeQueueItem()] }) });
      expect(result.current.queueNotification).toBe('New item added to Action Queue!');

      act(() => { vi.advanceTimersByTime(2999); });
      expect(result.current.queueNotification).toBe('New item added to Action Queue!');

      act(() => { vi.advanceTimersByTime(1); });
      expect(result.current.queueNotification).toBeNull();
    });

    it('Resets timer on rapid additions', () => {
      const { rerender, result } = renderHook(
        ({ gs }: { gs: GameState }) => useQueue(gs, setGameState, undefined, undefined, null),
        { initialProps: { gs: makeState() } },
      );

      rerender({ gs: makeState({ actionQueue: [makeQueueItem({ id: 'q-1' })] }) });
      expect(result.current.queueNotification).toBe('New item added to Action Queue!');

      act(() => { vi.advanceTimersByTime(2000); });
      expect(result.current.queueNotification).toBe('New item added to Action Queue!');

      rerender({
        gs: makeState({
          actionQueue: [makeQueueItem({ id: 'q-1' }), makeQueueItem({ id: 'q-2' })],
        }),
      });






      act(() => { vi.advanceTimersByTime(1000); });


      expect(result.current.queueNotification).toBe('New item added to Action Queue!');

      act(() => { vi.advanceTimersByTime(1999); });
      expect(result.current.queueNotification).toBe('New item added to Action Queue!');

      act(() => { vi.advanceTimersByTime(1); });
      expect(result.current.queueNotification).toBeNull();
    });

    it('No notification on length decrease', () => {
      const { rerender, result } = renderHook(
        ({ gs }: { gs: GameState }) => useQueue(gs, setGameState, undefined, undefined, null),
        { initialProps: { gs: makeState() } },
      );

      rerender({ gs: makeState({ actionQueue: [makeQueueItem({ id: 'q-1' }), makeQueueItem({ id: 'q-2' })] }) });
      expect(result.current.queueNotification).toBe('2 new items added to Action Queue!');

      rerender({ gs: makeState({ actionQueue: [makeQueueItem({ id: 'q-1' })] }) });

      expect(result.current.queueNotification).toBe('2 new items added to Action Queue!');
    });
  });

  describe('applyUpdate', () => {
    it('Calls setGameState and mcpServer.loadState', async () => {
      const { result } = renderHook(() => useQueue(makeState(), setGameState, undefined, undefined, null));

      await act(async () => {
        await result.current.handleEnqueueAction('Test', 'action');
      });

      expect(setGameState).toHaveBeenCalledTimes(1);
      expect(mcpServerMock.loadState).toHaveBeenCalledTimes(1);
    });

    it('Calls syncCampaignState when authenticated', async () => {
      const { result } = renderHook(() => useQueue(makeState(), setGameState, 'camp-1', 'user-1', null));

      await act(async () => {
        await result.current.handleEnqueueAction('Test', 'action');
      });

      const { storageService } = await import('../../services/storageService');
      expect(storageService.syncCampaignState).toHaveBeenCalledTimes(1);
      expect(storageService.syncCampaignState).toHaveBeenCalledWith('camp-1', expect.anything());
    });

    it('Skips syncCampaignState when campaignId is undefined', async () => {
      const { result } = renderHook(() => useQueue(makeState(), setGameState, undefined, 'user-1', null));

      await act(async () => {
        await result.current.handleEnqueueAction('Test', 'action');
      });

      const { storageService } = await import('../../services/storageService');
      expect(storageService.syncCampaignState).not.toHaveBeenCalled();
    });

    it('Persists via syncCampaignState when campaignId is "anonymous" (localStorage routing)', async () => {
      const { result } = renderHook(() => useQueue(makeState(), setGameState, 'anonymous', 'user-1', null));

      await act(async () => {
        await result.current.handleEnqueueAction('Test', 'action');
      });

      const { storageService } = await import('../../services/storageService');
      expect(storageService.syncCampaignState).toHaveBeenCalledTimes(1);
      expect(storageService.syncCampaignState).toHaveBeenCalledWith('anonymous', expect.anything());
    });

    it('Passes correct state through all three calls', async () => {
      const { result } = renderHook(() => useQueue(makeState(), setGameState, 'camp-1', 'user-1', null));

      await act(async () => {
        await result.current.handleEnqueueAction('Shared State', 'action');
      });

      expect(setGameState).toHaveBeenCalledTimes(1);
      expect(mcpServerMock.loadState).toHaveBeenCalledTimes(1);

      const { storageService } = await import('../../services/storageService');
      expect(storageService.syncCampaignState).toHaveBeenCalledTimes(1);

      const setGameStateArg = vi.mocked(setGameState).mock.calls[0][0];
      const loadStateArg = mcpServerMock.loadState.mock.calls[0][0];
      const syncArg = storageService.syncCampaignState.mock.calls[0][1];

      expect(loadStateArg).toBe(setGameStateArg);
      expect(syncArg).toBe(setGameStateArg);
    });
  });

  describe('Edge cases', () => {
    it('handleRemoveQueueItem on empty queue', async () => {
      const state = makeState();
      const { result } = renderHook(() => useQueue(state, setGameState, undefined, undefined, null));

      await act(async () => {
        await result.current.handleRemoveQueueItem('any-id');
      });

      const call = vi.mocked(setGameState).mock.calls[0][0];
      expect(call.actionQueue).toEqual([]);
    });

    it('handleUpdateQueueItem on empty queue', async () => {
      const state = makeState();
      const { result } = renderHook(() => useQueue(state, setGameState, undefined, undefined, null));

      await act(async () => {
        await result.current.handleUpdateQueueItem('any-id', 'text');
      });

      const call = vi.mocked(setGameState).mock.calls[0][0];
      expect(call.actionQueue).toEqual([]);
    });

    it('handleEnqueueAction with undefined actionQueue', async () => {
      const state = makeState({ actionQueue: undefined as unknown as QueuedAction[] });
      const { result } = renderHook(() => useQueue(state, setGameState, undefined, undefined, null));

      await act(async () => {
        await result.current.handleEnqueueAction('Test', 'action');
      });

      const call = vi.mocked(setGameState).mock.calls[0][0];
      expect(call.actionQueue).toHaveLength(1);
      expect(call.actionQueue[0].text).toBe('Test');
    });
  });
});
