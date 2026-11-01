import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/envHelper', () => ({ getEnv: vi.fn(() => undefined) }));
vi.mock('../../utils/debug', () => ({ isDebugMode: false }));

const { getEnv } = await import('../../utils/envHelper');
import { buildChatCompletionUrl, buildChatCompletionHeaders, resolveProvider, normalizeModelName, resolveRequestModel, resolveApiKey } from '../../services/llmClient';

describe('OpenRouter client', () => {
  beforeEach(() => vi.mocked(getEnv).mockReset());

  it('uses OpenRouter even for legacy provider settings and custom endpoints', () => {
    vi.mocked(getEnv).mockReturnValue('https://old-provider.example/v1');
    expect(resolveProvider('openai')).toBe('openrouter');
    expect(buildChatCompletionUrl('openai')).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(buildChatCompletionUrl('openrouter', 'https://other.example/v1')).toBe('https://openrouter.ai/api/v1/chat/completions');
  });

  it('supports only the same-origin proxy as an alternate route', () => {
    expect(buildChatCompletionUrl('openrouter', '/api/')).toBe('/api/chat/completions');
    vi.mocked(getEnv).mockReturnValue('/api');
    expect(buildChatCompletionUrl('openrouter')).toBe('/api/chat/completions');
  });

  it('preserves full OpenRouter model identifiers for direct and proxy requests', () => {
    expect(normalizeModelName('openai/gpt-4', '/api')).toBe('openai/gpt-4');
    expect(resolveRequestModel('openai/gpt-4', '/api')).toBe('openai/gpt-4');
  });

  it('includes OpenRouter headers even with legacy provider settings', () => {
    expect(buildChatCompletionHeaders('openai', 'test-key', 'https://example.test')).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-key',
      'HTTP-Referer': 'https://example.test',
      'X-Title': 'DiceOnRails',
    });
  });

  it('prefers the configured key and falls back to the environment', () => {
    vi.mocked(getEnv).mockReturnValue('env-key');
    expect(resolveApiKey('settings-key')).toBe('settings-key');
    expect(resolveApiKey()).toBe('env-key');
    vi.mocked(getEnv).mockReturnValue(undefined);
    expect(resolveApiKey()).toBeUndefined();
  });
});
