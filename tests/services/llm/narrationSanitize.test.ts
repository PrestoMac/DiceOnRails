import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateNarration } from '../../../services/llm/narration';
import { LLMProvider } from '../../../types';

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

function makeResponse(content: string) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      choices: [{ message: { content, role: 'assistant' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
  } as unknown as Response;
}

describe('generateNarration sanitization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('strips raw <tool_call> markup from the narration output', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(
      '<tool_call> <function=tool_call> </function> </tool_call><tool_call> <function=tool_call> </function> </tool_call>'
    )));
    const result = await generateNarration([], 'ctx', undefined, { provider: 'openai' as LLMProvider, apiKey: 'test-key' });
    // Artifact-only content sanitizes to empty string (so callers fall back).
    expect(result.text).toBe('');
  });

  it('keeps real prose and strips only the embedded markup', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(
      'The tavern door creaks open. <tool_call><function=x></function></tool_call> A cold draft follows you in.'
    )));
    const result = await generateNarration([], 'ctx', undefined, { provider: 'openai' as LLMProvider, apiKey: 'test-key' });
    expect(result.text).toBe('The tavern door creaks open. A cold draft follows you in.');
  });

  it('passes clean narration through unchanged', async () => {
    const clean = 'The guard lowers his halberd and nods you through the gate into the bailey.';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(clean)));
    const result = await generateNarration([], 'ctx', undefined, { provider: 'openai' as LLMProvider, apiKey: 'test-key' });
    expect(result.text).toBe(clean);
  });
});
