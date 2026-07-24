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

});
