import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockMCPServer } from '../../../services/mcpService';
import { makeCharacter } from '../../helpers/characters';
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

describe('auto XP award on enemy defeat', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    server = createTestServer();
  });

  it('awards enemy.xp to a solo party with +25% buff on defeat via inflict_damage', async () => {
    server.joinParty(makeCharacter({ experience: 0 }));
    // add_enemy(name, ac, hp, attacks, cr, xp)
    await server.add_enemy('Goblin', 12, 5, undefined, 1, 200);
    const xpBefore = server.getFullState().party[0].experience;

    const result = await server.inflict_damage(5, 'Goblin');

    expect(result.data.enemyDefeated).toBe(true);
    expect(result.data.xpAwarded).toBe(true);
    // 200 * 1.25 = 250
    const xpAfter = server.getFullState().party[0].experience;
    expect(xpAfter - xpBefore).toBe(250);
    expect(result.message).toContain('Combat XP (auto)');
  });

  it('splits XP evenly across a multi-member party', async () => {
    server.joinParty(makeCharacter({ id: 'p1', name: 'Aria', experience: 0 }));
    server.joinParty(makeCharacter({ id: 'p2', name: 'Bram', experience: 0 }));
    await server.add_enemy('Orc', 13, 6, undefined, 1, 100);

    await server.inflict_damage(6, 'Orc');

    const state = server.getFullState();
    // 100 / 2 = 50 each
    expect(state.party[0].experience).toBe(50);
    expect(state.party[1].experience).toBe(50);
  });

  it('is idempotent: xpAwarded flag prevents double-award', async () => {
    server.joinParty(makeCharacter());
    await server.add_enemy('Goblin', 12, 5, undefined, 1, 200);
    await server.inflict_damage(5, 'Goblin');
    const xpAfterFirst = server.getFullState().party[0].experience;

    // Second hit on the already-defeated enemy must not re-award.
    const second = await server.inflict_damage(5, 'Goblin');
    expect(second.success).toBe(false);
    expect(server.getFullState().party[0].experience).toBe(xpAfterFirst);
  });

  it('surfaces xpAwarded + xpLine on player_attack kill', async () => {
    server.joinParty(makeCharacter());
    await server.add_enemy('Goblin', 12, 5, undefined, 1, 200);
    await server.start_combat();
    // to-hit roll (nat 20 crit), then a d8 damage die
    mockRoll(20);
    vi.mocked(cryptoRoll).mockReturnValueOnce(20);
    vi.mocked(cryptoRoll).mockReturnValueOnce(5);

    const result = await server.player_attack('Valerius', 'Longsword', 'Goblin');

    expect(result.data.targetDefeated).toBe(true);
    expect(result.data.xpAwarded).toBe(true);
    expect(typeof result.data.xpLine).toBe('string');
    expect(result.data.xpLine.length).toBeGreaterThan(0);
    expect(result.message).toContain('Combat XP (auto)');
  });

  it('awards nothing when enemy.xp is 0', async () => {
    server.joinParty(makeCharacter({ experience: 10 }));
    await server.add_enemy('Rat', 10, 1, undefined, 0, 0);
    const result = await server.inflict_damage(1, 'Rat');
    expect(result.data.enemyDefeated).toBe(true);
    expect(result.data.xpAwarded).toBe(false);
    expect(server.getFullState().party[0].experience).toBe(10);
  });
});
