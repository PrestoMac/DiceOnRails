import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { compressRawToCheckpoint } from '../../../services/llm/atmosphere';
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

function makeAbortError(): DOMException {
  // jsdom provides DOMException; mimic a real fetch timeout abort.
  return new DOMException('The operation was aborted', 'AbortError');
}

function makeSuccessResponse(content: string) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({
      choices: [{ message: { content }, finish_reason: 'stop' }],
      usage: { completion_tokens: 500 },
    }),
  } as unknown as Response;
}

describe('compressRawToCheckpoint — AbortError retry', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('retries once on AbortError and returns the checkpoint when retry succeeds', async () => {
    const longContent = 'A'.repeat(500);
    const fetchSpy = vi.fn()
      .mockRejectedValueOnce(makeAbortError())
      .mockResolvedValueOnce(makeSuccessResponse(longContent));
    vi.stubGlobal('fetch', fetchSpy);

    const result = await compressRawToCheckpoint('raw session text', 'key', 'model');

    expect(result).toBe(longContent);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('returns empty string when both attempts abort', async () => {
    const fetchSpy = vi.fn()
      .mockRejectedValue(makeAbortError());
    vi.stubGlobal('fetch', fetchSpy);

    const result = await compressRawToCheckpoint('raw session text', 'key', 'model');

    expect(result).toBe('');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on non-Abort errors', async () => {
    const fetchSpy = vi.fn()
      .mockRejectedValueOnce(new Error('network failure'));
    vi.stubGlobal('fetch', fetchSpy);

    const result = await compressRawToCheckpoint('raw session text', 'key', 'model');

    expect(result).toBe('');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('uses reasoning_content when content is empty', async () => {
    const reasoning = 'B'.repeat(500);
    const fetchSpy = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        choices: [{ message: { content: '', reasoning_content: reasoning }, finish_reason: 'stop' }],
        usage: { completion_tokens: 500 },
      }),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchSpy);

    const result = await compressRawToCheckpoint('raw session text', 'key', 'model');

    expect(result).toBe(reasoning);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
