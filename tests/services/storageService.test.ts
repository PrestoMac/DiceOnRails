import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameState } from '../../types';

interface MockChain {
  then: (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) => void;
  catch: (fn: (reason: unknown) => void) => MockChain;
  finally: (fn?: () => void) => MockChain;
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  or: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
}

interface MockChannel {
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
}

const LS_KEY = 'diceonrails_game_data';

let chainData: Record<string, unknown> = {};
let chainError: unknown = undefined;

function createChain() {
  chainData = {};
  chainError = undefined;
  
  const chain: any = {
    then(resolve: (value: unknown) => void, reject?: (reason: unknown) => void) {
      if (chainError instanceof Error) {
        if (reject) reject(chainError);
        return;
      }
      resolve({ data: chainData, error: chainError });
    },
    catch(fn: (reason: unknown) => void) {
      if (chainError instanceof Error) fn(chainError);
      return chain;
    },
    finally(_fn?: () => void) {
      return chain;
    },
  };
  const methods = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    or: vi.fn(() => chain),
    order: vi.fn(() => chain),
    single: vi.fn(() => {
      if (chainError) return Promise.reject(chainError);
      return Promise.resolve({ data: chainData, error: chainError });
    }),
    ilike: vi.fn(() => chain),
    maybeSingle: vi.fn(() => {
      if (chainError) return Promise.reject(chainError);
      return Promise.resolve({ data: chainData, error: chainError });
    }),
  };
  Object.assign(chain, methods);
  return chain as MockChain;
}

let mockChannelOn: ReturnType<typeof vi.fn>;
let mockChannelSubscribe: ReturnType<typeof vi.fn>;

vi.mock('../../services/supabaseClient', () => ({
  supabase: {
    channel: vi.fn(() => {
      const ch: MockChannel = {} as MockChannel;
      mockChannelOn = vi.fn(() => ch);
      mockChannelSubscribe = vi.fn();
      ch.on = mockChannelOn;
      ch.subscribe = mockChannelSubscribe;
      return ch;
    }),
    removeChannel: vi.fn(),
    from: vi.fn(),
  },
}));

vi.mock('../../utils/debug', () => ({
  isDebugMode: false,
}));

const { storageService } = await import('../../services/storageService');
import { supabase } from '../../services/supabaseClient';
import { AppStage } from '../../types';

