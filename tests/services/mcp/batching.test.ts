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

describe('batching (S7/S8)', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    server = createTestServer();
  });

  describe('update_inventory batch (items array)', () => {
    it('adds multiple items in a single call', async () => {
      server.joinParty(makeCharacter());
      const res = await server.executeToolCall('update_inventory', {
        items: [
          { item_name: 'silver chalice', quantity: 1 },
          { item_name: 'gemstone', quantity: 3 },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.data.batch).toBe(2);
      const inv = server.getFullState().party[0].inventory;
      expect(inv.some(i => i.name === 'silver chalice')).toBe(true);
      expect(inv.find(i => i.name === 'gemstone')?.quantity).toBe(3);
    });

    it('still supports the single-item path', async () => {
      server.joinParty(makeCharacter());
      const res = await server.executeToolCall('update_inventory', {
        item_name: 'iron key',
        action: 'add',
      });
      expect(res.success).toBe(true);
      const inv = server.getFullState().party[0].inventory;
      expect(inv.some(i => i.name === 'iron key')).toBe(true);
    });
  });

  describe('level_up spell chaining (S8)', () => {
    it('chains learnSpells into manage_spellbook after stat allocation', async () => {
      // A wizard with pending stat points to allocate.
      server.joinParty(makeWizard({
        unusedStatPoints: 2,
        experienceToNextLevel: 6500,
      }));
      const before = server.getFullState().party[0].knownSpells.slice();

      const res = await server.executeToolCall('level_up', {
        targetId: 'wizard-1',
        stats: { int: 2 },
        learnSpells: ['misty-step'],
      });

      expect(res.success).toBe(true);
      expect(res.data.spellsChained).toBe(1);
      const after = server.getFullState().party[0].knownSpells;
      expect(after).toEqual(expect.arrayContaining([...before, 'misty-step']));
    });
  });
});
