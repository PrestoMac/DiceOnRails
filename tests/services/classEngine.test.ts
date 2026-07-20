import { describe, it, expect } from 'vitest';
import { Character } from '../../types';
import { calculateMaxHp, calculateAc, getProficiencyBonus, getSavingThrowBonus, calculateSpeed, getDarkvisionRange, canEquipArmor, getSpellSaveDc, getSpellAttackBonus, getDamageResistances } from '../../services/classEngine';
import { applyCondition } from '../../services/conditionEngine';

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    id: 'test', name: 'Test', class: 'fighter', race: 'human', level: 1,
    hp: { current: 10, max: 10 },
    stats: { str: 14, dex: 12, con: 14, int: 10, wis: 10, cha: 10 },
    inventory: [], currency: { gp: 0, sp: 0, cp: 0 },
    location: 'Test', experience: 0, experienceToNextLevel: 300,
    unusedStatPoints: 0, maxHpBonus: 0, hitDice: { current: 1, max: 1 },
    resources: [], knownSpells: [], preparedSpells: [], racialTraits: [], unlockedSubclassFeatures: [],
    ...overrides,
  };
}

describe('classEngine', () => {
  describe('calculateMaxHp', () => {
    it('calculates HP for L1 Fighter (CON 14)', () => {
      expect(calculateMaxHp(makeChar())).toBe(12);
    });

    it('scales HP with level', () => {
      expect(calculateMaxHp(makeChar({ level: 5 }))).toBe(10 + 2 + (6 + 2) * 4);
    });

    it('adds Draconic Resilience for Draconic Bloodline Sorcerer', () => {
      const char = makeChar({ class: 'sorcerer', sorcerousOrigin: 'draconic-bloodline', level: 3, stats: { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 15 } });
      const hp = calculateMaxHp(char);
      expect(hp).toBeGreaterThan(6 + 1 + (4 + 1) * 2);
    });

    it('adds Tough feat bonus', () => {
      expect(calculateMaxHp(makeChar({ feats: ['tough'], level: 5 }))).toBe(10 + 2 + (6 + 2) * 4 + 10);
    });
  });

  describe('calculateAc', () => {
    it('Fighter in chain mail + shield', () => {
      const char = makeChar({ inventory: [{ name: 'Chain Mail', quantity: 1, type: 'armor', equipped: true, stats: { acFormula: '16' } }, { name: 'Shield', quantity: 1, type: 'shield', equipped: true }] });
      expect(calculateAc(char, { name: 'Chain Mail', quantity: 1, type: 'armor', equipped: true, stats: { acFormula: '16' } })).toBe(18);
    });

    it('Barbarian unarmored = 10 + DEX + CON', () => {
      const char = makeChar({ class: 'barbarian', stats: { str: 14, dex: 14, con: 16, int: 8, wis: 10, cha: 10 } });
      expect(calculateAc(char, null)).toBe(10 + 2 + 3);
    });

    it('Monk unarmored = 10 + DEX + WIS', () => {
      const char = makeChar({ class: 'monk', stats: { str: 10, dex: 16, con: 12, int: 8, wis: 16, cha: 10 } });
      expect(calculateAc(char, null)).toBe(10 + 3 + 3);
    });

    it('Sorcerer Draconic Resilience = 13 + DEX', () => {
      const char = makeChar({ class: 'sorcerer', sorcerousOrigin: 'draconic-bloodline', stats: { str: 8, dex: 16, con: 12, int: 10, wis: 10, cha: 15 } });
      expect(calculateAc(char, null)).toBe(13 + 3);
    });

    it('Wizard unarmored = 10 + DEX', () => {
      const char = makeChar({ class: 'wizard', stats: { str: 8, dex: 14, con: 12, int: 15, wis: 10, cha: 10 } });
      expect(calculateAc(char, null)).toBe(10 + 2);
    });

    it('Dual Wielder feat adds +1 with two weapons', () => {
      const char = makeChar({ feats: ['dual-wielder'], stats: { str: 12, dex: 14, con: 14, int: 10, wis: 10, cha: 10 }, inventory: [{ name: 'Shortsword', quantity: 1, type: 'weapon', equipped: true }, { name: 'Scimitar', quantity: 1, type: 'weapon', equipped: true }] });
      expect(calculateAc(char, null)).toBe(10 + 2 + 1);
    });
  });

  describe('getProficiencyBonus', () => {
    it('returns +2 at L1', () => expect(getProficiencyBonus(makeChar())).toBe(2));
    it('returns +3 at L5', () => expect(getProficiencyBonus(makeChar({ level: 5 }))).toBe(3));
    it('returns +4 at L9', () => expect(getProficiencyBonus(makeChar({ level: 9 }))).toBe(4));
    it('returns +5 at L13', () => expect(getProficiencyBonus(makeChar({ level: 13 }))).toBe(5));
    it('returns +6 at L17', () => expect(getProficiencyBonus(makeChar({ level: 17 }))).toBe(6));
  });

  describe('getSavingThrowBonus', () => {
    it('Fighter has STR save proficiency', () => {
      const bonus = getSavingThrowBonus(makeChar(), 'str');
      expect(bonus).toBe(2 + 2);
    });

    it('Fighter does not have INT save proficiency', () => {
      const bonus = getSavingThrowBonus(makeChar(), 'int');
      expect(bonus).toBe(0);
    });
  });

  describe('calculateSpeed', () => {
    it('Human base speed is 30', () => expect(calculateSpeed(makeChar())).toBe(30));
    it('Dwarf base speed is 25', () => expect(calculateSpeed(makeChar({ race: 'dwarf' }))).toBe(25));
    it('Halfling base speed is 25', () => expect(calculateSpeed(makeChar({ race: 'halfling' }))).toBe(25));
    it('Mobile feat adds 10', () => expect(calculateSpeed(makeChar({ feats: ['mobile'] }))).toBe(40));
    it('exhaustion level 3 reduces speed by 15 ft', () => {
      const char = makeChar();
      applyCondition(char, { id: 'exhaustion-3', source: 'fatigue', duration: Infinity, durationUnit: 'minute' });
      const speed = calculateSpeed(char);
      expect(speed).toBe(15);
    });
  });

  describe('getDarkvisionRange', () => {
    it('Elf has 60 ft darkvision', () => expect(getDarkvisionRange(makeChar({ race: 'elf' }))).toBe(60));
    it('Human has no darkvision', () => expect(getDarkvisionRange(makeChar({ race: 'human' }))).toBe(0));
    it('Dwarf has 60 ft darkvision', () => expect(getDarkvisionRange(makeChar({ race: 'dwarf' }))).toBe(60));
    it('Half-Orc has 60 ft darkvision', () => expect(getDarkvisionRange(makeChar({ race: 'half-orc' }))).toBe(60));
  });

  describe('canEquipArmor', () => {
    it('Wizard cannot equip heavy armor', () => expect(canEquipArmor(makeChar({ class: 'wizard' }), 'heavy')).toBe(false));
    it('Wizard cannot equip medium armor', () => expect(canEquipArmor(makeChar({ class: 'wizard' }), 'medium')).toBe(false));
    it('Fighter can equip heavy armor', () => expect(canEquipArmor(makeChar({ class: 'fighter' }), 'heavy')).toBe(true));
    it('Cleric Life Domain can equip heavy armor', () => expect(canEquipArmor(makeChar({ class: 'cleric', divineDomain: 'life-domain' }), 'heavy')).toBe(true));
  });

  describe('getSpellSaveDc / getSpellAttackBonus', () => {
    it('Wizard L1 with INT 15 has DC 13', () => {
      const char = makeChar({ class: 'wizard', stats: { str: 8, dex: 14, con: 12, int: 15, wis: 10, cha: 10 } });
      expect(getSpellSaveDc(char)).toBe(8 + 2 + 2);
    });

    it('Wizard L1 with INT 15 has +4 spell attack', () => {
      const char = makeChar({ class: 'wizard', stats: { str: 8, dex: 14, con: 12, int: 15, wis: 10, cha: 10 } });
      expect(getSpellAttackBonus(char)).toBe(2 + 2);
    });

    it('Fighter has no spellcasting', () => {
      expect(getSpellSaveDc(makeChar())).toBe(0);
      expect(getSpellAttackBonus(makeChar())).toBe(0);
    });
  });

  describe('getDamageResistances', () => {
    it('Dwarf has poison resistance', () => {
      const char = makeChar({ race: 'dwarf', racialTraits: ['dwarven-resilience'] });
      expect(getDamageResistances(char)).toContain('poison');
    });

    it('Tiefling has fire resistance from hellish-resistance', () => {
      const char = makeChar({ race: 'tiefling', racialTraits: ['hellish-resistance'] });
      expect(getDamageResistances(char)).toContain('fire');
    });
  });
});
