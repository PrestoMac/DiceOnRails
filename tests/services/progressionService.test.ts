import { describe, it, expect } from 'vitest';
import {
  getXpForLevel,
  calculateXPToNextLevel,
  calculateMaxHp,
  calculateHPGainForLevelUp,
  awardExperience,
  applyStatAllocation,
  getProgressionContext,
} from '../../services/progressionService';
import { Character } from '../../types';

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: 'hero-1',
    name: 'Hero',
    class: 'Fighter',
    race: 'Human',
    level: 1,
    hp: { current: 12, max: 12 },
    stats: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 14 },
    inventory: [],
    currency: { gp: 0, sp: 0, cp: 0 },
    location: 'Tavern',
    experience: 0,
    experienceToNextLevel: 300,
    unusedStatPoints: 0,
    maxHpBonus: 0,
    hitDice: { current: 1, max: 1 },
    ...overrides,
  };
}

describe('progressionService', () => {
  describe('getXpForLevel', () => {
    it('returns correct XP for known levels', () => {
      expect(getXpForLevel(1)).toBe(0);
      expect(getXpForLevel(2)).toBe(300);
      expect(getXpForLevel(3)).toBe(900);
      expect(getXpForLevel(5)).toBe(4600);
    });

    it('returns XP for level 20', () => {
      expect(getXpForLevel(20)).toBe(378000);
    });

    it('returns max XP for levels above 20', () => {
      expect(getXpForLevel(25)).toBe(378000);
    });

    it('returns 0 for invalid levels', () => {
      expect(getXpForLevel(0)).toBe(0);
      expect(getXpForLevel(-1)).toBe(0);
    });
  });

  describe('calculateXPToNextLevel', () => {
    it('returns correct gap for level 1', () => {
      expect(calculateXPToNextLevel(1)).toBe(300);
    });

    it('returns 0 at level 20', () => {
      expect(calculateXPToNextLevel(20)).toBe(0);
    });
  });

  describe('calculateMaxHp', () => {
    it('calculates base HP for level 1 Fighter', () => {
      const char = makeCharacter();
      expect(calculateMaxHp(char)).toBe(12);
    });

    it('scales HP with level', () => {
      const char = makeCharacter({ level: 3 });
      const hp = calculateMaxHp(char);
      expect(hp).toBe(28);
    });

    it('includes maxHpBonus', () => {
      const char = makeCharacter({ maxHpBonus: 5 });
      const hp = calculateMaxHp(char);
      expect(hp).toBe(17);
    });

    it('handles Wizard class', () => {
      const char = makeCharacter({ class: 'Wizard', stats: { str: 8, dex: 14, con: 12, int: 15, wis: 10, cha: 10 } });
      const hp = calculateMaxHp(char);
      expect(hp).toBe(7);
    });
  });

  describe('calculateHPGainForLevelUp', () => {
    it('calculates positive HP gain when leveling up', () => {
      const char = makeCharacter();
      const gain = calculateHPGainForLevelUp(char);
      expect(gain).toBeGreaterThan(0);
    });
  });

  describe('awardExperience', () => {
    it('adds experience to character', () => {
      const result = awardExperience(makeCharacter(), 100);
      expect(result.character.experience).toBe(100);
      expect(result.leveledUp).toBe(false);
    });

    it('clamps amount to 1-1000', () => {
      const result = awardExperience(makeCharacter(), 0);
      expect(result.character.experience).toBe(1);
    });

    it('triggers level up when XP threshold exceeded', () => {
      const result = awardExperience(makeCharacter(), 5000);
      expect(result.leveledUp).toBe(true);
      expect(result.levelUpSummary).toBeDefined();
      expect(result.levelUpSummary.newLevel).toBeGreaterThan(1);
    });

    it('supports multiple level ups at once', () => {
      const result = awardExperience(makeCharacter(), 100000);
      expect(result.levelUpSummary).toBeDefined();
      expect(result.levelUpSummary.newLevel).toBeGreaterThanOrEqual(2);
    });

    it('caps level at 20', () => {
      const char = makeCharacter({ level: 19, experience: 325000, experienceToNextLevel: 53000 });
      const result = awardExperience(char, 500000);
      expect(result.character.level).toBe(20);
    });

    it('provides stat points on level up', () => {
      const char = makeCharacter({ unusedStatPoints: 0 });
      const result = awardExperience(char, 5000);
      expect(result.levelUpSummary).toBeDefined();
      expect(result.levelUpSummary.statPointsGained).toBeGreaterThan(0);
    });

    it('provides skill points on level up (Rogue gets 4 per level)', () => {
      const char = makeCharacter({ class: 'Rogue', unusedSkillPoints: 0 });
      const result = awardExperience(char, 5000);
      expect(result.character.unusedSkillPoints).toBeGreaterThan(0);
    });

    it('grants 2 pendingWizardSpells per level gained for Wizard', () => {
      const wizard = makeCharacter({ class: 'wizard', level: 1, experience: 0 });
      const result = awardExperience(wizard, 300); // 300 XP advances L1 -> L2
      expect(result.leveledUp).toBe(true);
      expect(result.character.level).toBe(2);
      expect(result.character.pendingWizardSpells).toBe(2);
    });

    it('Fighter gets 3 skill points per level', () => {
      const char = makeCharacter({ class: 'Fighter', unusedSkillPoints: 0 });
      const result = awardExperience(char, 5000);
      expect(result.character.unusedSkillPoints).toBeGreaterThanOrEqual(3);
    });

    it('does not level up when not enough XP', () => {
      const result = awardExperience(makeCharacter(), 10);
      expect(result.leveledUp).toBe(false);
      expect(result.levelUpSummary).toBeUndefined();
    });

    it('recalculates class resource pools on level up', () => {
      const char = makeCharacter({ class: 'Sorcerer', level: 1, stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 16 } });
      const result = awardExperience(char, 1000);
      expect(result.leveledUp).toBe(true);
      expect(result.character.level).toBe(3);
      const sorceryPoints = result.character.resources?.find(r => r.id === 'sorcery-points');
      expect(sorceryPoints).toBeDefined();
      expect(sorceryPoints?.max).toBe(3);
      expect(sorceryPoints?.current).toBe(3);
    });

    it('grants pendingSpellSwap on known-caster level-up', () => {
      const char = makeCharacter({ class: 'bard', level: 1, stats: { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 16 } });
      const result = awardExperience(char, 1000);
      expect(result.leveledUp).toBe(true);
      expect(result.character.pendingSpellSwap).toBe(true);
    });

    it('does NOT grant pendingSpellSwap for prepared casters', () => {
      const char = makeCharacter({ class: 'wizard', level: 1, stats: { str: 8, dex: 14, con: 12, int: 15, wis: 10, cha: 10 } });
      const result = awardExperience(char, 1000);
      expect(result.leveledUp).toBe(true);
      expect(result.character.pendingSpellSwap).toBeFalsy();
    });

    it('does NOT grant pendingSpellSwap for non-casters', () => {
      const char = makeCharacter({ class: 'fighter', level: 1 });
      const result = awardExperience(char, 1000);
      expect(result.leveledUp).toBe(true);
      expect(result.character.pendingSpellSwap).toBeFalsy();
    });

    it('grants pendingInvocations on Warlock level-up across thresholds', () => {
      // Warlock L1 → L2: getInvocationCount(2) = 2, started with 0 → delta = 2
      const char = makeCharacter({
        class: 'warlock', level: 1,
        stats: { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 16 },
        invocations: [],
      });
      const result = awardExperience(char, 300);
      expect(result.leveledUp).toBe(true);
      expect(result.character.level).toBe(2);
      // At L2, getInvocationCount returns 2. The character starts with 0 invocations.
      expect(result.character.pendingInvocations).toBe(2);
    });

    it('does NOT grant pendingInvocations for non-warlocks', () => {
      const char = makeCharacter({ class: 'fighter', level: 1 });
      const result = awardExperience(char, 100000);
      expect(result.leveledUp).toBe(true);
      expect(result.character.pendingInvocations).toBeFalsy();
    });
  });

  describe('applyStatAllocation', () => {
    it('applies stat increases when enough points available', () => {
      const char = makeCharacter({ unusedStatPoints: 4 });
      const result = applyStatAllocation(char, { str: 2, dex: 2 });
      expect(result.errors).toHaveLength(0);
      expect(result.character.stats.str).toBe(18);
      expect(result.character.stats.dex).toBe(12);
      expect(result.character.unusedStatPoints).toBe(0);
    });

    it('returns error when allocating more than available', () => {
      const char = makeCharacter({ unusedStatPoints: 1 });
      const result = applyStatAllocation(char, { str: 3 });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.character.stats.str).toBe(16);
    });

    it('prevents stat going above MAX_STAT_VALUE (20)', () => {
      const char = makeCharacter({ stats: { str: 19, dex: 10, con: 14, int: 8, wis: 12, cha: 14 }, unusedStatPoints: 10 });
      const result = applyStatAllocation(char, { str: 5 });
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('allocates skill points', () => {
      const char = makeCharacter({ unusedStatPoints: 2, unusedSkillPoints: 4 });
      const result = applyStatAllocation(char, { str: 2 }, { athletics: 3 });
      expect(result.errors).toHaveLength(0);
      expect(result.character.skills?.athletics).toBe(3);
    });

    it('returns error for over-allocating skill points', () => {
      const char = makeCharacter({ unusedStatPoints: 2, unusedSkillPoints: 1 });
      const result = applyStatAllocation(char, { str: 2 }, { athletics: 5 });
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('applies HP deviation', () => {
      const char = makeCharacter({ unusedStatPoints: 2 });
      const result = applyStatAllocation(char, { str: 2 }, {}, 3);
      expect(result.hpGained).toBe(3);
    });
  });

  describe('getProgressionContext', () => {
    it('returns a formatted progression string', () => {
      const char = makeCharacter();
      const ctx = getProgressionContext(char);
      expect(ctx).toContain('Level 1');
      expect(ctx).toContain('XP');
      expect(ctx).toContain('unspent stat points');
    });

    it('surfaces pendingSpellSwap when set', () => {
      const char = makeCharacter({ class: 'bard', pendingSpellSwap: true });
      const ctx = getProgressionContext(char);
      expect(ctx).toContain('pending spell swap');
    });

    it('omits pending spell swap line when flag is false', () => {
      const char = makeCharacter({ class: 'bard', pendingSpellSwap: false });
      const ctx = getProgressionContext(char);
      expect(ctx).not.toContain('pending spell swap');
    });
  });
});