describe('storageService', () => {
  let chain: MockChain;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    chain = createChain();
    
    vi.mocked(supabase.from).mockReturnValue(chain as any);
    vi.mocked(supabase.from).mockClear();
  });

  describe('subscribeToCampaign', () => {
    it('subscribes to postgres changes and returns unsubscribe', () => {
      const onUpdate = vi.fn();
      const unsub = storageService.subscribeToCampaign('camp-1', onUpdate);
      expect(typeof unsub).toBe('function');
      expect(mockChannelOn).toHaveBeenCalled();
      expect(mockChannelSubscribe).toHaveBeenCalled();

      unsub();
      expect(supabase.removeChannel).toHaveBeenCalled();
    });
  });

  describe('syncCampaignState', () => {
    it('updates campaign with gameState and messages', async () => {
      await storageService.syncCampaignState('camp-1', { party: [] } as unknown as GameState, []);
      await vi.waitFor(() => {
        expect(chain.update).toHaveBeenCalledWith({
          game_state: { party: [], _rewindGeneration: expect.any(Number) },
          messages: [],
        });
      });
    });

    it('tags payload with the current rewind generation', async () => {
      const { resetRewindGeneration, bumpRewindGeneration, getRewindGeneration } = await import('../../services/rewindGeneration');
      resetRewindGeneration();
      bumpRewindGeneration();
      bumpRewindGeneration();
      const expectedGen = getRewindGeneration();
      await storageService.syncCampaignState('camp-1', { party: [] } as unknown as GameState);
      await vi.waitFor(() => {
        expect(chain.update).toHaveBeenCalledWith({
          game_state: { party: [], _rewindGeneration: expectedGen },
        });
      });
      resetRewindGeneration();
    });

    it('does not propagate supabase errors (fire-and-forget)', async () => {
      chainError = new Error('Network error');

      await expect(storageService.syncCampaignState('bad', {} as unknown as GameState)).resolves.toBeUndefined();
    });
  });

  describe('createCampaign', () => {
    it('creates a campaign and returns the id', async () => {
      chain.single.mockResolvedValue({ data: { id: 'new-camp' }, error: null });

      const result = await storageService.createCampaign('user-1', 'Test Campaign', {} as unknown as GameState);
      expect(result.campaignId).toBe('new-camp');
    });

    it('returns error on insert failure', async () => {
      chain.single.mockResolvedValue({ data: null, error: { message: 'Insert failed' } });

      const result = await storageService.createCampaign('user-1', 'Fail', {} as unknown as GameState);
      expect(result.error).toBe('Insert failed');
    });

    it('handles thrown errors in createCampaign', async () => {
      chain.single.mockRejectedValue(new Error('Unexpected error'));

      const result = await storageService.createCampaign('user-1', 'Crash', {} as unknown as GameState);
      expect(result.error).toBe('Unexpected error');
    });
  });

  describe('loadCampaigns', () => {
    it('returns empty array when no userId', async () => {
      const result = await storageService.loadCampaigns();
      expect(result.campaigns).toEqual([]);
    });

    it('loads combined campaigns and legacy saves', async () => {
      chainData = [
        { id: 'c1', name: 'New Camp', created_at: '2024-01-01', game_state: { party: [{ name: 'Hero' }] } },
      ] as unknown as Record<string, unknown>;

      const result = await storageService.loadCampaigns('user-1');
      expect(result.campaigns).toBeDefined();
      const campaigns = result.campaigns as unknown[];
      expect(campaigns.length).toBeGreaterThan(0);
    });

    it('returns error on supabase failure', async () => {
      chain.order.mockRejectedValue(new Error('DB connection failed'));

      const result = await storageService.loadCampaigns('user-1');
      expect(result.error).toBe('DB connection failed');
    });
  });

  describe('loadGame with localStorage (anonymous)', () => {
    it('returns data from localStorage when no userId', async () => {
      const fakeData = { version: '1.0', gameState: { party: [] } };
      localStorage.setItem(LS_KEY, JSON.stringify(fakeData));

      const result = await storageService.loadGame();
      expect(result.data).toEqual(fakeData);
    });

    it('returns undefined when no localStorage data', async () => {
      const result = await storageService.loadGame();
      expect(result.data).toBeUndefined();
    });

    it('returns error on corrupt localStorage', async () => {
      localStorage.setItem(LS_KEY, 'not-json');

      const result = await storageService.loadGame();
      expect(result.error).toBe('Failed to parse local save');
    });
  });

  describe('saveGame', () => {
    it('saves to localStorage for anonymous users', async () => {
      const data = { version: '1.0', campaignId: 'anon', gameState: {} as unknown as GameState, messages: [], stage: AppStage.PLAY, timestamp: 0 };
      await storageService.saveGame(data);
      expect(localStorage.getItem(LS_KEY)).toBeTruthy();
    });

    it('syncs to supabase for authenticated users', async () => {
      chain.eq.mockResolvedValue({ error: null });

      const data = { version: '2.0', campaignId: 'camp-1', gameState: { party: [] } as unknown as GameState, messages: [], stage: AppStage.PLAY, timestamp: 0 };
      const result = await storageService.saveGame(data, 'user-1', 'camp-1');
      expect(result.error).toBeUndefined();
    });

    it('returns undefined error when supabase sync fails (fire-and-forget)', async () => {
      chain.eq.mockRejectedValue(new Error('Sync failed'));

      const data = { version: '2.0', campaignId: 'camp-1', gameState: {} as unknown as GameState, messages: [], stage: AppStage.PLAY, timestamp: 0 };
      const result = await storageService.saveGame(data, 'user-1', 'camp-1');
      expect(result.error).toBeUndefined();
    });
  });

  describe('deleteCampaign and clearLocalSave', () => {
    it('deletes from localStorage for anonymous', async () => {
      localStorage.setItem(LS_KEY, 'data');
      await storageService.deleteCampaign();
      expect(localStorage.getItem(LS_KEY)).toBeNull();
    });

    it('deletes from supabase for authenticated', async () => {
      const result = await storageService.deleteCampaign('user-1', 'camp-1');
      expect(result.error).toBeUndefined();
    });

    it('handles supabase delete errors', async () => {
      chainError = { message: 'Delete denied' };

      const result = await storageService.deleteCampaign('user-1', 'camp-1');
      expect(result.error).toBe('Delete denied');
    });
  });

  describe('renameCampaign', () => {
    it('renames a campaign', async () => {
      const result = await storageService.renameCampaign('user-1', 'camp-1', 'New Name');
      expect(result.error).toBeUndefined();
    });

    it('handles rename errors', async () => {
      chainError = { message: 'Rename failed' };

      const result = await storageService.renameCampaign('user-1', 'camp-1', 'New Name');
      expect(result.error).toBe('Rename failed');
    });
  });
});
