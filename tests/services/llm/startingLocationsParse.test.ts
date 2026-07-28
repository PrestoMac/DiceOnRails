import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateStartingLocations, STARTING_LOCATIONS_PROMPT } from '../../../services/llm/atmosphere';
import { LLMProvider } from '../../../types';

vi.mock('../../../utils/envHelper', () => ({
  getEnv: vi.fn((_key: string) => {
    // Return an API key so the function proceeds past the no-key guard.
    if (_key === 'VITE_LLM_API_KEY') return 'test-key';
    return undefined;
  }),
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

function makeSuccessResponse(content: string) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve({
      choices: [{ message: { content }, finish_reason: 'stop' }],
      usage: { completion_tokens: 500 },
    }),
  } as unknown as Response;
}

describe('generateStartingLocations — introHook parse fallback (Bug 1b)', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('falls back to description when the LLM omits introHook AND hook', async () => {
    // LLM returned locations with no introHook / hook field — the previous bug
    // surfaced as an empty introHook, which then tripped the hardcoded
    // "hooded figure" fallback in the chat intro narration. The parser now
    // falls back to the description so the preview card always renders.
    const llmContent = JSON.stringify([
      { name: 'The Crooked Antler', description: 'A squat timber lodge where elk horns line the walls and the fire never dies.' },
      { name: 'Saltwind Inn', description: 'A driftwood tavern perched over a restless harbor.' },
      { name: 'The Brass Lantern', description: 'A merchant-road waypoint glowing with brass lamps.' },
      { name: 'Old Mill Waystation', description: 'A converted grain mill beside a sleepy brook.' },
    ]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeSuccessResponse(llmContent)));

    const locs = await generateStartingLocations({ name: 'Aria', race: 'elf', class: 'wizard' }, 'test-key');

    expect(locs).toHaveLength(4);
    for (const loc of locs) {
      // introHook must never be empty now — falls back to description.
      expect(loc.introHook.length).toBeGreaterThan(0);
      // When the LLM omitted introHook, the parser uses the description.
      expect(loc.introHook).toBe(loc.description);
    }
  });

  it('uses the LLM-provided introHook when present', async () => {
    const llmContent = JSON.stringify([
      {
        name: 'The Rusty Anchor',
        description: 'A harbor-side dive reeking of brine and beer.',
        introHook: 'A one-eyed sailor waves you over to a corner booth, swearing she has seen your face in a dream.',
      },
    ]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeSuccessResponse(llmContent)));

    const locs = await generateStartingLocations({ name: 'Bram', race: 'dwarf', class: 'fighter' }, 'test-key');

    expect(locs).toHaveLength(1);
    expect(locs[0].introHook).toBe('A one-eyed sailor waves you over to a corner booth, swearing she has seen your face in a dream.');
  });

  it('uses the legacy "hook" alias when introHook is absent', async () => {
    const llmContent = JSON.stringify([
      {
        name: 'The Hollow Oak',
        description: 'A tavern built into a living tree.',
        hook: 'A dryad bartender hums a tune older than the kingdom.',
      },
    ]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeSuccessResponse(llmContent)));

    const locs = await generateStartingLocations({ name: 'Cael', race: 'human', class: 'cleric' }, 'test-key');

    expect(locs[0].introHook).toBe('A dryad bartender hums a tune older than the kingdom.');
  });

  it('STARTING_LOCATIONS_PROMPT mandates a non-empty introHook', () => {
    // Strengthened prompt — the word MANDATORY and "NEVER leave this field empty"
    // should appear so the LLM is unambiguous about always returning introHook.
    expect(STARTING_LOCATIONS_PROMPT).toMatch(/MANDATORY/i);
    expect(STARTING_LOCATIONS_PROMPT).toMatch(/NEVER leave this field empty/i);
  });
});
