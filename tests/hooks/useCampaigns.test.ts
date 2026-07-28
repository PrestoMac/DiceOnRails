import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AppStage, GameState } from '../../types';

vi.mock('../../services/storageService', () => ({
  storageService: {
    loadCampaigns: vi.fn(),
    renameCampaign: vi.fn(),
    deleteCampaign: vi.fn(),
  },
}));

vi.mock('../../services/mcpService', () => ({
  mcpServer: {
    reset: vi.fn(),
    getFullState: vi.fn(() => ({
      party: [], worldDescription: '', sessionLogs: [],
      quests: [], lore: [], })),
  },
}));

vi.mock('../../services/rewindGeneration', () => ({
  resetRewindGeneration: vi.fn(),
}));

vi.mock('../../utils/debug', () => ({ isDebugMode: false }));

const { useCampaigns } = await import('../../hooks/useCampaigns');
import { storageService } from '../../services/storageService';
import { mcpServer } from '../../services/mcpService';
import { resetRewindGeneration } from '../../services/rewindGeneration';

const freshGameState = (): GameState => ({
  party: [], worldDescription: '', sessionLogs: [],
  quests: [], lore: [], } as unknown as GameState);

describe('useCampaigns', () => {
  const setStage = vi.fn();
  const setGameState = vi.fn();
  const setMessages = vi.fn();
  const setCurrentCampaignId = vi.fn();
  const setCampaignName = vi.fn();
  const setIsNewCampaign = vi.fn();
  const setMyCharacterId = vi.fn();
  const setViewingCharacterId = vi.fn();
  const setIsLoading = vi.fn();
  const loadGameCallback = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const render = (gameState: GameState = freshGameState()) =>
    renderHook(() =>
      useCampaigns(
        'user-1', gameState, setStage, setGameState, setMessages,
        setCurrentCampaignId, setCampaignName, setIsNewCampaign,
        setMyCharacterId, setViewingCharacterId, setIsLoading,
      ),
    );

  it('initializes with empty campaigns', () => {
    const { result } = render();
    expect(result.current.campaigns).toEqual([]);
    expect(result.current.showCreateModal).toBe(false);
  });

  it('loadCampaigns fetches and sets campaigns', async () => {
    const fakeCampaigns = [{ id: 'c1', name: 'Camp 1', createdAt: 0, lastPlayed: 0, stage: AppStage.PLAY }];
    vi.mocked(storageService.loadCampaigns).mockResolvedValue({ campaigns: fakeCampaigns, error: null });

    const { result } = render();
    await act(async () => { await result.current.loadCampaigns(); });

    expect(storageService.loadCampaigns).toHaveBeenCalledWith('user-1');
    expect(result.current.campaigns).toEqual(fakeCampaigns);
  });

  it('loadCampaigns handles error', async () => {
    vi.mocked(storageService.loadCampaigns).mockResolvedValue({ error: 'Failed to load' });

    const { result } = render();
    await act(async () => { await result.current.loadCampaigns(); });

    expect(result.current.campaigns).toEqual([]);
  });

  it('handleCreateNewCampaign opens modal', () => {
    const { result } = render();
    act(() => { result.current.handleCreateNewCampaign(); });
    expect(result.current.showCreateModal).toBe(true);
  });

  it('handleConfirmCreateCampaign resets engine + rewind generation for a pristine new campaign', () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'new-uuid') });

    const { result } = render();
    act(() => { result.current.handleConfirmCreateCampaign('My Campaign'); });

    expect(setCurrentCampaignId).toHaveBeenCalledWith('new-uuid');
    expect(setCampaignName).toHaveBeenCalledWith('My Campaign');
    expect(setStage).toHaveBeenCalledWith(AppStage.START_MODE);
    expect(mcpServer.reset).toHaveBeenCalled();
    expect(resetRewindGeneration).toHaveBeenCalled();
    expect(result.current.showCreateModal).toBe(false);
    vi.unstubAllGlobals();
  });

  it('handleRenameCampaign renames and reloads', async () => {
    vi.mocked(storageService.renameCampaign).mockResolvedValue({ error: null });
    vi.mocked(storageService.loadCampaigns).mockResolvedValue({ campaigns: [], error: null });

    const { result } = render();
    await act(async () => { await result.current.handleRenameCampaign('c1', 'New Name'); });

    expect(storageService.renameCampaign).toHaveBeenCalledWith('user-1', 'c1', 'New Name');
  });

  it('handleRenameCampaign shows alert on error', async () => {
    const alertMock = vi.fn();
    vi.stubGlobal('alert', alertMock);
    vi.mocked(storageService.renameCampaign).mockResolvedValue({ error: 'Rename failed' });

    const { result } = render();
    await act(async () => { await result.current.handleRenameCampaign('c1', 'New Name'); });

    expect(alertMock).toHaveBeenCalledWith(expect.stringContaining('Rename failed'));
    vi.unstubAllGlobals();
  });

  it('handleDeleteCampaign deletes and reloads', async () => {
    vi.mocked(storageService.deleteCampaign).mockResolvedValue({ error: null });
    vi.mocked(storageService.loadCampaigns).mockResolvedValue({ campaigns: [], error: null });

    const { result } = render();
    await act(async () => { await result.current.handleDeleteCampaign('c1'); });

    expect(storageService.deleteCampaign).toHaveBeenCalledWith('user-1', 'c1');
  });

  it('handleJoinCampaign validates ID length', async () => {
    const alertMock = vi.fn();
    vi.stubGlobal('alert', alertMock);

    const { result } = render();
    await act(async () => { await result.current.handleJoinCampaign('short', loadGameCallback); });

    expect(alertMock).toHaveBeenCalledWith('Invalid Campaign ID');
    expect(loadGameCallback).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('handleJoinCampaign resets engine + rewind generation before loading the new campaign', async () => {
    const { result } = render();
    await act(async () => {
      await result.current.handleJoinCampaign('campaign-id-123', loadGameCallback);
    });

    // Engine reset (clears rewindPoint/emergencySnapshot + GameState singleton)
    expect(mcpServer.reset).toHaveBeenCalledTimes(1);
    // Module-level rewind generation counter zeroed so new campaign's realtime
    // updates aren't rejected as stale.
    expect(resetRewindGeneration).toHaveBeenCalledTimes(1);
    // Reset must happen BEFORE the load callback runs (so loadGame sees clean state).
    expect(vi.mocked(mcpServer.reset).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(loadGameCallback).mock.invocationCallOrder[0]);
    expect(vi.mocked(resetRewindGeneration).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(loadGameCallback).mock.invocationCallOrder[0]);

    expect(setCurrentCampaignId).toHaveBeenCalledWith('campaign-id-123');
    expect(loadGameCallback).toHaveBeenCalledWith('user-1', 'campaign-id-123');
  });

  it('handleJoinCampaign refuses to switch while a turn is processing', async () => {
    const alertMock = vi.fn();
    vi.stubGlobal('alert', alertMock);

    const processingState = { ...freshGameState(), isProcessing: true } as unknown as GameState;
    const { result } = render(processingState);
    await act(async () => {
      await result.current.handleJoinCampaign('campaign-id-123', loadGameCallback);
    });

    expect(alertMock).toHaveBeenCalledWith(expect.stringContaining('current turn'));
    expect(mcpServer.reset).not.toHaveBeenCalled();
    expect(resetRewindGeneration).not.toHaveBeenCalled();
    expect(loadGameCallback).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('handleJoinCampaign with joinAsNewMember routes to the character creation wizard', async () => {
    vi.mocked(loadGameCallback).mockResolvedValue(true);

    const { result } = render();
    await act(async () => {
      await result.current.handleJoinCampaign('campaign-id-123', loadGameCallback, true);
    });

    expect(setIsNewCampaign).toHaveBeenCalledWith(false);
    expect(setStage).toHaveBeenCalledWith(AppStage.CREATION);
  });

  it('handleJoinCampaign with joinAsNewMember alerts when campaign is not found', async () => {
    const alertMock = vi.fn();
    vi.stubGlobal('alert', alertMock);
    vi.mocked(loadGameCallback).mockResolvedValue(false);

    const { result } = render();
    await act(async () => {
      await result.current.handleJoinCampaign('campaign-id-123', loadGameCallback, true);
    });

    expect(alertMock).toHaveBeenCalledWith(expect.stringContaining('not found'));
    expect(setStage).not.toHaveBeenCalledWith(AppStage.CREATION);
    expect(setIsNewCampaign).not.toHaveBeenCalledWith(false);
    vi.unstubAllGlobals();
  });

  it('handleJoinCampaign skips the wizard when the user already owns a character (re-join guard)', async () => {
    vi.mocked(loadGameCallback).mockResolvedValue(true);
    vi.mocked(mcpServer.getFullState).mockReturnValue({
      party: [{ ownerId: 'user-1', id: 'char-1' }],
    } as unknown as ReturnType<typeof mcpServer.getFullState>);

    const { result } = render();
    await act(async () => {
      await result.current.handleJoinCampaign('campaign-id-123', loadGameCallback, true);
    });

    // loadGameData already set stage to PLAY + myCharacterId; skip the wizard.
    expect(setStage).not.toHaveBeenCalledWith(AppStage.CREATION);
    expect(setIsNewCampaign).not.toHaveBeenCalledWith(false);

    // Restore default mock for subsequent tests.
    vi.mocked(mcpServer.getFullState).mockReturnValue({
      party: [], worldDescription: '', sessionLogs: [],
      quests: [], lore: [], });
  });
});
