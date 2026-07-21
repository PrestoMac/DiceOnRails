import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mcpServer } from '../../../services/mcpService';
import { makeCharacter } from '../../helpers/characters';

vi.mock('../../../utils/random', () => ({
  cryptoRoll: vi.fn(),
}));

vi.mock('../../../utils/debug', () => ({
  isDebugMode: false,
}));

vi.mock('../../../utils/envHelper', () => ({
  getEnv: vi.fn<[string], string | undefined>((key: string) => {
    if (key === 'VITE_LLM_API_KEY') return 'test-key';
    if (key === 'VITE_LLM_MODEL') return 'deepseek/deepseek-v4-flash';
    return undefined;
  }),
  getThinkingDisabledBody: vi.fn(() => undefined),
}));

const { cryptoRoll } = await import('../../../utils/random');

describe('08_suggested_actions_scenario', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cryptoRoll).mockReset();
    vi.mocked(cryptoRoll).mockReturnValue(10);
    mcpServer.reset();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('returns suggestions when combat is active and LLM returns valid JSON', async () => {
    const char = makeCharacter();
    mcpServer.joinParty(char);
    mcpServer.loadState({
      party: [char],
      worldDescription: '',
      sessionLogs: [],
      quests: [],
      lore: [],
      actionQueue: [],
      combat: {
        isActive: true,
        round: 2,
        turnIndex: 0,
        initiative: [{
          id: char.id, name: char.name, initiative: 15,
          type: 'player', isDead: false, hasActedThisTurn: false,
        }],
        enemies: [{
          id: 'goblin-1', name: 'Goblin', ac: 13,
          hp: { current: 5, max: 7 }, isDead: false,
          attacks: [{ name: 'Strike', toHit: 4, damageDice: '1d6+2', damageType: 'slashing' }],
        }],
      },
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        choices: [{
          message: {
            content: '{"suggestions":["Attack the goblin","Cast Magic Missile","Drink a potion"]}',
            role: 'assistant',
          },
        }],
        usage: { prompt_tokens: 30, completion_tokens: 12 },
      }),
    } as unknown as Response);

    const { generateSuggestions } = await import('../../../services/llm/suggestions');
    const result = await generateSuggestions([]);

    expect(result).toEqual(['Attack the goblin', 'Cast Magic Missile', 'Drink a potion']);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const callBody = JSON.parse((mockFetch.mock.calls[0][1] as { body: string }).body);
    expect(callBody.messages[1].content).toContain('Combat active');
    expect(callBody.max_tokens).toBe(200);
  });

  it('returns empty when not in combat and HP is healthy (tactical gate)', async () => {
    const char = makeCharacter();
    mcpServer.joinParty(char);

    const { generateSuggestions } = await import('../../../services/llm/suggestions');
    const result = await generateSuggestions([]);
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns suggestions when HP is low even outside combat', async () => {
    const char = makeCharacter({ hp: { current: 1, max: 12 } });
    mcpServer.joinParty(char);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        choices: [{
          message: {
            content: '{"suggestions":["Cast Healing Word","Drink a potion","Take cover"]}',
            role: 'assistant',
          },
        }],
        usage: { prompt_tokens: 25, completion_tokens: 10 },
      }),
    } as unknown as Response);

    const { generateSuggestions } = await import('../../../services/llm/suggestions');
    const result = await generateSuggestions([]);
    expect(result.length).toBe(3);
    expect(result[0]).toContain('Healing');
  });
});
