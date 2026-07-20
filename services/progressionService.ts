import { Character, LevelUpSummary } from '../types';
import { XP_TABLE, STAT_POINTS_PER_LEVEL, MAX_STAT_VALUE, ASI_LEVELS } from '../constants';
import { calculateMaxHp as classEngineCalculateMaxHp, getSubclassDef, recalculateResourcePools } from './classEngine';

/** Returns the XP required to reach a given character level from the XP table. */
export function getXpForLevel(level: number): number {
  const entry = XP_TABLE.find(e => e.level === level);
  if (entry) return entry.xpRequired;
  if (level > 20) return XP_TABLE[XP_TABLE.length - 1].xpRequired;
  return 0;
}

/** Calculates the XP needed to go from the current level to the next level. */
export function calculateXPToNextLevel(currentLevel: number): number {
  if (currentLevel >= 20) return 0;
  return getXpForLevel(currentLevel + 1) - getXpForLevel(currentLevel);
}

/** Calculates the maximum hit points for a character, delegating to the class engine. */
export function calculateMaxHp(character: Character): number {
  return classEngineCalculateMaxHp(character);
}

/** Calculates the HP gain a character would receive upon leveling up by comparing current and next-level max HP. */
export function calculateHPGainForLevelUp(character: Character): number {
  const oldMax = character.hp.max;
  const newMax = calculateMaxHp({ ...character, level: character.level + 1 });
  return newMax - oldMax;
}

/** Awards XP to a character, handling multi-level advancement, stat/skill point accrual, and HP recalculation. */
export function awardExperience(
  character: Character,
  amount: number
): { character: Character; leveledUp: boolean; levelUpSummary?: LevelUpSummary } {
  const safeAmount = Math.max(1, Math.min(amount, 1000));
  const oldLevel = character.level;
  let newExperience = (character.experience ?? 0) + safeAmount;
  let newLevel = character.level;
  let leveledUp = false;

  while (newLevel < 20) {
    const xpRequiredForNext = calculateXPToNextLevel(newLevel);
    if (xpRequiredForNext > 0 && newExperience >= xpRequiredForNext) {
      newExperience -= xpRequiredForNext;
      newLevel++;
      leveledUp = true;
    } else {
      break;
    }
  }

  const updated: Character = {
    ...character,
    experience: newExperience,
    level: newLevel,
    experienceToNextLevel: calculateXPToNextLevel(newLevel),
  };

  if (leveledUp) {
    const levelsGained = newLevel - oldLevel;
    const newUnusedPoints = character.unusedStatPoints + levelsGained * STAT_POINTS_PER_LEVEL;
    updated.unusedStatPoints = newUnusedPoints;

    const skillPointsPerLevel = character.class === 'Rogue' ? 4 : 3;
    updated.unusedSkillPoints = (character.unusedSkillPoints ?? 0) + levelsGained * skillPointsPerLevel;

    if (ASI_LEVELS.includes(newLevel) && !updated.featSelections?.some(s => s.level === newLevel)) {
      updated.pendingFeatChoice = true;
    }

    if (updated.subclassId) {
      const subclassDef = getSubclassDef(updated.class, updated.subclassId);
      if (subclassDef) {
        const newFeaturesAtLevel = subclassDef.features.filter(f => f.level === newLevel);
        const alreadyUnlocked = updated.unlockedSubclassFeatures ?? [];
        if (newFeaturesAtLevel.length > 0 && !alreadyUnlocked.includes(newLevel)) {
          updated.pendingSubclassFeature = true;
        }
      }
    }

    const oldMaxHp = character.hp.max;
    const newMaxHp = calculateMaxHp(updated);
    const hpDiff = newMaxHp - oldMaxHp;
    updated.hp = updateHp(character.hp.current + hpDiff, newMaxHp);
    updated.resources = recalculateResourcePools(updated);

    return {
      character: updated,
      leveledUp: true,
      levelUpSummary: {
        characterId: updated.id,
        characterName: updated.name,
        newLevel,
        oldLevel,
        hpGained: hpDiff,
        newMaxHp,
        statPointsGained: newUnusedPoints - character.unusedStatPoints,
      },
    };
  }

  return { character: updated, leveledUp: false };
}

