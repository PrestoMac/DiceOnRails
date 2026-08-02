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
