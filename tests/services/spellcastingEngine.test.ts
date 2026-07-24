import { describe, it, expect, vi } from 'vitest';
import { Character, Enemy } from '../../types';
import { hasSpellSlot, consumeSpellSlot, getCantripsKnown, getSpellsKnown, getMaxPrepared, castSpell, breakConcentration, checkConcentrationExpiry, canLearnSpell, learnSpell, prepareSpell, unprepareSpell } from '../../services/spellcastingEngine';

const mockCryptoRoll = vi.fn();
vi.mock('../../utils/random', () => ({
  cryptoRoll: (...args: number[]) => mockCryptoRoll(...args),
}));
mockCryptoRoll.mockImplementation((sides: number) => sides === 20 ? 10 : 3);

function makeWizard(overrides: Partial<Character> = {}): Character {
  return {
    id: 'wiz1', name: 'Morden', class: 'wizard', race: 'human', level: 5,
    hp: { current: 20, max: 20 },
    stats: { str: 8, dex: 14, con: 12, int: 18, wis: 10, cha: 10 },
    inventory: [{ name: 'Spellbook', quantity: 1, type: 'gear' }],
    currency: { gp: 10, sp: 0, cp: 0 },
    location: 'Test', experience: 0, experienceToNextLevel: 300,
    unusedStatPoints: 0, maxHpBonus: 0, hitDice: { current: 5, max: 5 },
    resources: [
      { id: 'spell-slot-1', name: 'L1 Slots', current: 4, max: 4, resetOn: 'long', source: 'class', sourceId: 'wizard' },
      { id: 'spell-slot-2', name: 'L2 Slots', current: 3, max: 3, resetOn: 'long', source: 'class', sourceId: 'wizard' },
      { id: 'spell-slot-3', name: 'L3 Slots', current: 2, max: 2, resetOn: 'long', source: 'class', sourceId: 'wizard' },
    ],
    knownSpells: ['fireball', 'magic-missile', 'shield', 'burning-hands', 'color-spray'],
    preparedSpells: ['fireball', 'magic-missile', 'shield'],
    racialTraits: [], unlockedSubclassFeatures: [],
    ...overrides,
  };
}

function makeBard(overrides: Partial<Character> = {}): Character {
  return {
    id: 'bard1', name: 'Lute', class: 'bard', race: 'elf', level: 3,
    hp: { current: 15, max: 15 },
    stats: { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 16 },
    inventory: [],
    currency: { gp: 10, sp: 0, cp: 0 },
    location: 'Test', experience: 0, experienceToNextLevel: 900,
    unusedStatPoints: 0, maxHpBonus: 0, hitDice: { current: 3, max: 3 },
    resources: [
      { id: 'spell-slot-1', name: 'L1 Slots', current: 4, max: 4, resetOn: 'long', source: 'class', sourceId: 'bard' },
      { id: 'spell-slot-2', name: 'L2 Slots', current: 2, max: 2, resetOn: 'long', source: 'class', sourceId: 'bard' },
    ],
    knownSpells: ['cure-wounds', 'faerie-fire', 'sleep', 'thunderwave'],
    preparedSpells: [],
    racialTraits: [], unlockedSubclassFeatures: [],
    ...overrides,
  };
}