/** Applies stat/skill point allocations to a character, recalculates HP and resources, and returns errors for invalid allocations. */
export function applyStatAllocation(
  character: Character,
  allocations: Partial<Record<keyof Character['stats'], number>>,
  skillAllocations: Record<string, number> = {},
  hpDeviation: number = 0
): { character: Character; hpGained: number; errors: string[] } {
  const errors: string[] = [];

  const totalAllocated = sumPositiveEntries(Object.entries(allocations));
  if (totalAllocated > character.unusedStatPoints) {
    errors.push(`Cannot allocate ${totalAllocated} stat points; only ${character.unusedStatPoints} available.`);
  }

  const currentUnusedSkillPoints = character.unusedSkillPoints ?? 0;
  const totalSkillsAllocated = sumPositiveEntries(Object.entries(skillAllocations));
  if (totalSkillsAllocated > currentUnusedSkillPoints) {
    errors.push(`Cannot allocate ${totalSkillsAllocated} skill points; only ${currentUnusedSkillPoints} available.`);
  }

  const newStats = { ...character.stats };
  for (const [stat, val] of Object.entries(allocations)) {
    if (typeof val === 'number' && val > 0) {
      const key = stat as keyof Character['stats'];
      const current = newStats[key];
      const proposed = current + val;
      if (proposed > MAX_STAT_VALUE) {
        errors.push(`${stat.toUpperCase()} cannot exceed ${MAX_STAT_VALUE} (current: ${current}).`);
        continue;
      }
      newStats[key] = proposed;
    }
  }

  if (errors.length > 0) {
    return { character, hpGained: 0, errors };
  }

  const newSkills = { ...(character.skills ?? {}) };
  for (const [skill, val] of Object.entries(skillAllocations)) {
    if (typeof val === 'number' && val > 0) {
      newSkills[skill] = (newSkills[skill] ?? 0) + val;
    }
  }

  const oldHp = character.hp.max;
  const updated: Character = {
    ...character,
    stats: newStats,
    skills: newSkills,
    unusedStatPoints: character.unusedStatPoints - totalAllocated,
    unusedSkillPoints: currentUnusedSkillPoints - totalSkillsAllocated,
    maxHpBonus: character.maxHpBonus + hpDeviation,
  };

  updated.resources = recalculateResourcePools(updated);

  const newMaxHp = calculateMaxHp(updated);
  const hpGained = newMaxHp - oldHp;
  updated.hp = updateHp(character.hp.current + Math.max(0, hpGained), newMaxHp);

  return { character: updated, hpGained, errors: [] };
}

/** Builds a human-readable progression context string including level, XP percentage, unspent points, and feats. */
export function getProgressionContext(character: Character): string {
  const currentLevelXp = getXpForLevel(character.level);
  const nextLevelXp = character.experienceToNextLevel;
  const levelRange = nextLevelXp - currentLevelXp;
  const xpProgress = levelRange > 0
    ? Math.round(((character.experience - currentLevelXp) / levelRange) * 100)
    : 100;
  const base = `Level ${character.level} (${character.experience}/${character.experienceToNextLevel} XP, ${xpProgress}%), ${character.unusedStatPoints} unspent stat points, ${character.unusedSkillPoints ?? 0} unspent skill points`;
  const feats = character.feats?.length ? ` | Feats: ${character.feats.join(', ')}` : '';
  return base + feats;
}

/** Sums all positive numeric values from an array of key-value entries. */
function sumPositiveEntries(entries: [string, unknown][]): number {
  return entries.reduce((sum, [, val]) => sum + (typeof val === 'number' && val > 0 ? val : 0), 0);
}

/** Clamps current HP to the new maximum, ensuring it never exceeds max. */
function updateHp(current: number, max: number): { current: number; max: number } {
  return { current: Math.min(max, current), max };
}
