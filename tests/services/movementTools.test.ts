import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockMCPServer } from '../../services/mcpService';
import { makeCharacter } from '../helpers/characters';

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
    vi.clearAllMocks();
    vi.mocked(cryptoRoll).mockReset();
    server = new MockMCPServer();
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
    vi.clearAllMocks();
    vi.mocked(cryptoRoll).mockReset();
    server = new MockMCPServer();
  });

  it('simple move changes party location', async () => {
    const char = makeCharacter();
    server.joinParty(char);

    const result = await server.move_to('Dragon Lair', 'A dark cave filled with treasure');

    expect(result.success).toBe(true);
    expect(char.location).toBe('Dragon Lair');
    expect(server.getFullState().worldDescription).toBe('A dark cave filled with treasure');
  });

  it('route travel calculates distance and time', async () => {
    const char = makeCharacter();
    server.joinParty(char);
    await server.long_rest();

    const result = await server.move_to('Neverwinter', '', 'hero-1', undefined, 'neverwinter-woods-trail', 'normal');

    expect(result.success).toBe(true);
    expect(result.data?.travelMinutes).toBeGreaterThan(0);
    expect(result.data?.newLocation).toBe('Neverwinter');
  });

  it('different paces affect travel time', async () => {
    const char = makeCharacter();
    server.joinParty(char);
    await server.long_rest();

    
    const slowResult = await server.move_to('Neverwinter', '', undefined, undefined, 'neverwinter-woods-trail', 'slow');
    expect(slowResult.success).toBe(false);
    expect(slowResult.message).toContain('exhaustion');

    
    const fastResult = await server.move_to('Neverwinter', '', undefined, undefined, 'neverwinter-woods-trail', 'fast');
    expect(fastResult.success).toBe(true);
    expect(fastResult.data?.travelMinutes).toBeGreaterThan(0);
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

  it('skillCheck is ignored during route travel', async () => {
    const char = makeCharacter();
    server.joinParty(char);
    await server.long_rest();
    vi.mocked(cryptoRoll).mockReturnValue(1);

    const skillCheck = { skill_name: 'perception', difficulty: 5, onSuccess: { awardCurrency: { gp: 100 } } };
    const result = await server.move_to('Neverwinter', '', 'hero-1', skillCheck, 'neverwinter-woods-trail', 'normal');

    expect(result.success).toBe(true);
  });

  it('invalid route returns fail', async () => {
    const char = makeCharacter();
    server.joinParty(char);

    const result = await server.move_to('Nowhere', '', 'hero-1', undefined, 'nonexistent-route', 'normal');

    expect(result.success).toBe(false);
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
});
