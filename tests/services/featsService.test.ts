import { describe, it, expect } from 'vitest';
import {
  ASI_LEVELS,
  isAsiLevel,
  getFeat,
  hasFeat,
  getAllFeats,
  validateFeatPrereqs,
  hasArmorProficiency,
  getOffHandAbilityModifier,
  shouldRerollDamageDie,
  rerollDamageValueIfApplicable,
  getHeavyArmorMasterReduction,
  getAlertInitiativeBonus,
  getSpeedBonus,
  getResilientSaveBonus,
  getShieldMasterSaveBonus,
  getProficiencyBonus,
  getToughHpBonus,
  getMaxHp,
  getDualWielderAcBonus,
  applyAsiChoice,
  applyFeatChoice,
  filterAvailableFeats,
  ensureCharacterFeatFields
} from '../../services/featsService';
import { FEATS_CATALOG, getFeatById } from '../../utils/feats';
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
  } as Character;
}

describe('featsService', () => {
  describe('ASI_LEVELS', () => {
    it('contains the standard 5E ASI levels', () => {
      expect(ASI_LEVELS.length).toBe(6);
      expect(ASI_LEVELS.every(l => l >= 1 && l <= 20)).toBe(true);
      expect(ASI_LEVELS).toEqual([...ASI_LEVELS].sort((a, b) => a - b));
    });

    it('isAsiLevel identifies ASI levels', () => {
      expect(isAsiLevel(1)).toBe(true);
      expect(isAsiLevel(4)).toBe(true);
      expect(isAsiLevel(8)).toBe(true);
      expect(isAsiLevel(12)).toBe(true);
      expect(isAsiLevel(16)).toBe(true);
      expect(isAsiLevel(19)).toBe(true);
    });

    it('isAsiLevel returns false for non-ASI levels', () => {
      expect(isAsiLevel(2)).toBe(false);
      expect(isAsiLevel(3)).toBe(false);
      expect(isAsiLevel(20)).toBe(false);
    });
  });

  describe('catalog', () => {
    it('contains feats', () => {
      expect(FEATS_CATALOG.length).toBeGreaterThan(20);
    });

    it('all feats have unique ids', () => {
      const ids = new Set(FEATS_CATALOG.map(f => f.id));
      expect(ids.size).toBe(FEATS_CATALOG.length);
    });

    it('does not include lucky or sharpshooter', () => {
      expect(getFeatById('lucky')).toBeUndefined();
      expect(getFeatById('sharpshooter')).toBeUndefined();
    });

    it('includes the requested core feats', () => {
      expect(getFeatById('two-weapon-fighting')).toBeDefined();
      expect(getFeatById('great-weapon-fighting')).toBeDefined();
      expect(getFeatById('tough')).toBeDefined();
      expect(getFeatById('alert')).toBeDefined();
      expect(getFeatById('heavy-armor-master')).toBeDefined();
      expect(getFeatById('resilient')).toBeDefined();
    });
  });

  describe('hasFeat / getFeat / getAllFeats', () => {
    it('hasFeat returns false for characters without feats', () => {
      const c = makeCharacter();
      expect(hasFeat(c, 'tough')).toBe(false);
    });

    it('hasFeat returns true for characters with the feat', () => {
      const c = makeCharacter({ feats: ['tough'] });
      expect(hasFeat(c, 'tough')).toBe(true);
    });

    it('getFeat returns the feat definition when the character has it', () => {
      const c = makeCharacter({ feats: ['tough'] });
      expect(getFeat(c, 'tough')?.id).toBe('tough');
    });

    it('getFeat returns undefined for feats the character does not have', () => {
      const c = makeCharacter({ feats: ['tough'] });
      expect(getFeat(c, 'alert')).toBeUndefined();
    });

    it('getAllFeats returns all feat definitions', () => {
      const c = makeCharacter({ feats: ['tough', 'alert'] });
      const all = getAllFeats(c);
      expect(all.length).toBe(2);
      expect(all.map(f => f.id).sort()).toEqual(['alert', 'tough']);
    });
  });

  describe('validateFeatPrereqs', () => {
    it('rejects unknown feats', () => {
      const c = makeCharacter();
      const v = validateFeatPrereqs(c, 'not-a-real-feat');
      expect(v.ok).toBe(false);
    });

    it('rejects feats already taken', () => {
      const c = makeCharacter({ feats: ['tough'] });
      const v = validateFeatPrereqs(c, 'tough');
      expect(v.ok).toBe(false);
    });

    it('passes for feats with no prerequisites', () => {
      const c = makeCharacter();
      const v = validateFeatPrereqs(c, 'tough');
      expect(v.ok).toBe(true);
    });

    it('rejects feats with unmet stat prerequisites', () => {
      const c = makeCharacter({ stats: { str: 10, dex: 10, con: 14, int: 8, wis: 12, cha: 14 } });
      const v = validateFeatPrereqs(c, 'defensive-duelist');
      expect(v.ok).toBe(false);
    });

    it('passes feats with met stat prerequisites', () => {
      const c = makeCharacter({ stats: { str: 10, dex: 14, con: 14, int: 8, wis: 12, cha: 14 } });
      const v = validateFeatPrereqs(c, 'defensive-duelist');
      expect(v.ok).toBe(true);
    });

    it('rejects feats with unmet armor prerequisites', () => {
      const c = makeCharacter();
      const v = validateFeatPrereqs(c, 'heavily-armored');
      expect(v.ok).toBe(false);
    });

    it('passes feats with met armor prerequisites', () => {
      const c = makeCharacter({ feats: ['lightly-armored'] });
      const v = validateFeatPrereqs(c, 'moderately-armored');
      expect(v.ok).toBe(true);
    });
  });

  describe('armor proficiency', () => {
    it('grants light armor proficiency from lightly-armored', () => {
      const c = makeCharacter({ feats: ['lightly-armored'] });
      expect(hasArmorProficiency(c, 'light')).toBe(true);
    });

    it('grants medium armor proficiency from moderately-armored', () => {
      const c = makeCharacter({ feats: ['lightly-armored', 'moderately-armored'] });
      expect(hasArmorProficiency(c, 'medium')).toBe(true);
    });

    it('grants heavy armor proficiency from heavily-armored', () => {
      const c = makeCharacter({ feats: ['lightly-armored', 'moderately-armored', 'heavily-armored'] });
      expect(hasArmorProficiency(c, 'heavy')).toBe(true);
    });

    it('no feats = no armor proficiency', () => {
      const c = makeCharacter();
      expect(hasArmorProficiency(c, 'light')).toBe(false);
    });
  });

  describe('Two-Weapon Fighting off-hand modifier', () => {
    it('returns 0 without the feat', () => {
      const c = makeCharacter({ stats: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 14 } });
      expect(getOffHandAbilityModifier(c)).toBe(0);
    });

    it('returns STR modifier with the feat', () => {
      const c = makeCharacter({
        stats: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 14 },
        feats: ['two-weapon-fighting']
      });
      expect(getOffHandAbilityModifier(c)).toBe(3);
    });
  });

  describe('Great Weapon Fighting reroll', () => {
    it('does not reroll without the feat', () => {
      const c = makeCharacter();
      const weapon = { name: 'Greatsword', quantity: 1, type: 'weapon' as const, stats: { properties: ['heavy'] } };
      expect(shouldRerollDamageDie(c, weapon, false)).toBe(false);
    });

    it('rerolls 1s and 2s on heavy weapons with the feat', () => {
      const c = makeCharacter({ feats: ['great-weapon-fighting'] });
      const weapon = { name: 'Greatsword', quantity: 1, type: 'weapon' as const, stats: { properties: ['heavy'] } };
      expect(shouldRerollDamageDie(c, weapon, false)).toBe(true);
    });

    it('does not reroll off-hand attacks', () => {
      const c = makeCharacter({ feats: ['great-weapon-fighting'] });
      const weapon = { name: 'Greatsword', quantity: 1, type: 'weapon' as const, stats: { properties: ['heavy'] } };
      expect(shouldRerollDamageDie(c, weapon, true)).toBe(false);
    });

    it('rerollDamageValueIfApplicable rerolls low values', () => {
      const c = makeCharacter({ feats: ['great-weapon-fighting'] });
      const weapon = { name: 'Greatsword', quantity: 1, type: 'weapon' as const, stats: { properties: ['heavy'] } };
      const r1 = rerollDamageValueIfApplicable(c, weapon, false, 6, 1);
      expect(r1).toBeGreaterThanOrEqual(1);
      expect(r1).toBeLessThanOrEqual(6);
      expect(rerollDamageValueIfApplicable(c, weapon, false, 6, 5)).toBe(5);
    });
  });

  describe('Heavy Armor Master', () => {
    it('returns 0 without the feat', () => {
      const c = makeCharacter();
      expect(getHeavyArmorMasterReduction(c, 'slashing')).toBe(0);
    });

    it('returns 0 with the feat but no heavy armor', () => {
      const c = makeCharacter({ feats: ['heavy-armor-master'] });
      expect(getHeavyArmorMasterReduction(c, 'slashing')).toBe(0);
    });

    it('returns 3 with feat + heavy armor + matching damage type', () => {
      const c = makeCharacter({
        feats: ['heavy-armor-master'],
        inventory: [{ name: 'Plate', quantity: 1, type: 'armor', equipped: true, stats: { acFormula: '18' } }]
      });
      expect(getHeavyArmorMasterReduction(c, 'slashing')).toBe(3);
    });

    it('returns 0 for fire damage (not bludgeoning/piercing/slashing)', () => {
      const c = makeCharacter({
        feats: ['heavy-armor-master'],
        inventory: [{ name: 'Plate', quantity: 1, type: 'armor', equipped: true, stats: { acFormula: '18' } }]
      });
      expect(getHeavyArmorMasterReduction(c, 'fire')).toBe(0);
    });
  });

  describe('Alert', () => {
    it('returns 0 without the feat', () => {
      const c = makeCharacter();
      expect(getAlertInitiativeBonus(c)).toBe(0);
    });

    it('returns 5 with the feat', () => {
      const c = makeCharacter({ feats: ['alert'] });
      expect(getAlertInitiativeBonus(c)).toBe(5);
    });
  });

  describe('Mobile speed bonus', () => {
    it('returns 0 without feats', () => {
      const c = makeCharacter();
      expect(getSpeedBonus(c)).toBe(0);
    });

    it('returns 10 with mobile', () => {
      const c = makeCharacter({ feats: ['mobile'] });
      expect(getSpeedBonus(c)).toBe(10);
    });

    it('stacks mobile + athlete', () => {
      const c = makeCharacter({ feats: ['mobile', 'athlete'] });
      expect(getSpeedBonus(c)).toBe(20);
    });
  });

  describe('Resilient save bonus', () => {
    it('returns 0 without the feat', () => {
      const c = makeCharacter();
      expect(getResilientSaveBonus(c, 'con')).toBe(0);
    });

    it('returns prof bonus on the chosen save', () => {
      const c = makeCharacter({ level: 5, feats: ['resilient'], featChoices: { resilient: { saveStat: 'con' } } });
      expect(getResilientSaveBonus(c, 'con')).toBe(getProficiencyBonus(c));
    });

    it('returns 0 on a different save', () => {
      const c = makeCharacter({ level: 5, feats: ['resilient'], featChoices: { resilient: { saveStat: 'con' } } });
      expect(getResilientSaveBonus(c, 'wis')).toBe(0);
    });
  });

  describe('Shield Master save bonus', () => {
    it('returns 0 without the feat', () => {
      const c = makeCharacter();
      expect(getShieldMasterSaveBonus(c, 'dex')).toBe(0);
    });

    it('returns 0 for non-dex saves', () => {
      const c = makeCharacter({
        feats: ['shield-master'],
        inventory: [{ name: 'Shield', quantity: 1, type: 'shield', equipped: true }]
      });
      expect(getShieldMasterSaveBonus(c, 'con')).toBe(0);
    });

    it('returns 2 for dex saves with shield equipped', () => {
      const c = makeCharacter({
        feats: ['shield-master'],
        inventory: [{ name: 'Shield', quantity: 1, type: 'shield', equipped: true }]
      });
      expect(getShieldMasterSaveBonus(c, 'dex')).toBe(2);
    });

    it('returns 0 for dex saves without shield equipped', () => {
      const c = makeCharacter({
        feats: ['shield-master'],
        inventory: [{ name: 'Shield', quantity: 1, type: 'shield', equipped: false }]
      });
      expect(getShieldMasterSaveBonus(c, 'dex')).toBe(0);
    });
  });

  describe('Tough HP bonus', () => {
    it('returns 0 without the feat', () => {
      const c = makeCharacter({ level: 5 });
      expect(getToughHpBonus(c)).toBe(0);
    });

    it('returns 2 * level with the feat', () => {
      const c = makeCharacter({ level: 5, feats: ['tough'] });
      expect(getToughHpBonus(c)).toBe(10);
    });
  });

  describe('getMaxHp includes Tough bonus', () => {
    it('adds 2 HP per level when Tough is taken', () => {
      const c1 = makeCharacter({ level: 5 });
      const c2 = makeCharacter({ level: 5, feats: ['tough'] });
      expect(getMaxHp(c2) - getMaxHp(c1)).toBe(10);
    });
  });

  describe('Dual Wielder AC bonus', () => {
    it('returns 0 without the feat', () => {
      const c = makeCharacter();
      expect(getDualWielderAcBonus(c)).toBe(0);
    });

    it('returns 1 with feat and two equipped weapons', () => {
      const c = makeCharacter({
        feats: ['dual-wielder'],
        inventory: [
          { name: 'Shortsword', quantity: 1, type: 'weapon', equipped: true },
          { name: 'Dagger', quantity: 1, type: 'weapon', equipped: true }
        ]
      });
      expect(getDualWielderAcBonus(c)).toBe(1);
    });

    it('returns 0 with feat but only one equipped weapon', () => {
      const c = makeCharacter({
        feats: ['dual-wielder'],
        inventory: [
          { name: 'Shortsword', quantity: 1, type: 'weapon', equipped: true }
        ]
      });
      expect(getDualWielderAcBonus(c)).toBe(0);
    });
  });

  describe('applyAsiChoice', () => {
    it('applies 2 points to a single stat', () => {
      const c = makeCharacter({ stats: { str: 14, dex: 10, con: 14, int: 8, wis: 12, cha: 14 } });
      const r = applyAsiChoice(c, { str: 2 }, 4);
      expect(r.errors).toEqual([]);
      expect(r.character.stats.str).toBe(16);
    });

    it('applies 1 to two stats', () => {
      const c = makeCharacter({ stats: { str: 14, dex: 10, con: 14, int: 8, wis: 12, cha: 14 } });
      const r = applyAsiChoice(c, { str: 1, dex: 1 }, 4);
      expect(r.errors).toEqual([]);
      expect(r.character.stats.str).toBe(15);
      expect(r.character.stats.dex).toBe(11);
    });

    it('rejects allocation not equal to 2', () => {
      const c = makeCharacter();
      const r = applyAsiChoice(c, { str: 1 }, 4);
      expect(r.errors.length).toBeGreaterThan(0);
    });

    it('rejects allocation exceeding 20', () => {
      const c = makeCharacter({ stats: { str: 20, dex: 10, con: 14, int: 8, wis: 12, cha: 14 } });
      const r = applyAsiChoice(c, { str: 2 }, 4);
      expect(r.errors.length).toBeGreaterThan(0);
    });

    it('clears pendingFeatChoice and records the selection', () => {
      const c = makeCharacter({ pendingFeatChoice: true });
      const r = applyAsiChoice(c, { str: 2 }, 4);
      expect(r.character.pendingFeatChoice).toBe(false);
      expect(r.character.featSelections).toBeDefined();
      expect(r.character.featSelections?.length).toBe(1);
      expect(r.character.featSelections?.[0]).toEqual({ level: 4, type: 'asi', statAllocations: { str: 2 } });
    });
  });

  describe('applyFeatChoice', () => {
    it('adds the feat to the character', () => {
      const c = makeCharacter();
      const r = applyFeatChoice(c, 'tough', 1);
      expect(r.errors).toEqual([]);
      expect(r.character.feats).toContain('tough');
    });

    it('records featSelections', () => {
      const c = makeCharacter();
      const r = applyFeatChoice(c, 'tough', 1);
      expect(r.character.featSelections?.[0]).toEqual({ level: 1, type: 'feat', featId: 'tough', statAllocations: undefined });
    });

    it('rejects when prerequisites not met', () => {
      const c = makeCharacter({ stats: { str: 10, dex: 10, con: 14, int: 8, wis: 12, cha: 14 } });
      const r = applyFeatChoice(c, 'defensive-duelist', 1);
      expect(r.errors.length).toBeGreaterThan(0);
    });

    it('rejects when feat already taken', () => {
      const c = makeCharacter({ feats: ['tough'] });
      const r = applyFeatChoice(c, 'tough', 4);
      expect(r.errors.length).toBeGreaterThan(0);
    });

    it('applies save stat choice for resilient', () => {
      const c = makeCharacter();
      const r = applyFeatChoice(c, 'resilient', 4, { saveStatChoice: 'wis' });
      expect(r.errors).toEqual([]);
      expect(r.character.featChoices?.['resilient']?.saveStat).toBe('wis');
    });

    it('applies skill choices for skilled', () => {
      const c = makeCharacter();
      const r = applyFeatChoice(c, 'skilled', 4, { skillChoices: ['stealth', 'perception', 'athletics'] });
      expect(r.errors).toEqual([]);
      expect(r.character.skills?.['stealth']).toBe(1);
      expect(r.character.skills?.['perception']).toBe(1);
      expect(r.character.skills?.['athletics']).toBe(1);
    });

    it('clears pendingFeatChoice', () => {
      const c = makeCharacter({ pendingFeatChoice: true });
      const r = applyFeatChoice(c, 'tough', 1);
      expect(r.character.pendingFeatChoice).toBe(false);
    });
  });

  describe('filterAvailableFeats', () => {
    it('excludes already-taken feats', () => {
      const c = makeCharacter({ feats: ['tough'] });
      const filtered = filterAvailableFeats(c);
      expect(filtered.find(f => f.id === 'tough')).toBeUndefined();
    });

    it('filters by search term', () => {
      const c = makeCharacter();
      const filtered = filterAvailableFeats(c, 'armor');
      expect(filtered.some(f => f.id === 'heavily-armored')).toBe(true);
    });
  });

  describe('ensureCharacterFeatFields', () => {
    it('fills missing feat fields with defaults', () => {
      const c = makeCharacter();
      
      delete (c as any).feats;
      
      delete (c as any).featSelections;
      
      delete (c as any).featChoices;
      
      (c as any).pendingFeatChoice = undefined;
      const updated = ensureCharacterFeatFields(c);
      expect(updated.feats).toEqual([]);
      expect(updated.featSelections).toEqual([]);
      expect(updated.featChoices).toEqual({});
      expect(updated.pendingFeatChoice).toBe(false);
    });
  });
});
