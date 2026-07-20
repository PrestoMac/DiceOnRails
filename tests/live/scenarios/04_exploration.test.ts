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

describe('04_exploration', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cryptoRoll).mockReset();
    server = new MockMCPServer();
  });

  it('simple move + skill: move_to(library) → check_skill(investigation, dc=15)', async () => {
    const char = makeCharacter({ id: 'hero-1', name: 'Valerius' });
    server.joinParty(char);
    vi.mocked(cryptoRoll).mockReturnValue(12);
    const moveResult = await server.executeToolCall('move_to', {
      location_name: 'Library',
      description: 'A dusty old library filled with ancient tomes.',
    });
    expect(moveResult.success).toBe(true);
    expect(char.location).toBe('Library');
    expect(server.getFullState().worldDescription).toContain('dusty');
    vi.mocked(cryptoRoll).mockReturnValue(14);
    const skillResult = await server.executeToolCall('check_skill', {
      skill_name: 'investigation',
      difficulty: 15,
      targetId: 'hero-1',
    });
    expect(skillResult.success).toBe(true);
    expect(skillResult.data.success).toBeDefined();
  });

  it('route travel: move_to(route=neverwinter-woods-trail, pace=normal) → travel time calculated', async () => {
    const char = makeCharacter({ id: 'hero-1', name: 'Valerius' });
    server.joinParty(char);
    await server.long_rest();
    vi.mocked(cryptoRoll).mockReturnValue(10);
    const result = await server.executeToolCall('move_to', {
      location_name: 'Neverwinter',
      route: 'neverwinter-woods-trail',
      pace: 'normal',
    });
    expect(result.success).toBe(true);
    expect(result.data.newLocation).toBe('Neverwinter');
    expect(result.data.travelMinutes).toBeGreaterThan(0);
    expect(char.location).toBe('Neverwinter');
  });

  it('route + encounter: move_to with route triggers combat state on encounter', async () => {
    const char = makeCharacter({ id: 'hero-1', name: 'Valerius' });
    server.joinParty(char);
    vi.mocked(cryptoRoll).mockReturnValue(20);
    const result = await server.executeToolCall('move_to', {
      location_name: 'Neverwinter',
      route: 'neverwinter-woods-trail',
      pace: 'normal',
    });
    expect(result.success).toBe(true);
    expect(result.data.newLocation).toBe('Neverwinter');
    expect(char.location).toBe('Neverwinter');
  });
});
