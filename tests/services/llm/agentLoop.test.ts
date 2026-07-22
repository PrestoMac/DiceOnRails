import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Message, MessageRole, GameState, InitiativeEntry, Enemy } from '../../../types';
import { runAgentLoop } from '../../../services/llm/agentLoop';
import { makeCharacter } from '../../helpers/characters';
import { mcpServer } from '../../../services/mcpService';
import { getEnv, getThinkingDisabledBody } from '../../../utils/envHelper';

vi.mock('../../../utils/envHelper', () => {
  const getEnv = vi.fn<[string], string | undefined>();
  const getThinkingDisabledBody = vi.fn(() => undefined);
  return { getEnv, getThinkingDisabledBody };
});

vi.mock('../../../utils/debug', () => ({
  isDebugMode: false,
}));

const mockFetch = vi.fn();

function makeLLMResponse(content: string, toolCalls: Array<{ name: string; args: Record<string, unknown> }> = []) {
  const choices = [{
    message: {
      content,
      tool_calls: toolCalls.map(tc => ({
        id: `call_${Math.random().toString(36).substr(2, 8)}`,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.args) },
      })),
      role: 'assistant',
    },
  }];
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      choices,
      usage: { prompt_tokens: 50, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 5 } },
    }),
  } as unknown as Response;
}

function makeLLMErrorResponse(status: number, message: string) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ error: { message } }),
  } as unknown as Response;
}

function buildCombatState(character: Character, enemyFirst: boolean): GameState {
  const enemy: Enemy = {
    id: 'enemy-1',
    name: 'Goblin',
    ac: 15,
    hp: { current: 7, max: 7 },
    attacks: [{ name: 'Strike', toHit: 2, damageDice: '1d4', damageType: 'bludgeoning' }],
    isDead: false,
  };
  const playerEntry: InitiativeEntry = {
    id: character.id,
    name: character.name,
    initiative: enemyFirst ? 5 : 15,
    type: 'player',
    isDead: false,
    hasActedThisTurn: false,
  };
  const enemyEntry: InitiativeEntry = {
    id: 'enemy-1',
    name: 'Goblin',
    initiative: enemyFirst ? 15 : 5,
    type: 'enemy',
    isDead: false,
    hasActedThisTurn: false,
  };
  return {
    party: [character],
    worldDescription: 'Testing grounds',
    sessionLogs: [],
    quests: [],
    lore: [],
    actionQueue: [],
    combat: {
      isActive: true,
      round: 1,
      turnIndex: 0,
      initiative: enemyFirst ? [enemyEntry, playerEntry] : [playerEntry, enemyEntry],
      enemies: [enemy],
    },
  };
}

