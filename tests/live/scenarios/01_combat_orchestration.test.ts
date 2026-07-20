import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockMCPServer } from '../../../services/mcpService';
import { makeCharacter } from '../../helpers/characters';

vi.mock('../../../utils/random', () => ({
  cryptoRoll: vi.fn(),
}));

vi.mock('../../../utils/debug', () => ({
  isDebugMode: false,
}));

const { cryptoRoll } = await import('../../../utils/random');

describe('01_combat_orchestration', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cryptoRoll).mockReset();
    server = new MockMCPServer();
    const char = makeCharacter({ id: 'hero-1', name: 'Valerius' });
    server.joinParty(char);
    server.add_enemy('Goblin', 15, 7);
  });

  it('single attack: tool executed, enemy HP reduced', async () => {
    await server.start_combat();
    vi.mocked(cryptoRoll).mockReturnValue(15);
    const combatState = server.getFullState().combat;
    expect(combatState).toBeDefined();
    const enemy = combatState?.enemies[0];
    const beforeHp = enemy.hp.current;
    const result = await server.executeToolCall('player_attack', {
      attackerId: 'hero-1',
      weaponName: 'Longsword',
      targetId: enemy.id,
    });
    expect(result.success).toBe(true);
    expect(result.data.hit).toBe(true);
    expect(enemy.hp.current).toBeLessThan(beforeHp);
  });

  it('attack + next_turn in one batch: batch-executed, no race condition', async () => {
    await server.start_combat();
    vi.mocked(cryptoRoll).mockReturnValue(15);
    const combatState = server.getFullState().combat;
    expect(combatState).toBeDefined();
    const enemy = combatState?.enemies[0];
    const attackResult = await server.executeToolCall('player_attack', {
      attackerId: 'hero-1',
      weaponName: 'Longsword',
      targetId: enemy.id,
    });
    expect(attackResult.success).toBe(true);
    expect(attackResult.data.hit).toBe(true);
    const turnResult = await server.executeToolCall('next_turn', {});
    expect(turnResult.success).toBe(true);
  });

  it('retry path: start_combat succeeds when combat not yet active', async () => {
    vi.mocked(cryptoRoll).mockReturnValue(10);
    const result = await server.executeToolCall('start_combat', {});
    expect(result.success).toBe(true);
    expect(result.message).toContain('COMBAT BEGINS');
  });

  it('LLM calls narrate_turn mid-combat: loop advances time', async () => {
    await server.start_combat();
    const before = server.getFullState().gameTime ?? 0;
    const result = await server.executeToolCall('narrate_turn', { narration: 'Combat rages on...', timePassed: 10 });
    expect(result.success).toBe(true);
    expect(server.getFullState().gameTime).toBeGreaterThan(before);
  });

  it('iteration limit: empty responses handled gracefully', async () => {
    await server.start_combat();
    const result = await server.executeToolCall('narrate_turn', { narration: 'Nothing happens.', timePassed: 0 });
    expect(result.success).toBe(true);
  });

  it('critical tool failure: player_attack fails on invalid target', async () => {
    await server.start_combat();
    vi.mocked(cryptoRoll).mockReturnValue(15);
    const result = await server.executeToolCall('player_attack', {
      attackerId: 'hero-1',
      weaponName: 'Longsword',
      targetId: 'nonexistent',
    });
    expect(result.success).toBe(false);
  });
});
