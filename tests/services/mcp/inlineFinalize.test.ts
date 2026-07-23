import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockMCPServer } from '../../../services/mcpService';
import { makeCharacter, makeWizard } from '../../helpers/characters';
import { createTestServer } from '../../helpers/testServer';

vi.mock('../../../utils/random', () => ({
  cryptoRoll: vi.fn(),
}));

vi.mock('../../../utils/debug', () => ({
  isDebugMode: false,
}));

vi.mock('../../../services/supabaseClient', () => ({
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

const { cryptoRoll } = await import('../../../utils/random');

function mockRoll(value: number) {
  vi.mocked(cryptoRoll).mockReturnValue(value);
}

describe('inline turn finalization (collapse action + narrate_turn)', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    server = createTestServer();
  });

  describe('check_skill branch narration', () => {
    it('selects narrationOnSuccess when the roll succeeds and advances time', async () => {
      server.joinParty(makeCharacter());
      // persuasion (cha 14 => +2), DC 15. Roll 20 => total 22 => success.
      mockRoll(20);
      const gameTimeBefore = server.getFullState().gameTime ?? 0;

      const res = await server.executeToolCall('check_skill', {
        skill_name: 'persuasion',
        difficulty: 15,
        targetId: 'hero-1',
        narrationOnSuccess: 'The guard waves you through.',
        narrationOnFailure: 'The guard scowls and draws steel.',
        timePassed: 5,
      });

      expect(res.data.success).toBe(true);
      expect(res.data.narration).toBe('The guard waves you through.');
      expect(server.getFullState().gameTime).toBe(gameTimeBefore + 5);
    });

    it('selects narrationOnFailure when the roll fails', async () => {
      server.joinParty(makeCharacter());
      // persuasion (cha 14 => +2), DC 15. Roll 1 => total 3 => failure.
      mockRoll(1);
      const gameTimeBefore = server.getFullState().gameTime ?? 0;

      const res = await server.executeToolCall('check_skill', {
        skill_name: 'persuasion',
        difficulty: 15,
        targetId: 'hero-1',
        narrationOnSuccess: 'The guard waves you through.',
        narrationOnFailure: 'The guard scowls and draws steel.',
        timePassed: 5,
      });

      expect(res.data.success).toBe(false);
      expect(res.data.narration).toBe('The guard scowls and draws steel.');
      expect(server.getFullState().gameTime).toBe(gameTimeBefore + 5);
    });

    it('without branches does NOT finalize the turn (backward compatible)', async () => {
      server.joinParty(makeCharacter());
      mockRoll(20);
      const gameTimeBefore = server.getFullState().gameTime ?? 0;

      const res = await server.executeToolCall('check_skill', {
        skill_name: 'persuasion',
        difficulty: 15,
        targetId: 'hero-1',
      });

      // No narration field merged, time untouched.
      expect(res.data.narration).toBeUndefined();
      expect(server.getFullState().gameTime).toBe(gameTimeBefore);
    });
  });

  describe('OOC guard', () => {
    it('does not finalize time when a branched make_save happens in combat', async () => {
      server.joinParty(makeCharacter());
      mockRoll(20); // start_combat initiative roll
      await server.add_enemy('Goblin', 12, 10);
      await server.start_combat();
      const gameTimeBefore = server.getFullState().gameTime ?? 0;

      mockRoll(20); // the save roll
      const res = await server.executeToolCall('make_save', {
        targetId: 'hero-1',
        stat: 'dex',
        dc: 10,
        narrationOnSuccess: 'You dive clear.',
        narrationOnFailure: 'You are caught.',
        timePassed: 1,
      });

      expect(res.data.success).toBe(true);
      // In combat the engine must NOT advance time / merge narration.
      expect(res.data.narration).toBeUndefined();
      expect(server.getFullState().gameTime).toBe(gameTimeBefore);
    });
  });

  describe('cast_ritual auto-advances 10 minutes (S3)', () => {
    it('advances gameTime by 10 with no separate narrate_turn', async () => {
      server.joinParty(makeWizard({ preparedSpells: ['magic-missile', 'shield', 'fireball', 'burning-hands', 'fire-bolt', 'alarm'] }));
      const gameTimeBefore = server.getFullState().gameTime ?? 0;

      const res = await server.executeToolCall('cast_ritual', {
        characterId: 'wizard-1',
        spellId: 'alarm',
      });

      expect(res.success).toBe(true);
      expect(server.getFullState().gameTime).toBe(gameTimeBefore + 10);
      expect(res.data.timePassed).toBe(10);
    });
  });

  describe('deterministic tool inline narration', () => {
    it('update_inventory with narration + timePassed advances time', async () => {
      server.joinParty(makeCharacter());
      const gameTimeBefore = server.getFullState().gameTime ?? 0;

      const res = await server.executeToolCall('update_inventory', {
        item_name: 'iron key',
        action: 'add',
        narration: 'You pocket the heavy iron key.',
        timePassed: 2,
      });

      expect(res.success).toBe(true);
      expect(res.data.narration).toBe('You pocket the heavy iron key.');
      expect(server.getFullState().gameTime).toBe(gameTimeBefore + 2);
    });
  });
});
