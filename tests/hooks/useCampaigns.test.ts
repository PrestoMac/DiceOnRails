import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AppStage } from '../../types';

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
      quests: [], lore: [], actionQueue: [],
    })),
  },
}));

vi.mock('../../utils/debug', () => ({ isDebugMode: false }));

const { useCampaigns } = await import('../../hooks/useCampaigns');
import { storageService } from '../../services/storageService';
import { mcpServer } from '../../services/mcpService';

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

  const render = () =>
    renderHook(() =>
      useCampaigns(
        'user-1', setStage, setGameState, setMessages,
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

  it('handleConfirmCreateCampaign resets state and starts creation', () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'new-uuid') });

    const { result } = render();
    act(() => { result.current.handleConfirmCreateCampaign('My Campaign'); });

    expect(setCurrentCampaignId).toHaveBeenCalledWith('new-uuid');
    expect(setCampaignName).toHaveBeenCalledWith('My Campaign');
    expect(setStage).toHaveBeenCalledWith(AppStage.CREATION);
    expect(mcpServer.reset).toHaveBeenCalled();
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

  it('handleJoinCampaign sets id and loads game', async () => {
    const { result } = render();
    await act(async () => {
      await result.current.handleJoinCampaign('campaign-id-123', loadGameCallback);
    });

    expect(setCurrentCampaignId).toHaveBeenCalledWith('campaign-id-123');
    expect(loadGameCallback).toHaveBeenCalledWith('user-1', 'campaign-id-123');
  });
});
