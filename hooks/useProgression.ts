import { useState, useCallback } from 'react';
import { Character } from '../types';
import { mcpServer } from '../services/mcpService';
import { applyStatAllocation } from '../services/progressionService';
import { applyAsiChoice, applyFeatChoice } from '../services/featsService';
import { getSubclassDef } from '../services/classEngine';
import { storageService } from '../services/storageService';

/** Options passed when confirming a feat choice during level-up, including optional ASI bonuses and skill selections. */
export interface FeatChoiceOptions {
  featId: string;
  asiBonuses?: Partial<Record<keyof Character['stats'], number>>;
  saveStatChoice?: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  skillChoices?: string[];
}

const sumNumericValues = (obj: Record<string, number>): number =>
  Object.values(obj).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0);

/** Manages character level-up progression: opening/closing modal, stat/skill allocation, ASI, feats, and subclass acknowledgment. */
export const useProgression = (
  currentCampaignId: string | undefined,
  syncState: () => void
) => {
  const [levelUpCharacterId, setLevelUpCharacterId] = useState<string | null>(null);
  const [selectedAllocations, setSelectedAllocations] = useState<
    Partial<Record<keyof Character['stats'], number>>
  >({});
  const [selectedSkillAllocations, setSelectedSkillAllocations] = useState<Record<string, number>>({});
  const [allocationError, setAllocationError] = useState<string | null>(null);

  const showLevelUpModal = levelUpCharacterId !== null;

  const levelUpCharacter = levelUpCharacterId
    ? mcpServer.getFullState().party.find(c => c.id === levelUpCharacterId) || null
    : null;

  const resetAllocationState = useCallback(() => {
    setSelectedAllocations({});
    setSelectedSkillAllocations({});
    setAllocationError(null);
  }, []);

  const handleOpenLevelUp = useCallback((characterId: string) => {
    setLevelUpCharacterId(characterId);
    resetAllocationState();
  }, [resetAllocationState]);

  const handleCloseLevelUp = useCallback(() => {
    setLevelUpCharacterId(null);
    resetAllocationState();
  }, [resetAllocationState]);

  const handleAllocateStat = useCallback(
    (stat: keyof Character['stats'], delta: number) => {
      setSelectedAllocations(prev => {
        const newVal = (prev[stat] || 0) + delta;
        if (newVal < 0 || !levelUpCharacter) return prev;
        if (levelUpCharacter.stats[stat] + newVal > 20) return prev;
        if (sumNumericValues({ ...prev, [stat]: newVal }) > levelUpCharacter.unusedStatPoints) return prev;
        return { ...prev, [stat]: newVal };
      });
      setAllocationError(null);
    },
    [levelUpCharacter]
  );

  const handleAllocateSkill = useCallback(
    (skill: string, delta: number) => {
      setSelectedSkillAllocations(prev => {
        const newVal = (prev[skill] || 0) + delta;
        if (newVal < 0 || !levelUpCharacter) return prev;
        if (sumNumericValues({ ...prev, [skill]: newVal }) > (levelUpCharacter.unusedSkillPoints || 0)) return prev;
        return { ...prev, [skill]: newVal };
      });
      setAllocationError(null);
    },
    [levelUpCharacter]
  );

  const remainingPoints = levelUpCharacter
    ? levelUpCharacter.unusedStatPoints - sumNumericValues(selectedAllocations)
    : 0;

  const remainingSkillPoints = levelUpCharacter
    ? (levelUpCharacter.unusedSkillPoints || 0) - sumNumericValues(selectedSkillAllocations)
    : 0;

  const applyResultToParty = useCallback(async (
    characterId: string,
    result: { errors: string[]; character: Character }
  ) => {
    if (result.errors.length > 0) {
      setAllocationError(result.errors.join('; '));
      return true;
    }
    const idx = mcpServer.getFullState().party.findIndex(c => c.id === characterId);
    if (idx > -1) mcpServer.getFullState().party[idx] = result.character;
    syncState();
    if (currentCampaignId) {
      await storageService.syncCampaignState(currentCampaignId, mcpServer.getFullState());
    }
    return false;
  }, [syncState, currentCampaignId]);

  const handleConfirmAllocation = useCallback(async (customSkillAllocations?: Record<string, number>, customHpDeviation?: number) => {
    if (!levelUpCharacterId || !levelUpCharacter) return;
    const result = applyStatAllocation(
      levelUpCharacter,
      selectedAllocations,
      customSkillAllocations ?? selectedSkillAllocations,
      customHpDeviation ?? 0
    );
    if (await applyResultToParty(levelUpCharacterId, result)) return;
    handleCloseLevelUp();
  }, [levelUpCharacterId, levelUpCharacter, selectedAllocations, selectedSkillAllocations, applyResultToParty, handleCloseLevelUp]);

  const handleConfirmAsiChoice = useCallback(async () => {
    if (!levelUpCharacterId || !levelUpCharacter) return;
    const result = applyAsiChoice(levelUpCharacter, selectedAllocations, levelUpCharacter.level);
    if (await applyResultToParty(levelUpCharacterId, result)) return;
    handleCloseLevelUp();
  }, [levelUpCharacterId, levelUpCharacter, selectedAllocations, applyResultToParty, handleCloseLevelUp]);

  const handleAcknowledgeSubclass = useCallback(async () => {
    if (!levelUpCharacterId || !levelUpCharacter) return;
    const idx = mcpServer.getFullState().party.findIndex(c => c.id === levelUpCharacterId);
    if (idx > -1) {
      const char = mcpServer.getFullState().party[idx];
      const existing = char.unlockedSubclassFeatures || [];
      const subclassDef = char.subclassId ? getSubclassDef(char.class, char.subclassId) : undefined;
      const newLevels = subclassDef
        ? subclassDef.features.filter((f: { level: number }) => f.level === char.level).map((f: { level: number }) => f.level)
        : [];
      mcpServer.getFullState().party[idx] = {
        ...char,
        pendingSubclassFeature: false,
        unlockedSubclassFeatures: Array.from(new Set([...existing, ...newLevels])),
      };
    }
    syncState();
    if (currentCampaignId) {
      await storageService.syncCampaignState(currentCampaignId, mcpServer.getFullState());
    }
  }, [levelUpCharacterId, levelUpCharacter, syncState, currentCampaignId]);

  const handleConfirmFeatChoice = useCallback(async ({ featId, asiBonuses, saveStatChoice, skillChoices }: FeatChoiceOptions) => {
    if (!levelUpCharacterId || !levelUpCharacter) return;
    const result = applyFeatChoice(levelUpCharacter, featId, levelUpCharacter.level, {
      asiBonuses,
      saveStatChoice,
      skillChoices
    });
    if (await applyResultToParty(levelUpCharacterId, result)) return;
    handleCloseLevelUp();
  }, [levelUpCharacterId, levelUpCharacter, applyResultToParty, handleCloseLevelUp]);

  /** Tasha's-style known-spell swap during the level-up flow. Calls the
   *  engine's swap_known_spell, which atomically forgets the old spell,
   *  learns the new, and consumes `pendingSpellSwap`. Returns true on
   *  success (caller may keep the modal open for further swaps if desired;
   *  the engine only permits one swap per pendingSpellSwap grant). */
  const handleConfirmSpellSwap = useCallback(async (oldSpellId: string, newSpellId: string): Promise<boolean> => {
    if (!levelUpCharacterId) return false;
    try {
      const result = await mcpServer.swap_known_spell(levelUpCharacterId, oldSpellId, newSpellId);
      if (!result.success) {
        setAllocationError(result.message);
        return false;
      }
      syncState();
      if (currentCampaignId) {
        await storageService.syncCampaignState(currentCampaignId, mcpServer.getFullState());
      }
      return true;
    } catch (err) {
      setAllocationError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }, [levelUpCharacterId, syncState, currentCampaignId]);

  const previewHp = (() => {
    if (!levelUpCharacter) return 0;
    const result = applyStatAllocation(levelUpCharacter, selectedAllocations, selectedSkillAllocations, 0);
    return result.errors.length === 0 ? result.character.hp.max : levelUpCharacter.hp.max;
  })();

  return {
    levelUpCharacterId,
    levelUpCharacter,
    showLevelUpModal,
    selectedAllocations,
    selectedSkillAllocations,
    remainingPoints,
    remainingSkillPoints,
    allocationError,
    previewHp,
    handleOpenLevelUp,
    handleCloseLevelUp,
    handleAllocateStat,
    handleAllocateSkill,
    handleConfirmAllocation,
    handleConfirmAsiChoice,
    handleConfirmFeatChoice,
    handleAcknowledgeSubclass,
    handleConfirmSpellSwap,
  };
};
