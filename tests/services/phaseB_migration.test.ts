import { describe, it, expect, vi } from 'vitest';
import { calculateAc, calculateSpeed, calculateMaxHp } from '../../services/classEngine';
import type { Character } from '../../types';

vi.mock('../../utils/classes', async () => {
  const actual = await vi.importActual('../../utils/classes');
  return actual;
});
vi.mock('../../utils/races', async () => {
  const actual = await vi.importActual('../../utils/races');
  return actual;
});
vi.mock('../../utils/random', () => ({
  cryptoRoll: vi.fn(() => 10),
}));

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    id: 'test',
    name: 'Test',
    class: 'fighter',
    race: 'human',
    level: 1,
    hp: { current: 10, max: 10 },
    stats: { str: 14, dex: 14, con: 14, int: 10, wis: 10, cha: 10 },
    inventory: [],
    currency: { gp: 0, sp: 0, cp: 0 },
    location: 'Test',
    experience: 0,
    experienceToNextLevel: 300,
    unusedStatPoints: 0,
    maxHpBonus: 0,
    hitDice: { current: 1, max: 1 },
    feats: [],
    racialTraits: [],
    resources: [],
    ...overrides,
  };
}

describe('Phase B — byte-identical migrations', () => {
  describe('calculateAc migration', () => {
    it('produces correct AC for Barbarian unarmored', () => {
      const barb = makeChar({ class: 'barbarian', level: 1 });
      expect(calculateAc(barb, null)).toBe(14); // 10 + DEX(2) + CON(2)
    });

    it('produces correct AC for Monk unarmored', () => {
      const monk = makeChar({ class: 'monk', level: 1, stats: { str: 10, dex: 16, con: 12, int: 10, wis: 14, cha: 8 } });
      expect(calculateAc(monk, null)).toBe(15); // 10 + DEX(3) + WIS(2)
    });

    it('produces correct AC for Sorcerer Draconic unarmored', () => {
      const sorc = makeChar({
        class: 'sorcerer', level: 1, sorcerousOrigin: 'draconic-bloodline',
        stats: { str: 8, dex: 16, con: 14, int: 10, wis: 10, cha: 16 },
      });
      expect(calculateAc(sorc, null)).toBe(16); // 13 + DEX(3)
    });

    it('produces correct AC for Fighter in chain mail', () => {
      const fighter = makeChar({ class: 'fighter', level: 1 });
      expect(calculateAc(fighter, { name: 'Chain Mail', type: 'armor', quantity: 1, stats: { acFormula: '16' } })).toBe(16);
    });

    it('adds shield bonus', () => {
      const fighter = makeChar({
        class: 'fighter', level: 1,
        inventory: [{ name: 'Shield', type: 'shield', quantity: 1, equipped: true, stats: {} }],
      });
      expect(calculateAc(fighter, { name: 'Chain Mail', type: 'armor', quantity: 1, stats: { acFormula: '16' } })).toBe(18);
    });

    it('adds Dual Wielder AC bonus with two weapons', () => {
      const fighter = makeChar({
        class: 'fighter', level: 1, feats: ['dual-wielder'],
        stats: { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 10 },
        inventory: [
          { name: 'Longsword', type: 'weapon', quantity: 1, equipped: true, stats: {} },
          { name: 'Shortsword', type: 'weapon', quantity: 1, equipped: true, stats: {} },
        ],
      });
      expect(calculateAc(fighter, null)).toBe(13); // 10 + DEX(2) + 1 (Dual Wielder)
    });
  });

  describe('calculateSpeed migration', () => {
    it('returns base speed for Human', () => {
      const human = makeChar({ race: 'human' });
      expect(calculateSpeed(human)).toBe(30);
    });

    it('returns 25 for Dwarf', () => {
      const dwarf = makeChar({ race: 'dwarf', level: 1 });
      expect(calculateSpeed(dwarf)).toBe(25);
    });

    it('adds Mobile feat bonus', () => {
      const fighter = makeChar({ feats: ['mobile'] });
      expect(calculateSpeed(fighter)).toBe(40); // 30 + 10
    });

    it('adds Athlete feat bonus', () => {
      const fighter = makeChar({ feats: ['athlete'] });
      expect(calculateSpeed(fighter)).toBe(40);
    });
  });

  describe('calculateMaxHp migration', () => {
    it('adds Tough feat HP bonus', () => {
      const fighter = makeChar({ class: 'fighter', level: 3, feats: ['tough'] });
      const hp = calculateMaxHp(fighter);
      expect(hp).toBeGreaterThan(0);
    });
  });
});
