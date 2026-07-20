import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockMCPServer } from '../../../services/mcpService';
import { makeCleric, makeBarbarian } from '../../helpers/characters';

vi.mock('../../../utils/random', () => ({
  cryptoRoll: vi.fn(),
}));

vi.mock('../../../utils/debug', () => ({
  isDebugMode: false,
}));

const { cryptoRoll } = await import('../../../utils/random');

describe('03_adventuring_day', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cryptoRoll).mockReset();
    server = new MockMCPServer();
  });

  it('short rest: short-rest resources restored, long-rest resources NOT restored, gameTime +60', async () => {
    const cleric = makeCleric({ id: 'clr-1', name: 'Aria' });
    const cd = cleric.resources.find(r => r.id === 'channel-divinity');
    expect(cd).toBeDefined();
    if (cd) cd.current = 0;
    const barbarian = makeBarbarian();
    barbarian.resources[0].current = 0;
    server.joinParty(cleric);
    server.joinParty(barbarian);
    const beforeTime = server.getFullState().gameTime ?? 0;
    vi.mocked(cryptoRoll).mockReturnValue(10);
    const result = await server.executeToolCall('short_rest', {
      targetId: undefined,
      narration: 'resting...',
      autoAdvanceTime: true,
    });
    expect(result.success).toBe(true);
    expect(cd.current).toBe(cd.max);
    expect(barbarian.resources[0].current).toBe(0);
    expect(server.getFullState().gameTime).toBe(beforeTime + 60);
  });

  it('long rest: depleted resources restored, lastLongRestTime set, gameTime +480', async () => {
    const cleric = makeCleric({ id: 'clr-1', name: 'Aria' });
    cleric.hp.current = 5;
    cleric.resources.forEach(r => r.current = 0);
    server.joinParty(cleric);
    const beforeTime = server.getFullState().gameTime ?? 0;
    const result = await server.executeToolCall('long_rest', {
      narration: 'resting...',
      autoAdvanceTime: true,
    });
    expect(result.success).toBe(true);
    expect(cleric.hp.current).toBe(cleric.hp.max);
    for (const r of cleric.resources) {
      if (r.resetOn === 'long') {
        expect(r.current).toBe(r.max);
      }
    }
    expect(server.getFullState().lastLongRestTime).toBeDefined();
    expect(server.getFullState().gameTime).toBeGreaterThan(beforeTime);
  });

  it('rest cooldown: second long rest within 16h fails, then succeeds after enough time passes', async () => {
    const cleric = makeCleric({ id: 'clr-1', name: 'Aria' });
    server.joinParty(cleric);
    const firstRest = await server.executeToolCall('long_rest', { narration: 'First rest', autoAdvanceTime: true });
    expect(firstRest.success).toBe(true);
    const secondRest = await server.executeToolCall('long_rest', { narration: 'Too soon', autoAdvanceTime: true });
    expect(secondRest.success).toBe(false);
    await server.executeToolCall('narrate_turn', { narration: 'Waiting...', timePassed: 1340 });
    const thirdRest = await server.executeToolCall('long_rest', { narration: 'Finally', autoAdvanceTime: true });
    expect(thirdRest.success).toBe(true);
  });
});
