import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AppStage } from '../../types';

const mockReset = vi.fn();
const mockGetFullState = vi.fn();
const mockLoadState = vi.fn();
const mockSaveRewindPoint = vi.fn();
const mockUpdateInventoryDirectly = vi.fn();
const mockUpdateCurrencyDirectly = vi.fn();
const mockSetAtmosphere = vi.fn();
const mockGetCachedLocationImage = vi.fn(() => undefined);
const mockCacheLocationImage = vi.fn();

vi.mock('../../services/mcpService', () => ({
  mcpServer: {
    reset: mockReset,
    getFullState: mockGetFullState,
    loadState: mockLoadState,
    saveRewindPoint: mockSaveRewindPoint,
    updateInventoryDirectly: mockUpdateInventoryDirectly,
    updateCurrencyDirectly: mockUpdateCurrencyDirectly,
    setAtmosphere: mockSetAtmosphere,
    getCachedLocationImage: mockGetCachedLocationImage,
    cacheLocationImage: mockCacheLocationImage,
  },
}));

const mockLoadGame = vi.fn();
const mockSaveGame = vi.fn();
const mockClearLocalSave = vi.fn();
const mockSyncCampaignState = vi.fn();
const mockSubscribeToCampaign = vi.fn(() => () => {});

vi.mock('../../services/storageService', () => ({
  storageService: {
    loadGame: mockLoadGame,
    saveGame: mockSaveGame,
    clearLocalSave: mockClearLocalSave,
    syncCampaignState: mockSyncCampaignState,
    subscribeToCampaign: mockSubscribeToCampaign,
  },
}));

vi.mock('../../services/llm', () => ({
  generateAtmosphere: vi.fn(),
}));

vi.mock('../../utils/debug', () => ({
  isDebugMode: false,
}));

const { useGameState } = await import('../../hooks/useGameState');
import { generateAtmosphere } from '../../services/llm';

