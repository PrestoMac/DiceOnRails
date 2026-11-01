import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockMCPServer } from '../../services/mcpService';
import { makeCharacter } from '../helpers/characters';
import { createTestServer } from '../helpers/testServer';

vi.mock('../../utils/random', () => ({
  cryptoRoll: vi.fn(),
}));

vi.mock('../../utils/debug', () => ({
  isDebugMode: false,
}));

vi.mock('../../services/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        ilike: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    })),
  },
}));

const { cryptoRoll } = await import('../../utils/random');

function mockRoll(value: number) {
  vi.mocked(cryptoRoll).mockReturnValue(value);
}

function mockRollSequence(...values: number[]) {
  values.forEach((v) => {
    vi.mocked(cryptoRoll).mockReturnValueOnce(v);
  });
}

describe('savesTools', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    server = createTestServer();
  });

  describe('roll_dice', () => {
    it('normal d20 roll returns a result', async () => {
      mockRoll(10);
      const result = await server.roll_dice(20);
      expect(result.success).toBe(true);
      expect(result.data.total).toBe(10);
    });

    it('natural 20 is a critical hit', async () => {
      mockRoll(20);
      const result = await server.roll_dice(20, 1, 0, 15);
      expect(result.data.isCritical).toBe(true);
      expect(result.data.success).toBe(true);
    });

    it('natural 1 is a fumble', async () => {
      mockRoll(1);
      const result = await server.roll_dice(20, 1, 0, 15);
      expect(result.data.isFumble).toBe(true);
      expect(result.data.success).toBe(false);
    });

    it('damage roll 2d6 returns summed result', async () => {
      mockRoll(4);
      const result = await server.roll_dice(6, 2, 0, undefined, undefined, undefined, true);
      expect(result.success).toBe(true);
      expect(result.data.total).toBe(8);
    });

    it('attack roll with AC target returns hit when total meets AC', async () => {
      mockRoll(15);
      const result = await server.roll_dice(20, 1, 0, 15);
      expect(result.data.success).toBe(true);
    });
  });

  describe('make_save', () => {
    it('grants Rage advantage on Strength saving throws', async () => {
      server.joinParty(makeCharacter({ class: 'barbarian', raging: true }));
      mockRollSequence(2, 16);
      const result = await server.make_save('Valerius', 'str', 12);
      expect(result.data.roll).toBe(16);
    });

    it('uses class save proficiency and does not double-count Resilient', async () => {
      mockRoll(10);
      server.joinParty(makeCharacter({ class: 'fighter', feats: ['resilient'], featChoices: { resilient: { saveStat: 'str' } }, stats: { str: 16, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } }));
      const result = await server.make_save('Valerius', 'str', 15);
      expect(result.data.modifier).toBe(5);
      expect(result.data.success).toBe(true);
    });

    it('applies Diamond Soul proficiency once', async () => {
      mockRoll(10);
      server.joinParty(makeCharacter({ class: 'monk', level: 14, feats: ['resilient'], featChoices: { resilient: { saveStat: 'wis' } }, stats: { str: 10, dex: 10, con: 10, int: 10, wis: 12, cha: 10 } }));
      const result = await server.make_save('Valerius', 'wis', 16);
      expect(result.data.modifier).toBe(6);
      expect(result.data.success).toBe(true);
    });

    it('succeeds against DC 10', async () => {
      mockRoll(15);
      server.joinParty(makeCharacter());
      const result = await server.make_save('Valerius', 'dex', 10);
      expect(result.data.success).toBe(true);
    });

    it('fails against DC 30', async () => {
      mockRoll(20);
      server.joinParty(makeCharacter());
      const result = await server.make_save('Valerius', 'dex', 30);
      expect(result.data.success).toBe(false);
    });

    it('falls back to dex for an unknown stat', async () => {
      mockRoll(15);
      server.joinParty(makeCharacter());
      const result = await server.make_save('Valerius', 'unknown', 10);
      expect(result.data.stat).toBe('DEX');
      expect(result.data.success).toBe(true);
    });

    it('player target returns full stats in result', async () => {
      mockRoll(12);
      server.joinParty(makeCharacter());
      const result = await server.make_save('Valerius', 'str', 10);
      expect(result.data.character).toBe('Valerius');
      expect(result.data.stat).toBe('STR');
      expect(result.data.roll).toBe(12);
    });

    it('Halfling Lucky rerolls a natural-1 saving throw', async () => {
      // Halfling Lucky: natural 1 on a save is rerolled. make_save rolls before
      // applying onSaveRoll effects so the reroll-ones reducer sees the d20.
      mockRollSequence(1, 20); // initial natural 1, reroll -> 20
      server.joinParty(makeCharacter({ race: 'halfling', racialTraits: ['lucky'] }));
      const result = await server.make_save('Valerius', 'dex', 10);
      expect(result.data.success).toBe(true); // 20 + DEX mod >= 10
      expect(result.data.roll).not.toBe(1);
    });

    it('only grants racial poison and fear advantage for the matching effect', async () => {
      server.joinParty(makeCharacter({ race: 'dwarf', racialTraits: ['dwarven-resilience', 'dwarven-resilience-saves'] }));
      mockRoll(5);
      expect((await server.make_save('Valerius', 'con', 20)).message).not.toContain('advantage');
      mockRollSequence(5, 18);
      expect((await server.make_save('Valerius', 'con', 20, { isPoison: true })).data.roll).toBe(18);
    });

    it('Gnome Cunning grants advantage on spell-originated WIS save vs magic', async () => {
      // Gnome Cunning: INT/WIS/CHA saves vs magic get advantage. The 4th make_save
      // arg now carries { isMagical: true } for ALL spell saves (not just charm).
      mockRollSequence(5, 15); // first roll 5, advantage roll 15 -> keep 15
      server.joinParty(makeCharacter({ race: 'gnome', racialTraits: ['gnome-cunning'] }));
      const result = await server.make_save('Valerius', 'wis', 14, { isMagical: true });
      expect(result.data.success).toBe(true); // 15 + WIS(1) = 16 >= 14
      expect(result.message).toContain('Gnome Cunning advantage');
    });

    it('Gnome Cunning does NOT grant advantage on a non-magical save', async () => {
      mockRoll(5);
      server.joinParty(makeCharacter({ race: 'gnome', racialTraits: ['gnome-cunning'] }));
      const result = await server.make_save('Valerius', 'wis', 14);
      expect(result.data.success).toBe(false); // single roll 5 + WIS(1) = 6 < 14
      expect(result.message).not.toContain('Gnome Cunning');
    });

    it('Gnome Cunning does NOT grant advantage on a non-INT/WIS/CHA save', async () => {
      // Gnome Cunning only covers INT/WIS/CHA saves; a DEX save (even magical) is unaffected.
      mockRoll(5);
      server.joinParty(makeCharacter({ race: 'gnome', racialTraits: ['gnome-cunning'] }));
      const result = await server.make_save('Valerius', 'dex', 14, { isMagical: true });
      expect(result.data.success).toBe(false);
      expect(result.message).not.toContain('Gnome Cunning');
    });

    it('Aura of Protection adds Paladin CHA mod to a party member save', async () => {
      // Aura of Protection: conscious Paladin L6+ adds CHA mod (min +1) to all party saves.
      // We set up a Paladin with CHA 16 (+3 mod) and a second party member making the save.
      mockRoll(10);
      server.joinParty(makeCharacter({
        id: 'paladin-1',
        name: 'Paladin',
        class: 'paladin',
        level: 6,
        stats: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 16 },
        subclassId: 'devotion',
      }));
      server.joinParty(makeCharacter({
        id: 'fighter-1',
        name: 'Fighter',
        class: 'fighter',
        level: 1,
        stats: { str: 16, dex: 10, con: 14, int: 8, wis: 10, cha: 8 },
      }));
      const result = await server.make_save('Fighter', 'dex', 12);
      // Roll 10 + DEX mod 0 + Aura bonus 3 (CHA +3) = 13 >= 12 -> success
      expect(result.data.success).toBe(true);
      expect(result.message).toContain('Aura of Protection');
    });

    it('limits Aura of Protection to nearby allies when a battle map exists', async () => {
      mockRoll(10);
      server.joinParty(makeCharacter({ id: 'pal', name: 'Paladin', class: 'paladin', level: 6, stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 16 } }));
      server.joinParty(makeCharacter({ id: 'ally', name: 'Ally', stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } }));
      const state = server.getFullState();
      state.battleMap = { width: 20, height: 20, cellSize: 40, tokens: [{ id: 'pal', name: 'Paladin', type: 'player', pos: { x: 0, y: 0 } }, { id: 'ally', name: 'Ally', type: 'player', pos: { x: 5, y: 0 } }] };
      server.loadState(state);
      expect((await server.make_save('ally', 'dex', 12)).data.success).toBe(false);
      const map = server.getFullState().battleMap;
      if (!map) throw new Error('Battle map missing');
      map.tokens[1].pos.x = 2;
      expect((await server.make_save('ally', 'dex', 12)).data.success).toBe(true);
    });

    it('Aura of Protection uses the highest CHA mod among multiple Paladins', async () => {
      // When multiple Paladins have the aura, only the highest CHA mod applies.
      mockRoll(10);
      server.joinParty(makeCharacter({
        id: 'paladin-low',
        name: 'PaladinLow',
        class: 'paladin',
        level: 6,
        stats: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 14 }, // +2 mod
        subclassId: 'devotion',
      }));
      server.joinParty(makeCharacter({
        id: 'paladin-high',
        name: 'PaladinHigh',
        class: 'paladin',
        level: 6,
        stats: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 18 }, // +4 mod
        subclassId: 'devotion',
      }));
      server.joinParty(makeCharacter({
        id: 'fighter-1',
        name: 'Fighter',
        class: 'fighter',
        level: 1,
        stats: { str: 16, dex: 10, con: 14, int: 8, wis: 10, cha: 8 },
      }));
      const result = await server.make_save('Fighter', 'dex', 14);
      // Roll 10 + DEX mod 0 + Aura bonus 4 (highest CHA +4) = 14 >= 14 -> success
      expect(result.data.success).toBe(true);
      expect(result.message).toContain('+4');
    });

    it('Aura of Protection does NOT apply when the Paladin is unconscious', async () => {
      // An unconscious (0 HP) Paladin cannot project their aura.
      mockRoll(10);
      server.joinParty(makeCharacter({
        id: 'paladin-1',
        name: 'Paladin',
        class: 'paladin',
        level: 6,
        hp: { current: 0, max: 40 },
        stats: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 16 },
        subclassId: 'devotion',
      }));
      server.joinParty(makeCharacter({
        id: 'fighter-1',
        name: 'Fighter',
        class: 'fighter',
        level: 1,
        stats: { str: 16, dex: 10, con: 14, int: 8, wis: 10, cha: 8 },
      }));
      const result = await server.make_save('Fighter', 'dex', 12);
      // Roll 10 + DEX mod 0 + no aura = 10 < 12 -> fail
      expect(result.data.success).toBe(false);
      expect(result.message).not.toContain('Aura of Protection');
    });

    it('enemy target uses fallback stats', async () => {
      mockRoll(15);
      await server.add_enemy('Goblin');
      const result = await server.make_save('Goblin', 'wis', 10);
      expect(result.success).toBe(true);
      expect(result.data.character).toBe('Goblin');
    });
  });

  describe('roll_death_save', () => {
    it('initializes death saves when at 0 HP', async () => {
      mockRoll(10);
      server.joinParty(makeCharacter({ hp: { current: 0, max: 12 } }));
      const result = await server.roll_death_save('Valerius');
      expect(result.success).toBe(true);
      expect(server.getFullState().party[0].deathSaves).toBeDefined();
    });

    it('returns fail when character is at full HP', async () => {
      server.joinParty(makeCharacter());
      const result = await server.roll_death_save('Valerius');
      expect(result.success).toBe(false);
      expect(result.message).toContain('not dying');
    });

    it('returns stable when already stable', async () => {
      server.joinParty(makeCharacter({
        hp: { current: 0, max: 12 },
        deathSaves: { successes: 3, failures: 0, isStable: true },
      }));
      const result = await server.roll_death_save('Valerius');
      expect(result.data.deathSaves.isStable).toBe(true);
    });

    it('natural 20 revives the character with 1 HP', async () => {
      mockRoll(20);
      server.joinParty(makeCharacter({ hp: { current: 0, max: 12 } }));
      await server.roll_death_save('Valerius');
      expect(server.getFullState().party[0].hp.current).toBe(1);
    });

    it('3 successes makes the character stable', async () => {
      mockRollSequence(12, 14, 18);
      server.joinParty(makeCharacter({ hp: { current: 0, max: 12 } }));
      await server.roll_death_save('Valerius');
      await server.roll_death_save('Valerius');
      await server.roll_death_save('Valerius');
      expect(server.getFullState().party[0].deathSaves?.isStable).toBe(true);
    });

    it('3 failures causes death', async () => {
      mockRollSequence(3, 5, 2);
      server.joinParty(makeCharacter({ hp: { current: 0, max: 12 } }));
      await server.roll_death_save('Valerius');
      await server.roll_death_save('Valerius');
      await server.roll_death_save('Valerius');
      expect(server.getFullState().party[0].deathSaves?.failures).toBe(3);
    });
  });
});