describe('runAgentLoop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();

    getEnv.mockReset();
    getEnv.mockImplementation((key: string) => {
      if (key === 'VITE_LLM_API_KEY') return 'test-api-key';
      if (key === 'VITE_LLM_MODEL') return 'deepseek/deepseek-v4-flash';
      return undefined;
    });
    getThinkingDisabledBody.mockReset();
    getThinkingDisabledBody.mockReturnValue(undefined);

    mcpServer.reset();
    mcpServer.joinParty(makeCharacter());

    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('narrate_turn breaks loop immediately', async () => {
    mockFetch.mockResolvedValueOnce(makeLLMResponse('', [
      { name: 'narrate_turn', args: { narration: 'The adventurer surveys the tavern.', timePassed: 0 } },
    ]));

    const result = await runAgentLoop(
      [],
      'You are in a tavern.',
    );

    expect(result.iterationCount).toBe(1);
    expect(result.toolMessages).toHaveLength(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('single tool call is executed and loop continues then breaks', async () => {
    mockFetch
      .mockResolvedValueOnce(makeLLMResponse('', [
        { name: 'roll_dice', args: { sides: 20, count: 1 } },
      ]))
      .mockResolvedValueOnce(makeLLMResponse('The deed is done.'));

    const result = await runAgentLoop([], 'Roll a die.');

    
    expect(result.toolMessages).toHaveLength(1);
    expect(result.toolMessages[0].text).toContain('roll_dice');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('multiple tool calls executed in one batch', async () => {
    mockFetch
      .mockResolvedValueOnce(makeLLMResponse('', [
        { name: 'roll_dice', args: { sides: 20, count: 1 } },
        { name: 'check_skill', args: { skill_name: 'perception', difficulty: 10 } },
      ]))
      .mockResolvedValueOnce(makeLLMResponse('Both actions resolved.'));

    const result = await runAgentLoop([], 'Check the room.');

    
    expect(result.toolMessages).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('max iterations stops the loop', async () => {
    mockFetch
      .mockResolvedValueOnce(makeLLMResponse('', [
        { name: 'roll_dice', args: { sides: 20, count: 1 } },
      ]))
      .mockResolvedValueOnce(makeLLMResponse('', [
        { name: 'roll_dice', args: { sides: 20, count: 1 } },
      ]));

    const result = await runAgentLoop([], 'Do stuff.', undefined, undefined, undefined, { maxIters: 2 });

    expect(result.iterationCount).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('first-iteration empty response forces tool retry', async () => {
    mockFetch
      .mockResolvedValueOnce(makeLLMResponse(''))
      .mockResolvedValueOnce(makeLLMResponse('', [
        { name: 'roll_dice', args: { sides: 20, count: 1 } },
      ]))
      .mockResolvedValueOnce(makeLLMResponse('Action complete.'));

    const result = await runAgentLoop([], 'Do something.');

    
    expect(result.toolMessages).toHaveLength(1);
    expect(result.iterationCount).toBe(3);
  });

  it('abort signal causes rejection', async () => {
    const controller = new AbortController();
    controller.abort();

    mockFetch.mockResolvedValueOnce(makeLLMResponse('ignored'));

    await expect(runAgentLoop([], 'Test', undefined, undefined, undefined, { signal: controller.signal }))
      .rejects.toThrow();
  });

  it('frozen messages are included in the API call body', async () => {
    const frozenMessages = [
      { role: 'system' as const, content: 'You are a helpful assistant.' },
      { role: 'user' as const, content: 'Remember the ancient lore.' },
    ];

    mockFetch.mockResolvedValueOnce(makeLLMResponse('', [
      { name: 'narrate_turn', args: { narration: 'Done.', timePassed: 0 } },
    ]));

    await runAgentLoop([], 'Test', frozenMessages);

    const callArg = mockFetch.mock.calls[0][1] as { body: string };
    const body = JSON.parse(callArg.body);
    const contents = body.messages.map((m: { role: string; content: string }) => m.content);
    expect(contents).toContain('You are a helpful assistant.');
    expect(contents).toContain('Remember the ancient lore.');
  });

  it('throws on API 401 error', async () => {
    mockFetch.mockResolvedValueOnce(makeLLMErrorResponse(401, 'Unauthorized'));

    await expect(runAgentLoop([], 'Test')).rejects.toThrow('Unauthorized');
  });

  it('throws on API 500 error', async () => {
    mockFetch.mockResolvedValueOnce(makeLLMErrorResponse(500, 'Internal Server Error'));

    await expect(runAgentLoop([], 'Test')).rejects.toThrow('Internal Server Error');
  });

  it('missing API key uses empty string in Bearer header', async () => {
    getEnv.mockImplementation((key: string) => {
      if (key === 'VITE_LLM_MODEL') return 'deepseek/deepseek-v4-flash';
      return undefined;
    });

    mockFetch.mockResolvedValueOnce(makeLLMResponse('', [
      { name: 'narrate_turn', args: { narration: 'Done.', timePassed: 0 } },
    ]));

    await runAgentLoop([], 'Test');

    const callArg = mockFetch.mock.calls[0][1] as { headers: Record<string, string> };
    expect(callArg.headers.Authorization).toBe('Bearer undefined');
  });

  it('next_turn breaks loop after successful execution', async () => {
    const char = makeCharacter();
    mcpServer.loadState(buildCombatState(char, false));

    mockFetch.mockResolvedValueOnce(makeLLMResponse('', [
      { name: 'next_turn', args: {} },
    ]));

    const result = await runAgentLoop([], 'Advance turn.');

    expect(result.iterationCount).toBe(1);
    
    expect(result.toolMessages).toHaveLength(1);
    expect(result.toolMessages[0].text).toContain('next_turn');
  });

  it('combat active with non-player turn keeps looping', async () => {
    const char = makeCharacter();
    mcpServer.loadState(buildCombatState(char, true));

    mockFetch
      .mockResolvedValueOnce(makeLLMResponse('The goblin snarls.'))
      .mockResolvedValueOnce(makeLLMResponse('The goblin advances.'))
      .mockResolvedValueOnce(makeLLMResponse('', [
        { name: 'next_turn', args: {} },
      ]));

    const result = await runAgentLoop([], 'Combat context.');

    expect(result.iterationCount).toBeGreaterThanOrEqual(2);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('critical tool failure handled gracefully', async () => {
    const char = makeCharacter();
    mcpServer.loadState(buildCombatState(char, false));

    mockFetch
      .mockResolvedValueOnce(makeLLMResponse('', [
        { name: 'player_attack', args: { attackerId: 'nonexistent', weaponName: 'Longsword', targetId: 'Goblin' } },
      ]))
      .mockResolvedValueOnce(makeLLMResponse('Attack resolved.'));

    const result = await runAgentLoop([], 'Attack!');

    const attackResult = result.toolMessages.find(m => m.text.includes('player_attack'));
    expect(attackResult).toBeDefined();
    expect(result.toolMessages.length).toBeGreaterThanOrEqual(1);
  });

  it('tracks token usage correctly', async () => {
    mockFetch.mockResolvedValueOnce(makeLLMResponse('', [
      { name: 'narrate_turn', args: { narration: 'Done.', timePassed: 0 } },
    ]));

    const result = await runAgentLoop([], 'Test');

    expect(result.promptTokens).toBeGreaterThan(0);
    expect(result.completionTokens).toBeGreaterThan(0);
    expect(result.cachedTokens).toBeGreaterThan(0);
  });

  it('USER messages with senderName prepend name in brackets', async () => {
    const history: Message[] = [
      { id: 'h1', role: MessageRole.USER, text: 'I attack the goblin!', senderName: 'Valerius', timestamp: 1000 },
    ];

    mockFetch.mockResolvedValueOnce(makeLLMResponse('', [
      { name: 'narrate_turn', args: { narration: 'Done.', timePassed: 0 } },
    ]));

    await runAgentLoop(history, 'Battle.');

    const callArg = mockFetch.mock.calls[0][1] as { body: string };
    const body = JSON.parse(callArg.body);
    const userMsg = body.messages.find((m: { role: string }) => m.role === 'user');
    expect(userMsg.content).toContain('[Valerius]: I attack the goblin!');
  });

  it('extracts suggestions from narrate_turn args when enableSuggestions is true', async () => {
    mockFetch.mockResolvedValueOnce(makeLLMResponse('', [
      { name: 'narrate_turn', args: {
        narration: 'The goblin falls.',
        timePassed: 0,
        suggestions: ['Attack the next goblin', 'Cast Cure Wounds', 'Search the room'],
      } },
    ]));

    const result = await runAgentLoop([], 'Combat.', undefined, undefined, undefined, { enableSuggestions: true });

    expect(result.suggestions).toEqual(['Attack the next goblin', 'Cast Cure Wounds', 'Search the room']);
    // Only the main loop fetch — no separate API call.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns undefined suggestions when narrate_turn args lack suggestions', async () => {
    mockFetch.mockResolvedValueOnce(makeLLMResponse('', [
      { name: 'narrate_turn', args: { narration: 'Quiet night.', timePassed: 60 } },
    ]));

    const result = await runAgentLoop([], 'Rest.', undefined, undefined, undefined, { enableSuggestions: true });

    expect(result.suggestions).toBeUndefined();
  });

  it('includes suggestions prompt hint in system message when enableSuggestions is true', async () => {
    mockFetch.mockResolvedValueOnce(makeLLMResponse('', [
      { name: 'narrate_turn', args: { narration: 'Done.', timePassed: 0, suggestions: ['Fight'] } },
    ]));

    await runAgentLoop([], 'Test', undefined, undefined, undefined, { enableSuggestions: true });

    const callArg = mockFetch.mock.calls[0][1] as { body: string };
    const body = JSON.parse(callArg.body);
    const sysMsg = body.messages.find((m: { role: string }) => m.role === 'system');
    expect(sysMsg.content).toContain('SUGGESTED ACTIONS');
    expect(sysMsg.content).toContain('suggestions field');
  });

  it('omits suggestions prompt hint when enableSuggestions is not set', async () => {
    mockFetch.mockResolvedValueOnce(makeLLMResponse('', [
      { name: 'narrate_turn', args: { narration: 'Done.', timePassed: 0 } },
    ]));

    await runAgentLoop([], 'Test');

    const callArg = mockFetch.mock.calls[0][1] as { body: string };
    const body = JSON.parse(callArg.body);
    const sysMsg = body.messages.find((m: { role: string }) => m.role === 'system');
    expect(sysMsg.content).not.toContain('SUGGESTED ACTIONS');
  });
});
