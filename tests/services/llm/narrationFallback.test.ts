import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateNarration, generateNarrationSimple, buildDeterministicNarration } from '../../../services/llm/narration';
import { Message, MessageRole, RollData, LLMProvider } from '../../../types';

vi.mock('../../../utils/envHelper', () => ({
  getEnv: vi.fn(() => undefined),
  getThinkingDisabledBody: vi.fn(() => undefined),
}));

vi.mock('../../../utils/debug', () => ({
  isDebugMode: false,
}));

vi.mock('../../../services/llmClient', () => ({
  buildChatCompletionUrl: vi.fn(() => 'https://example.test/chat/completions'),
  buildChatCompletionHeaders: vi.fn(() => ({ Authorization: 'Bearer test-key' })),
  resolveProvider: vi.fn(() => 'openai' as LLMProvider),
  normalizeModelName: vi.fn((m: string) => m),
}));

function makeResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function makeMessage(text: string, rollData?: RollData | RollData[]): Message {
  return {
    id: `m-${Math.random().toString(36).slice(2, 8)}`,
    role: MessageRole.TOOL,
    text,
    timestamp: Date.now(),
    rollData,
  };
}

describe('generateNarration — reasoning_content fallback', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('does NOT use reasoning_content when content is empty (returns empty)', async () => {
    // Per the no-bleed fix, reasoning_content is never treated as narration — it
    // is the model's planning/thinking, not prose. An empty content result yields
    // empty text so the narration tier chain can fall through.
    const reasoning = 'The tavern falls silent as a cloaked stranger enters, their boots clicking against the worn wooden floor.';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({
      choices: [{ message: { content: '', reasoning_content: reasoning, role: 'assistant' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    })));
    const result = await generateNarration([], 'ctx', undefined, { provider: 'openai' as LLMProvider, apiKey: 'k' });
    expect(result.text).toBe('');
  });

  it('prefers content when both content and reasoning_content are present', async () => {
    const content = 'The guard nods and waves you through the gate into the bustling bailey beyond.';
    const reasoning = 'The player approaches the guard...';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({
      choices: [{ message: { content, reasoning_content: reasoning, role: 'assistant' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    })));
    const result = await generateNarration([], 'ctx', undefined, { provider: 'openai' as LLMProvider, apiKey: 'k' });
    expect(result.text).toBe(content);
  });

  it('returns empty when both content and reasoning_content are absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({
      choices: [{ message: { content: '', role: 'assistant' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    })));
    const result = await generateNarration([], 'ctx', undefined, { provider: 'openai' as LLMProvider, apiKey: 'k' });
    expect(result.text).toBe('');
  });
});

describe('generateNarrationSimple', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns sanitized narration on a happy-path response', async () => {
    const text = 'Your blade flashes in the torchlight, catching the goblin off guard.';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({
      choices: [{ message: { content: text, role: 'assistant' } }],
      usage: { prompt_tokens: 10, completion_tokens: 12 },
    })));
    const result = await generateNarrationSimple([], 'ctx', undefined, { provider: 'openai' as LLMProvider, apiKey: 'k' });
    expect(result.text).toBe(text);
  });

  it('does NOT fall back to reasoning_content when content is empty (returns empty)', async () => {
    const reasoning = 'The dragon rears back, inhaling deeply before unleashing a torrent of flame across the cavern.';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse({
      choices: [{ message: { content: '', reasoning_content: reasoning, role: 'assistant' } }],
      usage: { prompt_tokens: 10, completion_tokens: 12 },
    })));
    const result = await generateNarrationSimple([], 'ctx', undefined, { provider: 'openai' as LLMProvider, apiKey: 'k' });
    expect(result.text).toBe('');
  });

  it('returns empty string when API key is missing', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const result = await generateNarrationSimple([], 'ctx', undefined, { provider: 'openai' as LLMProvider, apiKey: '' });
    expect(result.text).toBe('');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns empty string on fetch failure (swallowed, not thrown)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const result = await generateNarrationSimple([], 'ctx', undefined, { provider: 'openai' as LLMProvider, apiKey: 'k' });
    expect(result.text).toBe('');
  });
});

describe('buildDeterministicNarration', () => {
  it('returns empty string for empty input', () => {
    expect(buildDeterministicNarration([])).toBe('');
  });

  it('returns empty string when only narrate_turn/next_turn messages exist', () => {
    const msgs = [
      makeMessage('[System:narrate_turn] The story moves on.'),
      makeMessage('[System:next_turn] Goblin attacks.'),
    ];
    expect(buildDeterministicNarration(msgs)).toBe('');
  });

  it('describes a hit with total damage from damage rollData', () => {
    const attack: RollData = { type: 'attack', dieFace: 'd20', dieRoll: 14, modifier: 3, total: 17, dc: 15, success: true, dieCount: 1, results: [14] };
    const dmg: RollData = { type: 'damage', dieFace: 'd8', dieRoll: 5, modifier: 3, total: 8, success: true, dieCount: 1, results: [5] };
    const msgs = [makeMessage('[System:player_attack] Valerius hits Goblin.', attack), makeMessage('[System:player_attack] 8 damage.', dmg)];
    expect(buildDeterministicNarration(msgs)).toBe('The strike lands for 8 damage.');
  });

  it('describes a miss when attack rollData.success is false', () => {
    const attack: RollData = { type: 'attack', dieFace: 'd20', dieRoll: 5, modifier: 3, total: 8, dc: 15, success: false, dieCount: 1, results: [5] };
    const msgs = [makeMessage('[System:player_attack] Valerius misses Goblin.', attack)];
    expect(buildDeterministicNarration(msgs)).toBe('The attack on Valerius misses.');
  });

  it('describes a successful skill check', () => {
    const roll: RollData = { type: 'skill', dieFace: 'd20', dieRoll: 18, modifier: 2, total: 20, dc: 15, success: true, dieCount: 1, results: [18] };
    const msgs = [makeMessage('[System:check_skill] Persuasion check.', roll)];
    expect(buildDeterministicNarration(msgs)).toBe('The skill check succeeds.');
  });

  it('describes a failed saving throw', () => {
    const roll: RollData = { type: 'save', dieFace: 'd20', dieRoll: 3, modifier: 1, total: 4, dc: 12, success: false, dieCount: 1, results: [3] };
    const msgs = [makeMessage('[System:make_save] Dex save.', roll)];
    expect(buildDeterministicNarration(msgs)).toBe('The saving throw fails.');
  });

  it('describes a move_to action', () => {
    const msgs = [makeMessage('[System:move_to] You arrive at the Black Mountain Pass.')];
    expect(buildDeterministicNarration(msgs)).toBe('You make your way onward.');
  });

  it('describes a rest action', () => {
    const msgs = [makeMessage('[System:long_rest] The party rests for the night.')];
    expect(buildDeterministicNarration(msgs)).toBe('The party takes a moment to recover.');
  });
});
