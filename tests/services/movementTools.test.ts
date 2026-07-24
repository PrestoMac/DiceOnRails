import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockMCPServer } from '../../services/mcpService';
import { makeCharacter } from '../helpers/characters';
import { createTestServer } from '../helpers/testServer';

vi.mock('../../utils/random', () => ({
  cryptoRoll: vi.fn(),
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

vi.mock('../../utils/debug', () => ({
  isDebugMode: false,
}));

const { cryptoRoll } = await import('../../utils/random');

describe('check_skill', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    server = createTestServer();
  });

  it('succeeds against DC 10 with sufficient bonus', async () => {
    const char = makeCharacter({ stats: { str: 15, dex: 10, con: 14, int: 8, wis: 12, cha: 14 } });
    server.joinParty(char);
    vi.mocked(cryptoRoll).mockReturnValue(10);

    const result = await server.check_skill('athletics', 10);

    expect(result.success).toBe(true);
    expect(result.data?.success).toBe(true);
  });

  it('fails against DC 30', async () => {
    const char = makeCharacter({ stats: { str: 15, dex: 10, con: 14, int: 8, wis: 12, cha: 14 } });
    server.joinParty(char);
    vi.mocked(cryptoRoll).mockReturnValue(1);

    const result = await server.check_skill('athletics', 30);

    expect(result.success).toBe(true);
    expect(result.data?.success).toBe(false);
  });

  it('fires onSuccess actions (currency, lore, quest, inventory) simultaneously', async () => {
    const char = makeCharacter();
    server.joinParty(char);
    vi.mocked(cryptoRoll).mockReturnValue(20);

    const onSuccess = {
      awardCurrency: { gp: 10, sp: 0, cp: 0 },
      logLore: { title: 'Found Ruins', content: 'Ancient ruins discovered.', category: 'History' as const },
      upsertQuest: { title: 'Explore Ruins', description: 'Explore the ancient ruins', status: 'active' as const },
      updateInventory: { item_name: 'Ancient Relic', quantity: 1 },
    };

    const result = await server.check_skill('perception', 5, 'hero-1', onSuccess);

    expect(result.success).toBe(true);
    expect(result.message).toContain('SUCCESS');
    const updated = server.getTarget('hero-1');
    expect(updated).toBeDefined();
    expect(updated.currency.gp).toBeGreaterThan(15);
    expect(server.getFullState().lore.length).toBeGreaterThan(0);
    expect(server.getFullState().quests.length).toBeGreaterThan(0);
    expect(updated.inventory.some(i => i.name === 'Ancient Relic')).toBe(true);
  });

  it('falls back to STR for unknown skill name', async () => {
    const char = makeCharacter({ stats: { str: 15, dex: 10, con: 14, int: 8, wis: 12, cha: 14 } });
    server.joinParty(char);
    vi.mocked(cryptoRoll).mockReturnValue(10);

    const result = await server.check_skill('nonexistent_skill', 10);

    expect(result.success).toBe(true);
    expect(result.data?.success).toBeDefined();
    expect(result.data?.modifier).toBe(2);
  });

  it('awards XP on successful skill check', async () => {
    const char = makeCharacter({ experience: 0 });
    server.joinParty(char);
    vi.mocked(cryptoRoll).mockReturnValue(15);

    const result = await server.check_skill('athletics', 10);

    expect(result.success).toBe(true);
    expect(result.data?.xpGained).toBeGreaterThan(0);
    const updated = server.getTarget('hero-1');
    expect(updated).toBeDefined();
    expect(updated.experience).toBeGreaterThan(0);
  });

  it('nat20 grants bonus XP', async () => {
    const char = makeCharacter({ experience: 0 });
    server.joinParty(char);
    vi.mocked(cryptoRoll).mockReturnValue(20);

    const result = await server.check_skill('athletics', 10);

    expect(result.success).toBe(true);
    expect(result.data?.xpGained).toBeGreaterThanOrEqual(40);
    expect(result.message).toContain('Nat 20');
  });
});

describe('move_to', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    server = createTestServer();
  });

  it('simple move changes party location', async () => {
    const char = makeCharacter();
    server.joinParty(char);

    const result = await server.move_to('Dragon Lair', 'A dark cave filled with treasure');

    expect(result.success).toBe(true);
    expect(char.location).toBe('Dragon Lair');
    expect(server.getFullState().worldDescription).toBe('A dark cave filled with treasure');
  });

  it('embedded skillCheck fires on non-route move', async () => {
    const char = makeCharacter();
    server.joinParty(char);
    vi.mocked(cryptoRoll).mockReturnValue(15);

    const skillCheck = { skill_name: 'perception', difficulty: 5 };
    const result = await server.move_to('Ancient Library', 'A dark library', 'hero-1', skillCheck);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Skill');
    expect(char.location).toBe('Ancient Library');
  });

  it('moves single party member vs whole party', async () => {
    const char1 = makeCharacter({ id: 'hero-1', name: 'Hero' });
    const char2 = makeCharacter({ id: 'hero-2', name: 'Sidekick' });
    server.joinParty(char1);
    server.joinParty(char2);

    await server.move_to('Kitchen', 'A cozy kitchen', 'hero-1');

    expect(char1.location).toBe('Kitchen');
    expect(char2.location).toBe('The Rusty Tankard');

    await server.move_to('Armory', 'Weapons room');

    expect(char1.location).toBe('Armory');
    expect(char2.location).toBe('Armory');
  });

  it('rejects move_to legs longer than 4 hours without moving the party', async () => {
    const char = makeCharacter();
    server.joinParty(char);
    const before = char.location;

    const result = await server.executeToolCall('move_to', {
      location_name: 'Distant Castle',
      timePassed: 600,
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('4h');
    expect(char.location).toBe(before);
  });

  it('allows move_to legs up to 4 hours', async () => {
    const char = makeCharacter();
    server.joinParty(char);

    const result = await server.executeToolCall('move_to', {
      location_name: 'Nearby Village',
      timePassed: 240,
    });

    expect(result.success).toBe(true);
    expect(char.location).toBe('Nearby Village');
  });
});