describe('spellcastingEngine', () => {
  describe('hasSpellSlot / consumeSpellSlot', () => {
    it('Wizard has L1 slots', () => expect(hasSpellSlot(makeWizard(), 1)).toBe(true));
    it('Wizard has no L4 slots', () => expect(hasSpellSlot(makeWizard(), 4)).toBe(false));
    it('consumeSpellSlot reduces count', () => {
      const wiz = makeWizard();
      expect(consumeSpellSlot(wiz, 1)).toBe(true);
      expect(wiz.resources[0].current).toBe(3);
    });
    it('consumeSpellSlot fails when empty', () => {
      const wiz = makeWizard({ resources: [ { id: 'spell-slot-1', name: 'L1 Slots', current: 0, max: 4, resetOn: 'long', source: 'class', sourceId: 'wizard' } ] });
      expect(consumeSpellSlot(wiz, 1)).toBe(false);
    });
  });

  describe('getCantripsKnown', () => {
    it('Wizard L1 knows 3 cantrips', () => expect(getCantripsKnown(makeWizard({ level: 1 }), 1)).toBe(3));
    it('Wizard L5 knows 4 cantrips', () => expect(getCantripsKnown(makeWizard({ level: 5 }), 5)).toBe(4));
    it('Fighter knows 0 cantrips', () => expect(getCantripsKnown(makeWizard({ class: 'fighter' }), 1)).toBe(0));
  });

  describe('getSpellsKnown', () => {
    it('Bard L3 knows 6 spells', () => expect(getSpellsKnown(makeBard(), 3)).toBe(6));
    it('Wizard returns 0 (prepared caster)', () => expect(getSpellsKnown(makeWizard(), 5)).toBe(0));
  });

  describe('getMaxPrepared', () => {
    it('Wizard L5 with INT 18 can prepare 9 spells', () => expect(getMaxPrepared(makeWizard(), 5)).toBe(5 + 4));
  });

  describe('canLearnSpell / learnSpell', () => {
    it('Bard can learn cure-wounds', () => {
      const result = canLearnSpell(makeBard(), 'cure-wounds');
      expect(result.ok).toBe(true);
    });

    it('Wizard cannot learn cure-wounds (not on wizard list)', () => {
      const result = canLearnSpell(makeWizard(), 'cure-wounds');
      expect(result.ok).toBe(false);
    });

    it('learnSpell adds to known list', () => {
      const bard = makeBard();
      learnSpell(bard, 'detect-magic');
      expect(bard.knownSpells).toContain('detect-magic');
    });
  });

  describe('prepareSpell / unprepareSpell', () => {
    it('Wizard can prepare a known spell', () => {
      const wiz = makeWizard();
      const result = prepareSpell(wiz, 'burning-hands');
      expect(result.ok).toBe(true);
      expect(wiz.preparedSpells).toContain('burning-hands');
    });

    it('Bard cannot prepare spells', () => {
      const result = prepareSpell(makeBard(), 'cure-wounds');
      expect(result.ok).toBe(false);
    });

    it('unprepareSpell removes from prepared list', () => {
      const wiz = makeWizard();
      expect(unprepareSpell(wiz, 'fireball')).toBe(true);
      expect(wiz.preparedSpells).not.toContain('fireball');
    });
  });

  describe('castSpell', () => {
    it('cantrip does not consume slot', () => {
      const wiz = makeWizard({ knownSpells: ['fire-bolt', 'magic-missile'], preparedSpells: ['fire-bolt'] });
      const resourcesBefore = wiz.resources[0].current;
      castSpell(wiz, 'fire-bolt', 0, [{ id: 'goblin' }]);
      expect(wiz.resources[0].current).toBe(resourcesBefore);
    });

    it('leveled spell consumes slot', () => {
      const wiz = makeWizard();
      const before = wiz.resources[2].current;
      castSpell(wiz, 'fireball', 3, [{ id: 'goblin1' }, { id: 'goblin2' }]);
      expect(wiz.resources[2].current).toBe(before - 1);
    });

    it('sets concentration for concentration spells', () => {
      const wiz = makeWizard({ preparedSpells: ['bless', 'fireball', 'magic-missile', 'shield'] });
      expect(wiz.concentrationSpellId).toBeUndefined();
      castSpell(wiz, 'bless', 1, [{ id: 'ally' }]);
      expect(wiz.concentrationSpellId).toBe('bless');
    });

    it('upcasting uses higher slot and applies scaling', () => {
      const wiz = makeWizard({ resources: [
        { id: 'spell-slot-1', name: 'L1 Slots', current: 4, max: 4, resetOn: 'long', source: 'class', sourceId: 'wizard' },
        { id: 'spell-slot-2', name: 'L2 Slots', current: 3, max: 3, resetOn: 'long', source: 'class', sourceId: 'wizard' },
        { id: 'spell-slot-3', name: 'L3 Slots', current: 2, max: 2, resetOn: 'long', source: 'class', sourceId: 'wizard' },
        { id: 'spell-slot-4', name: 'L4 Slots', current: 1, max: 1, resetOn: 'long', source: 'class', sourceId: 'wizard' },
      ]});
      const result = castSpell(wiz, 'fireball', 4, [{ id: 'goblin1' }, { id: 'goblin2' }]);
      expect(result.success).toBe(true);
      expect(result.damage).toBeDefined();
    });

    it('S1: upcast save-spell dice apply to EACH perTarget entry and recompute total (fireball slot 4)', () => {
      // default mock: d6=3. base 8d6 = 24; upcast +1d6 = 3 -> 27 per target.
      const wiz = makeWizard({ resources: [
        { id: 'spell-slot-1', name: 'L1', current: 4, max: 4, resetOn: 'long', source: 'class', sourceId: 'wizard' },
        { id: 'spell-slot-2', name: 'L2', current: 3, max: 3, resetOn: 'long', source: 'class', sourceId: 'wizard' },
        { id: 'spell-slot-3', name: 'L3', current: 2, max: 2, resetOn: 'long', source: 'class', sourceId: 'wizard' },
        { id: 'spell-slot-4', name: 'L4', current: 1, max: 1, resetOn: 'long', source: 'class', sourceId: 'wizard' },
      ]});
      const result = castSpell(wiz, 'fireball', 4, [{ id: 'g1' }, { id: 'g2' }]);
      expect(result.success).toBe(true);
      expect(result.damage?.perTarget?.[0].damage).toBe(27);
      expect(result.damage?.perTarget?.[1].damage).toBe(27);
      expect(result.damage?.total).toBe(54);
    });

    it('S2: save cantrips scale per target with character level (sacred flame L5)', () => {
      // L5 cantrip scaling = +1 die. base 1d8(3) + 1d8(3) = 6 per target.
      const cleric = makeWizard({ class: 'cleric', level: 5, knownSpells: ['sacred-flame'], preparedSpells: ['sacred-flame'] });
      const result = castSpell(cleric, 'sacred-flame', 0, [{ id: 'g1' }]);
      expect(result.success).toBe(true);
      expect(result.damage?.perTarget?.[0].damage).toBe(6);
    });

    it('S4: Magic Missile adds darts when upcast (slot 3 -> 5 darts)', () => {
      // 3 base darts + 2 upcast = 5; each 1d4(3)+1 = 4 -> total 20.
      const wiz = makeWizard();
      const result = castSpell(wiz, 'magic-missile', 3, [{ id: 'g1' }]);
      expect(result.success).toBe(true);
      expect(result.damage?.total).toBe(20);
    });

    it('cantrip requires known/prepared', () => {
      const result = castSpell(makeWizard({ knownSpells: [], preparedSpells: [] }), 'fire-bolt', 0);
      expect(result.success).toBe(false);
    });
  });

  describe('breakConcentration', () => {
    it('returns broken: false when no concentration', () => {
      const result = breakConcentration(makeWizard(), 'damaged', 10);
      expect(result.broken).toBe(false);
    });

    it('breaks concentration on damage when save fails', () => {
      const wiz = makeWizard({ concentrationSpellId: 'bless' });
      mockCryptoRoll.mockReturnValueOnce(1);
      const result = breakConcentration(wiz, 'damaged', 22);
      expect(result.broken).toBe(true);
      expect(result.dc).toBe(11);
      expect(result.d20Roll).toBe(1);
      expect(result.success).toBe(false);
      expect(wiz.concentrationSpellId).toBeUndefined();
    });

    it('maintains concentration on damage when save succeeds', () => {
      const wiz = makeWizard({ concentrationSpellId: 'bless' });
      mockCryptoRoll.mockReturnValueOnce(18);
      const result = breakConcentration(wiz, 'damaged', 5);
      expect(result.broken).toBe(false);
      expect(result.dc).toBe(10);
      expect(result.d20Roll).toBe(18);
      expect(result.success).toBe(true);
      expect(wiz.concentrationSpellId).toBe('bless');
    });
  });

  describe('HP Pool spells (Sleep)', () => {
    it('resolves HP pool for sleep spell', () => {
      const wizard = makeWizard({
        knownSpells: ['sleep'],
        preparedSpells: ['sleep'],
      });

      const mockCombat = {
        enemies: [
          { id: 'goblin-1', name: 'Goblin 1', hp: { current: 7, max: 7 }, ac: 13, stats: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 }, attacks: [], isDead: false },
          { id: 'goblin-2', name: 'Goblin 2', hp: { current: 5, max: 5 }, ac: 13, stats: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 }, attacks: [], isDead: false },
          { id: 'orc-1', name: 'Orc 1', hp: { current: 15, max: 15 }, ac: 13, stats: { str: 16, dex: 12, con: 13, int: 6, wis: 10, cha: 8 }, attacks: [], isDead: false },
        ] as Partial<Enemy>[],
        party: [wizard],
      };

      const result = castSpell(wizard, 'sleep', 1, [
        { id: 'goblin-1' },
        { id: 'goblin-2' },
        { id: 'orc-1' },
      ], mockCombat);

      expect(result.success).toBe(true);
      expect(result.affectedTargets).toBeDefined();
      if (result.affectedTargets && result.affectedTargets.length > 0) {
        expect(result.affectedTargets[0].targetId).toBe('goblin-2');
      }
    });

    it('affects no targets when pool is too small', () => {
      const wizard = makeWizard({
        knownSpells: ['sleep'],
        preparedSpells: ['sleep'],
      });

      const mockCombat = {
        enemies: [
          { id: 'dragon', name: 'Dragon', hp: { current: 200, max: 200 }, ac: 20, stats: { str: 20, dex: 10, con: 20, int: 10, wis: 10, cha: 10 }, attacks: [], isDead: false },
        ] as Partial<Enemy>[],
        party: [wizard],
      };

      const result = castSpell(wizard, 'sleep', 1, [{ id: 'dragon' }], mockCombat);

      expect(result.success).toBe(true);
      if (result.affectedTargets) {
        expect(result.affectedTargets.length).toBe(0);
      }
    });

    it('Color Spray affects targets using HP pool', () => {
      const wizard = makeWizard({
        knownSpells: ['color-spray'],
        preparedSpells: ['color-spray'],
      });

      const mockCombat = {
        enemies: [
          { id: 'goblin-1', name: 'Goblin 1', hp: { current: 8, max: 8 }, ac: 13, isDead: false },
          { id: 'goblin-2', name: 'Goblin 2', hp: { current: 3, max: 3 }, ac: 13, isDead: false },
          { id: 'orc-1', name: 'Orc 1', hp: { current: 20, max: 20 }, ac: 15, isDead: false },
        ] as Partial<Enemy>[],
        party: [wizard],
      };

      const result = castSpell(wizard, 'color-spray', 1, [
        { id: 'goblin-1' },
        { id: 'goblin-2' },
        { id: 'orc-1' },
      ], mockCombat);

      expect(result.success).toBe(true);
      expect(result.affectedTargets).toBeDefined();
      expect(result.affectedTargets?.length).toBe(2);
      expect(result.hasEffect).toBe(true);
    });
  });

  describe('concentration (C2 + helper)', () => {
    it('sets concentrationStarted on a fresh concentration cast (C2)', () => {
      const wiz = makeWizard({
        preparedSpells: ['magic-missile', 'shield', 'fireball', 'burning-hands', 'fire-bolt', 'hold-person'],
        knownSpells: ['magic-missile', 'shield', 'fireball', 'burning-hands', 'fire-bolt', 'hold-person'],
      });
      const result = castSpell(wiz, 'hold-person', 2, []);
      expect(result.success).toBe(true);
      expect(result.concentrationStarted).toBe(true);
      expect(wiz.concentrationSpellId).toBe('hold-person');
    });

    it('returns null and keeps concentration when within duration', () => {
      const wiz = makeWizard();
      wiz.concentrationSpellId = 'hold-person';
      wiz.runtime = { concentrationStartTime: 0, concentrationEffectiveDuration: 10 };
      expect(checkConcentrationExpiry(wiz, 5)).toBeNull();
      expect(wiz.concentrationSpellId).toBe('hold-person');
    });

    it('breaks concentration and returns spell name when duration exceeded', () => {
      const wiz = makeWizard();
      wiz.concentrationSpellId = 'hold-person';
      wiz.runtime = { concentrationStartTime: 0, concentrationEffectiveDuration: 10 };
      expect(checkConcentrationExpiry(wiz, 10)).toBe('Hold Person');
      expect(wiz.concentrationSpellId).toBeUndefined();
    });
  });
});
