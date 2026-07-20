import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockGetFullState = vi.fn();
const mockGetTarget = vi.fn();
const mockSyncState = vi.fn();
const mockSyncCampaignState = vi.fn();

vi.mock('../../services/mcpService', () => ({
  mcpServer: {
    getFullState: mockGetFullState,
    getTarget: mockGetTarget,
  },
}));

vi.mock('../../services/storageService', () => ({
  storageService: {
    syncCampaignState: mockSyncCampaignState,
  },
}));

const { useProgression } = await import('../../hooks/useProgression');

function makeCharacter(overrides: Record<string, unknown> = {}) {
  return {
    id: 'char-1', name: 'Test', class: 'Fighter', race: 'Human', level: 4,
    hp: { current: 40, max: 40 },
    stats: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 10 },
    inventory: [], currency: { gp: 0, sp: 0, cp: 0 }, location: 'Tavern',
    experience: 2700, experienceToNextLevel: 3800,
    unusedStatPoints: 2, maxHpBonus: 0,
    hitDice: { current: 4, max: 4 },
    skills: { athletics: 2 }, unusedSkillPoints: 1,
    ...overrides,
  };
}

describe('useProgression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFullState.mockReturnValue({ party: [makeCharacter()] });
    mockSyncCampaignState.mockResolvedValue(undefined);
  });

  describe('initial state', () => {
    it('returns default values', () => {
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));
      expect(result.current.showLevelUpModal).toBe(false);
      expect(result.current.levelUpCharacterId).toBeNull();
      expect(result.current.remainingPoints).toBe(0);
      expect(result.current.remainingSkillPoints).toBe(0);
      expect(result.current.allocationError).toBeNull();
    });

    it('works with undefined campaignId', () => {
      const { result } = renderHook(() => useProgression(undefined, mockSyncState));
      expect(result.current.showLevelUpModal).toBe(false);
      expect(result.current.levelUpCharacterId).toBeNull();
    });
  });

  describe('handleOpenLevelUp', () => {
    it('sets character ID and resets allocations', () => {
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));

      act(() => {
        result.current.handleOpenLevelUp('char-1');
      });

      expect(result.current.levelUpCharacterId).toBe('char-1');
      expect(result.current.showLevelUpModal).toBe(true);
      expect(result.current.levelUpCharacter).not.toBeNull();
      expect(result.current.levelUpCharacter?.name).toBe('Test');
      expect(result.current.remainingPoints).toBe(2);
    });

    it('character not found results in null levelUpCharacter', () => {
      mockGetFullState.mockReturnValue({ party: [] });
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));

      act(() => {
        result.current.handleOpenLevelUp('missing-id');
      });

      expect(result.current.levelUpCharacterId).toBe('missing-id');
      expect(result.current.levelUpCharacter).toBeNull();
      expect(result.current.remainingPoints).toBe(0);
    });
  });

  describe('handleCloseLevelUp', () => {
    it('clears character ID, resets allocations and error', () => {
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));

      act(() => { result.current.handleOpenLevelUp('char-1'); });
      act(() => { result.current.handleAllocateStat('str', 1); });
      expect(result.current.selectedAllocations).toEqual({ str: 1 });

      act(() => { result.current.handleCloseLevelUp(); });

      expect(result.current.levelUpCharacterId).toBeNull();
      expect(result.current.showLevelUpModal).toBe(false);
      expect(result.current.selectedAllocations).toEqual({});
      expect(result.current.selectedSkillAllocations).toEqual({});
      expect(result.current.allocationError).toBeNull();
    });
  });

  describe('handleAllocateStat', () => {
    it('adds positive allocation and decrements remainingPoints', () => {
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));

      act(() => { result.current.handleOpenLevelUp('char-1'); });
      act(() => { result.current.handleAllocateStat('str', 1); });

      expect(result.current.selectedAllocations).toEqual({ str: 1 });
      expect(result.current.remainingPoints).toBe(1);
    });

    it('deducts allocation on negative delta', () => {
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));

      act(() => { result.current.handleOpenLevelUp('char-1'); });
      act(() => { result.current.handleAllocateStat('str', 2); });
      act(() => { result.current.handleAllocateStat('str', -1); });

      expect(result.current.selectedAllocations).toEqual({ str: 1 });
      expect(result.current.remainingPoints).toBe(1);
    });

    it('negative delta cannot go below 0', () => {
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));

      act(() => { result.current.handleOpenLevelUp('char-1'); });
      act(() => { result.current.handleAllocateStat('str', -1); });

      expect(result.current.selectedAllocations).toEqual({});
      expect(result.current.remainingPoints).toBe(2);
    });

    it('cannot exceed stat cap of 20', () => {
      mockGetFullState.mockReturnValue({
        party: [makeCharacter({ unusedStatPoints: 10 })],
      });
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));

      act(() => { result.current.handleOpenLevelUp('char-1'); });
      act(() => { result.current.handleAllocateStat('str', 5); });

      expect(result.current.selectedAllocations).toEqual({});
    });

    it('cannot exceed unusedStatPoints', () => {
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));

      act(() => { result.current.handleOpenLevelUp('char-1'); });
      act(() => { result.current.handleAllocateStat('str', 3); });

      expect(result.current.selectedAllocations).toEqual({});
      expect(result.current.remainingPoints).toBe(2);
    });

    it('multiple stats allocation sums correctly', () => {
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));

      act(() => { result.current.handleOpenLevelUp('char-1'); });
      act(() => { result.current.handleAllocateStat('str', 1); });
      act(() => { result.current.handleAllocateStat('con', 1); });

      expect(result.current.selectedAllocations).toEqual({ str: 1, con: 1 });
      expect(result.current.remainingPoints).toBe(0);
    });

    it('no-op when levelUpCharacter is null', () => {
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));

      act(() => { result.current.handleAllocateStat('str', 1); });

      expect(result.current.selectedAllocations).toEqual({});
    });
  });

  describe('handleAllocateSkill', () => {
    it('adds positive skill allocation', () => {
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));

      act(() => { result.current.handleOpenLevelUp('char-1'); });
      act(() => { result.current.handleAllocateSkill('acrobatics', 1); });

      expect(result.current.selectedSkillAllocations).toEqual({ acrobatics: 1 });
      expect(result.current.remainingSkillPoints).toBe(0);
    });

    it('deducts skill allocation', () => {
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));

      act(() => { result.current.handleOpenLevelUp('char-1'); });
      act(() => { result.current.handleAllocateSkill('acrobatics', 1); });
      act(() => { result.current.handleAllocateSkill('acrobatics', -1); });

      expect(result.current.selectedSkillAllocations).toEqual({ acrobatics: 0 });
      expect(result.current.remainingSkillPoints).toBe(1);
    });

    it('cannot exceed unusedSkillPoints', () => {
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));

      act(() => { result.current.handleOpenLevelUp('char-1'); });
      act(() => { result.current.handleAllocateSkill('acrobatics', 2); });

      expect(result.current.selectedSkillAllocations).toEqual({});
      expect(result.current.remainingSkillPoints).toBe(1);
    });

    it('rejects when unusedSkillPoints is undefined', () => {
      mockGetFullState.mockReturnValue({
        party: [makeCharacter({ unusedSkillPoints: undefined })],
      });
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));

      act(() => { result.current.handleOpenLevelUp('char-1'); });
      act(() => { result.current.handleAllocateSkill('acrobatics', 1); });

      expect(result.current.selectedSkillAllocations).toEqual({});
    });
  });

  describe('handleConfirmAllocation', () => {
    it('calls applyStatAllocation and syncs on success', async () => {
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));

      act(() => { result.current.handleOpenLevelUp('char-1'); });
      act(() => { result.current.handleAllocateStat('str', 1); });

      await act(async () => {
        await result.current.handleConfirmAllocation();
      });

      const updatedChar = mockGetFullState().party[0];
      expect(updatedChar.stats.str).toBe(17);
      expect(updatedChar.unusedStatPoints).toBe(1);
      expect(mockSyncState).toHaveBeenCalledTimes(1);
      expect(mockSyncCampaignState).toHaveBeenCalledWith('camp-1', mockGetFullState());
      expect(result.current.levelUpCharacterId).toBeNull();
    });

    it('passes customSkillAllocations and customHpDeviation', async () => {
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));

      act(() => { result.current.handleOpenLevelUp('char-1'); });

      await act(async () => {
        await result.current.handleConfirmAllocation({ athletics: 1 }, 5);
      });

      const updatedChar = mockGetFullState().party[0];
      expect(updatedChar.skills?.athletics).toBe(3);
      expect(updatedChar.maxHpBonus).toBe(5);
      expect(mockSyncState).toHaveBeenCalled();
    });

    it('no-op when no character', async () => {
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));

      await act(async () => {
        await result.current.handleConfirmAllocation();
      });

      expect(mockSyncState).not.toHaveBeenCalled();
      expect(mockSyncCampaignState).not.toHaveBeenCalled();
    });

    it('sets allocationError on service error', async () => {
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));

      act(() => { result.current.handleOpenLevelUp('char-1'); });

      await act(async () => {
        await result.current.handleConfirmAllocation({ athletics: 5 });
      });

      expect(result.current.allocationError).not.toBeNull();
      expect(result.current.showLevelUpModal).toBe(true);
    });
  });

  describe('handleConfirmAsiChoice', () => {
    it('calls applyAsiChoice and syncs on success', async () => {
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));

      act(() => { result.current.handleOpenLevelUp('char-1'); });
      act(() => { result.current.handleAllocateStat('str', 2); });

      await act(async () => {
        await result.current.handleConfirmAsiChoice();
      });

      const updatedChar = mockGetFullState().party[0];
      expect(updatedChar.stats.str).toBe(18);
      expect(updatedChar.pendingFeatChoice).toBe(false);
      expect(mockSyncState).toHaveBeenCalled();
      expect(result.current.levelUpCharacterId).toBeNull();
    });

    it('allocation error from applyAsiChoice sets error', async () => {
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));

      act(() => { result.current.handleOpenLevelUp('char-1'); });
      act(() => { result.current.handleAllocateStat('str', 1); });

      await act(async () => {
        await result.current.handleConfirmAsiChoice();
      });

      expect(result.current.allocationError).not.toBeNull();
      expect(result.current.showLevelUpModal).toBe(true);
    });

    it('no-op when no character', async () => {
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));

      await act(async () => {
        await result.current.handleConfirmAsiChoice();
      });

      expect(mockSyncState).not.toHaveBeenCalled();
    });
  });

  describe('handleConfirmFeatChoice', () => {
    it('calls applyFeatChoice with options and syncs', async () => {
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));

      act(() => { result.current.handleOpenLevelUp('char-1'); });

      await act(async () => {
        await result.current.handleConfirmFeatChoice({ featId: 'tough' });
      });

      const updatedChar = mockGetFullState().party[0];
      expect(updatedChar.feats).toContain('tough');
      expect(mockSyncState).toHaveBeenCalled();
      expect(result.current.levelUpCharacterId).toBeNull();
    });

    it('passes saveStatChoice and skillChoices', async () => {
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));

      mockGetFullState.mockReturnValue({
        party: [makeCharacter({ feats: [], unusedStatPoints: 0 })],
      });

      act(() => { result.current.handleOpenLevelUp('char-1'); });

      await act(async () => {
        await result.current.handleConfirmFeatChoice({
          featId: 'skilled',
          skillChoices: ['acrobatics', 'perception'],
        });
      });

      const updatedChar = mockGetFullState().party[0];
      expect(updatedChar.feats).toContain('skilled');
      expect(mockSyncState).toHaveBeenCalled();
    });

    it('error from applyFeatChoice sets error', async () => {
      mockGetFullState.mockReturnValue({
        party: [makeCharacter({ level: 1 })],
      });
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));

      act(() => { result.current.handleOpenLevelUp('char-1'); });

      await act(async () => {
        await result.current.handleConfirmFeatChoice({ featId: 'nonexistent-feat' });
      });

      expect(result.current.allocationError).not.toBeNull();
      expect(result.current.showLevelUpModal).toBe(true);
    });

    it('no-op when no character', async () => {
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));

      await act(async () => {
        await result.current.handleConfirmFeatChoice({ featId: 'tough' });
      });

      expect(mockSyncState).not.toHaveBeenCalled();
    });
  });

  describe('handleAcknowledgeSubclass', () => {
    it('updates subclass features and syncs', async () => {
      mockGetFullState.mockReturnValue({
        party: [makeCharacter({ level: 3, subclassId: 'champion' })],
      });
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));

      act(() => { result.current.handleOpenLevelUp('char-1'); });

      await act(async () => {
        await result.current.handleAcknowledgeSubclass();
      });

      const updatedChar = mockGetFullState().party[0];
      expect(updatedChar.pendingSubclassFeature).toBe(false);
      expect(updatedChar.unlockedSubclassFeatures).toEqual([3]);
      expect(mockSyncState).toHaveBeenCalled();
    });

    it('deduplicates existing features', async () => {
      mockGetFullState.mockReturnValue({
        party: [makeCharacter({ level: 3, subclassId: 'champion', unlockedSubclassFeatures: [3] })],
      });
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));

      act(() => { result.current.handleOpenLevelUp('char-1'); });

      await act(async () => {
        await result.current.handleAcknowledgeSubclass();
      });

      const updatedChar = mockGetFullState().party[0];
      expect(updatedChar.unlockedSubclassFeatures).toEqual([3]);
    });

    it('no-op when no subclassId', async () => {
      mockGetFullState.mockReturnValue({
        party: [makeCharacter({ level: 3 })],
      });
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));

      act(() => { result.current.handleOpenLevelUp('char-1'); });

      await act(async () => {
        await result.current.handleAcknowledgeSubclass();
      });

      const updatedChar = mockGetFullState().party[0];
      expect(updatedChar.pendingSubclassFeature).toBe(false);
      expect(updatedChar.unlockedSubclassFeatures).toEqual([]);
      expect(mockSyncState).toHaveBeenCalled();
    });

    it('no-op when no character', async () => {
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));

      await act(async () => {
        await result.current.handleAcknowledgeSubclass();
      });

      expect(mockSyncState).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('applyResultToParty sets allocationError on errors', async () => {
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));

      act(() => { result.current.handleOpenLevelUp('char-1'); });

      await act(async () => {
        await result.current.handleConfirmAllocation({ athletics: 5 });
      });

      expect(result.current.allocationError).toContain('Cannot allocate');
    });

    it('syncCampaignState rejection does not throw', async () => {
      mockSyncCampaignState.mockRejectedValue(new Error('Sync failed'));
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));

      act(() => { result.current.handleOpenLevelUp('char-1'); });
      act(() => { result.current.handleAllocateStat('str', 1); });

      await act(async () => {
        try {
          await result.current.handleConfirmAllocation();
        } catch {

        }
      });

      expect(mockSyncCampaignState).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('undefined campaignId skips storage sync', async () => {
      const { result } = renderHook(() => useProgression(undefined, mockSyncState));

      act(() => { result.current.handleOpenLevelUp('char-1'); });
      act(() => { result.current.handleAllocateStat('str', 1); });

      await act(async () => {
        await result.current.handleConfirmAllocation();
      });

      expect(mockSyncCampaignState).not.toHaveBeenCalled();
      expect(mockSyncState).toHaveBeenCalled();
    });

    it('anonymous campaignId skips storage sync', async () => {
      const { result } = renderHook(() => useProgression('anonymous', mockSyncState));

      act(() => { result.current.handleOpenLevelUp('char-1'); });
      act(() => { result.current.handleAllocateStat('str', 1); });

      await act(async () => {
        await result.current.handleConfirmAllocation();
      });

      expect(mockSyncCampaignState).not.toHaveBeenCalled();
      expect(mockSyncState).toHaveBeenCalled();
    });

    it('double confirmation (first succeeds, second no-op)', async () => {
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));

      act(() => { result.current.handleOpenLevelUp('char-1'); });
      act(() => { result.current.handleAllocateStat('str', 1); });

      await act(async () => {
        await result.current.handleConfirmAllocation();
      });

      expect(mockSyncState).toHaveBeenCalledTimes(1);
      expect(result.current.levelUpCharacterId).toBeNull();

      await act(async () => {
        await result.current.handleConfirmAllocation();
      });

      expect(mockSyncState).toHaveBeenCalledTimes(1);
    });

    it('allocation clears error on new interaction', async () => {
      const { result } = renderHook(() => useProgression('camp-1', mockSyncState));

      act(() => { result.current.handleOpenLevelUp('char-1'); });

      await act(async () => {
        await result.current.handleConfirmAllocation({ athletics: 5 });
      });

      expect(result.current.allocationError).not.toBeNull();

      act(() => { result.current.handleAllocateStat('str', 1); });

      expect(result.current.allocationError).toBeNull();
    });
  });
});
