import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockMCPServer } from '../../services/mcpService';
import { makeWizard } from '../helpers/characters';
import { Message, MessageRole } from '../../types';

vi.mock('../../utils/random', () => ({
  cryptoRoll: vi.fn(() => 10),
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

function userMsg(text: string): Message {
  return { id: `user-${Math.random()}`, role: MessageRole.USER, text, timestamp: Date.now() };
}

describe('MockMCPServer rewind cycle (cast_spell + restoreSnapshot)', () => {
  let server: MockMCPServer;
  let enemyId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = new MockMCPServer();

    const wizard = makeWizard();
    server.joinParty(wizard);

    await server.add_enemy('Goblin', 15, 7);
    await server.start_combat();
    const combat = server.getFullState().combat;
    if (!combat) throw new Error('expected combat state');
    enemyId = combat.enemies[0].id;
  });

  function slot3Current(): number {
    const char = server.getFullState().party[0];
    const r = (char.resources ?? []).find(x => x.id === 'spell-slot-3');
    if (!r) throw new Error('spell-slot-3 missing');
    return r.current;
  }

  async function castFireball(): Promise<void> {
    const result = await server.executeToolCall('cast_spell', {
      characterId: 'wizard-1',
      spellId: 'fireball',
      slotLevel: 3,
      targets: [enemyId],
    });
    if (!result.success) throw new Error(`cast_spell failed: ${result.message}`);
  }

  it('multiple rewind cycles never deplete the slot below max-1', async () => {
    const SLOT_3_MAX = 2;

    for (let cycle = 1; cycle <= 3; cycle++) {
      // Pre-turn: slots at max
      expect(slot3Current()).toBe(SLOT_3_MAX);

      // Save rewind point (mirrors handleSendMessage line 150)
      server.saveRewindPoint(server.getFullState(), [userMsg('I cast fireball')]);

      // Cast (consumes slot) — mirrors the agent loop calling cast_spell
      await castFireball();
      expect(slot3Current()).toBe(SLOT_3_MAX - 1);

      // Rewind: load + restore — mirrors handleRewind lines 312, 357
      const snapshot = server.loadRewindPoint();
      if (!snapshot) throw new Error(`cycle ${cycle}: expected rewind point`);
      server.restoreSnapshot(snapshot.gameState);

      // Critical assertion: slot fully restored
      expect(slot3Current()).toBe(SLOT_3_MAX);

      server.clearRewindPoint();
    }
  });

  it('retry path (saveRewindPoint with pristine, cast, repeat) keeps slot stable at max-1', async () => {
    // This mirrors the actual handleRewind flow: restore, then retry handleSendMessage
    // which saves a NEW rewind point with the restored (pristine) state, then casts.
    const SLOT_3_MAX = 2;

    // Initial turn
    expect(slot3Current()).toBe(SLOT_3_MAX);
    server.saveRewindPoint(server.getFullState(), [userMsg('I cast fireball')]);
    await castFireball();
    expect(slot3Current()).toBe(SLOT_3_MAX - 1);

    // Three rewind+retry cycles
    for (let cycle = 1; cycle <= 3; cycle++) {
      const snapshot = server.loadRewindPoint();
      if (!snapshot) throw new Error(`cycle ${cycle}: expected rewind point`);
      server.restoreSnapshot(snapshot.gameState);
      expect(slot3Current()).toBe(SLOT_3_MAX); // restored

      server.clearRewindPoint();

      // Retry: save NEW rewind point with restored state, then cast
      server.saveRewindPoint(server.getFullState(), [userMsg('I cast fireball')]);
      await castFireball();
      expect(slot3Current()).toBe(SLOT_3_MAX - 1); // consumed again

      // CRITICAL: slot must not degrade cycle over cycle. After this cycle ends,
      // the live slot is max-1 (not max-2, max-3, max-4).
    }

    // Final assertion: across 3 rewind+retry cycles, slot stayed at max-1.
    expect(slot3Current()).toBe(SLOT_3_MAX - 1);
  });
});