describe('useGameState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFullState.mockReturnValue({
      party: [], worldDescription: 'Initial', sessionLogs: [],
      quests: [], lore: [], actionQueue: [], isProcessing: false,
    });
  });

  it('initializes with AUTH stage and empty messages', () => {
    const { result } = renderHook(() => useGameState(undefined));
    expect(result.current.stage).toBe(AppStage.AUTH);
    expect(result.current.messages).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('loadGameData loads from storage and sets state', async () => {
    mockLoadGame.mockResolvedValue({
      data: {
        campaignName: 'Test Camp',
        messages: [],
        gameState: { party: [], worldDescription: 'Loaded', sessionLogs: [], quests: [], lore: [], actionQueue: [] },
        stage: AppStage.PLAY,
      },
      error: null,
    });

    const { result } = renderHook(() => useGameState(undefined));

    await act(async () => {
      await result.current.loadGameData(undefined, 'camp-1');
    });

    expect(mockLoadGame).toHaveBeenCalledWith(undefined, 'camp-1');
    expect(result.current.campaignName).toBe('Test Camp');
  });

  it('loadGameData shows alert on error', async () => {
    const alertMock = vi.fn();
    vi.stubGlobal('alert', alertMock);
    mockLoadGame.mockResolvedValue({ data: null, error: 'Load failed' });

    const { result } = renderHook(() => useGameState(undefined));

    await act(async () => {
      await result.current.loadGameData('user-1', 'camp-1');
    });

    expect(alertMock).toHaveBeenCalledWith(expect.stringContaining('Load failed'));
    vi.unstubAllGlobals();
  });

  it('loadGameData advances first-time anonymous users to CREATION when no save exists', async () => {
    mockLoadGame.mockResolvedValue({ data: undefined });

    const { result } = renderHook(() => useGameState(undefined));

    await act(async () => {
      await result.current.loadGameData(undefined, 'anonymous');
    });

    expect(result.current.stage).toBe(AppStage.CREATION);
    expect(result.current.isNewCampaign).toBe(true);
  });

  it('loadGameData does NOT advance to CREATION for missing data on non-anonymous campaigns (preserves existing behavior)', async () => {
    mockLoadGame.mockResolvedValue({ data: undefined });

    const { result } = renderHook(() => useGameState(undefined));

    await act(async () => {
      await result.current.loadGameData('user-1', 'camp-1');
    });

    // Authenticated users with no save should not be auto-advanced; they stay on AUTH
    // and rely on the dashboard / campaign-creation flow instead.
    expect(result.current.stage).toBe(AppStage.AUTH);
    expect(result.current.isNewCampaign).toBe(false);
  });

  it('resetGame resets mcpServer and goes to CREATION', async () => {
    mockGetFullState.mockReturnValue({
      party: [], worldDescription: 'Reset', sessionLogs: [],
      quests: [], lore: [], actionQueue: [],
    });

    const { result } = renderHook(() => useGameState('user-1'));

    await act(async () => {
      await result.current.resetGame();
    });

    expect(mockReset).toHaveBeenCalled();
    expect(result.current.stage).toBe(AppStage.CREATION);
    expect(result.current.messages).toEqual([]);
  });

  it('resetGame clears local save for anonymous users', async () => {
    mockGetFullState.mockReturnValue({
      party: [], worldDescription: 'Reset', sessionLogs: [],
      quests: [], lore: [], actionQueue: [],
    });

    const { result } = renderHook(() => useGameState(undefined));

    await act(async () => {
      await result.current.resetGame();
    });

    expect(mockClearLocalSave).toHaveBeenCalled();
    expect(mockReset).toHaveBeenCalled();
    expect(result.current.stage).toBe(AppStage.CREATION);
  });

  it('syncState calls setGameState with mcpServer state', () => {
    mockGetFullState.mockReturnValue({
      party: [], worldDescription: 'Synced', sessionLogs: [],
      quests: [], lore: [], actionQueue: [],
    });

    const { result } = renderHook(() => useGameState(undefined));

    act(() => {
      result.current.syncState();
    });

    expect(result.current.gameState.worldDescription).toBe('Synced');
  });

  it('handleUpdateInventory updates inventory and syncs', () => {
    mockGetFullState.mockReturnValue({
      party: [], worldDescription: 'test', sessionLogs: [],
      quests: [], lore: [], actionQueue: [],
    });

    const { result } = renderHook(() => useGameState(undefined));
    const newInv = [{ name: 'Sword', quantity: 1 }];

    act(() => {
      result.current.handleUpdateInventory(newInv);
    });

    expect(mockUpdateInventoryDirectly).toHaveBeenCalledWith(newInv);
    expect(mockGetFullState).toHaveBeenCalled();
  });

  it('handleUpdateInventory persists for anonymous campaigns via syncCampaignState', async () => {
    mockGetFullState.mockReturnValue({
      party: [], worldDescription: 'test', sessionLogs: [],
      quests: [], lore: [], actionQueue: [],
    });

    const { result } = renderHook(() => useGameState(undefined));
    act(() => { result.current.setCurrentCampaignId('anonymous'); });

    await act(async () => {
      await result.current.handleUpdateInventory([{ name: 'Sword', quantity: 1 }]);
    });

    expect(mockSyncCampaignState).toHaveBeenCalledWith('anonymous', expect.anything());
  });

  it('handleUpdateCurrency persists for anonymous campaigns via syncCampaignState', async () => {
    mockGetFullState.mockReturnValue({
      party: [], worldDescription: 'test', sessionLogs: [],
      quests: [], lore: [], actionQueue: [],
    });

    const { result } = renderHook(() => useGameState(undefined));
    act(() => { result.current.setCurrentCampaignId('anonymous'); });

    await act(async () => {
      await result.current.handleUpdateCurrency({ gp: 50, sp: 0, cp: 0 });
    });

    expect(mockSyncCampaignState).toHaveBeenCalledWith('anonymous', expect.anything());
  });

  it('handleUpdateCurrency updates currency and syncs', () => {
    mockGetFullState.mockReturnValue({
      party: [], worldDescription: 'test', sessionLogs: [],
      quests: [], lore: [], actionQueue: [],
    });

    const { result } = renderHook(() => useGameState(undefined));
    const newCurrency = { gp: 50, sp: 0, cp: 0 };

    act(() => {
      result.current.handleUpdateCurrency(newCurrency);
    });

    expect(mockUpdateCurrencyDirectly).toHaveBeenCalledWith(newCurrency);
    expect(mockGetFullState).toHaveBeenCalled();
  });

  it('performAtmosphereUpdate returns false when atmosphere disabled', async () => {
    const { result } = renderHook(() => useGameState(undefined));

    const res = await act(async () => {
      return result.current.performAtmosphereUpdate('Forest', 'A dark wood', {
        enableAtmosphere: false, voiceName: '', rate: 1, pitch: 1, volume: 1, autoSpeak: false, debugMode: false,
      });
    });

    expect(res).toBe(false);
    expect(mockSetAtmosphere).not.toHaveBeenCalled();
  });

  it('performAtmosphereUpdate calls generateAtmosphere and sets URL', async () => {
    vi.mocked(generateAtmosphere).mockResolvedValue('https://example.com/atmo.png');
    mockGetFullState.mockReturnValue({
      party: [], worldDescription: 'test', sessionLogs: [],
      quests: [], lore: [], actionQueue: [],
    });

    const { result } = renderHook(() => useGameState(undefined));

    const res = await act(async () => {
      return result.current.performAtmosphereUpdate('Forest', 'A dark wood', {
        enableAtmosphere: true, voiceName: '', rate: 1, pitch: 1, volume: 1, autoSpeak: false, debugMode: false,
      });
    });

    expect(res).toBe(true);
    expect(mockSetAtmosphere).toHaveBeenCalledWith('https://example.com/atmo.png');
    expect(mockCacheLocationImage).toHaveBeenCalledWith('Forest', 'https://example.com/atmo.png');
  });
});
