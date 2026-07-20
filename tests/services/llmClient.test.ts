import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/envHelper', () => ({
  getEnv: vi.fn(() => undefined),
}));

vi.mock('../../utils/debug', () => ({
  isDebugMode: false,
}));

const { getEnv } = await import('../../utils/envHelper');
import { buildChatCompletionUrl, buildChatCompletionHeaders, resolveProvider, normalizeModelName, resolveRequestModel, resolveApiKey } from '../../services/llmClient';

describe('llmClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEnv).mockReset();
  });

  describe('resolveProvider', () => {
    it('defaults to openrouter when no args', () => {
      expect(resolveProvider()).toBe('openrouter');
    });

    it('returns openai when apiBase contains openai-style domain', () => {
      expect(resolveProvider(undefined, 'https://api.openai.com/v1')).toBe('openai');
    });

    it('prefers apiBase arg over provider arg', () => {
      expect(resolveProvider('openrouter', 'https://api.openai.com/v1')).toBe('openai');
    });

    it('returns provider arg when no apiBase', () => {
      expect(resolveProvider('openai')).toBe('openai');
    });

    it('apiBase containing openrouter.ai keeps openrouter', () => {
      expect(resolveProvider(undefined, 'https://openrouter.ai/api/v1')).toBe('openrouter');
    });

    it('env var VITE_LLM_API_BASE sets apiBase', () => {
      vi.mocked(getEnv).mockReturnValue('https://api.openai.com/v1');
      expect(resolveProvider()).toBe('openai');
    });

    it('undefined both returns openrouter', () => {
      expect(resolveProvider(undefined, undefined)).toBe('openrouter');
    });
  });

  describe('buildChatCompletionUrl', () => {
    it('openai default URL', () => {
      expect(buildChatCompletionUrl('openai')).toBe('https://api.openai.com/v1/chat/completions');
    });

    it('openrouter default URL', () => {
      expect(buildChatCompletionUrl('openrouter')).toBe('https://openrouter.ai/api/v1/chat/completions');
    });

    it('custom base URL arg', () => {
      expect(buildChatCompletionUrl('openai', 'https://custom.com/v1')).toBe('https://custom.com/v1/chat/completions');
    });

    it('env var VITE_LLM_API_BASE used', () => {
      vi.mocked(getEnv).mockReturnValue('https://env-base.com/v1');
      expect(buildChatCompletionUrl('openai')).toBe('https://env-base.com/v1/chat/completions');
    });

    it('trailing slash stripped', () => {
      expect(buildChatCompletionUrl('openai', 'https://api.openai.com/v1/')).toBe('https://api.openai.com/v1/chat/completions');
    });

    it('customBase arg takes precedence over env', () => {
      vi.mocked(getEnv).mockReturnValue('https://env-base.com/v1');
      expect(buildChatCompletionUrl('openai', 'https://custom.com/v1')).toBe('https://custom.com/v1/chat/completions');
    });
  });

  describe('buildChatCompletionHeaders', () => {
    it('OpenAI with valid key adds Bearer and Content-Type', () => {
      const headers = buildChatCompletionHeaders('openai', 'sk-abc');
      expect(headers).toEqual({
        'Content-Type': 'application/json',
        Authorization: 'Bearer sk-abc',
      });
    });

    it('OpenRouter adds HTTP-Referer and X-Title', () => {
      const headers = buildChatCompletionHeaders('openrouter', 'sk-abc');
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Authorization']).toBe('Bearer sk-abc');
      expect(headers['HTTP-Referer']).toBeTruthy();
      expect(headers['X-Title']).toBe('DiceOnRails');
    });

    it('OpenRouter with custom origin', () => {
      const headers = buildChatCompletionHeaders('openrouter', 'sk-abc', 'https://myapp.com');
      expect(headers['HTTP-Referer']).toBe('https://myapp.com');
    });

    it('OpenAI does not add HTTP-Referer', () => {
      const headers = buildChatCompletionHeaders('openai', 'sk-abc');
      expect(headers['HTTP-Referer']).toBeUndefined();
    });

    it('missing apiKey results in Bearer with empty key', () => {
      const headers = buildChatCompletionHeaders('openai', '');
      expect(headers['Authorization']).toBe('Bearer ');
    });
  });

  describe('resolveApiKey', () => {
    it('uses settingsKey arg', () => {
      expect(resolveApiKey('key-from-arg')).toBe('key-from-arg');
    });

    it('falls back to env VITE_LLM_API_KEY', () => {
      vi.mocked(getEnv).mockReturnValue('key-from-env');
      expect(resolveApiKey()).toBe('key-from-env');
    });

    it('returns undefined when nothing available', () => {
      expect(resolveApiKey()).toBeUndefined();
    });

    it('settingsKey takes precedence over env', () => {
      vi.mocked(getEnv).mockReturnValue('key-from-env');
      expect(resolveApiKey('key-from-arg')).toBe('key-from-arg');
    });
  });

  describe('normalizeModelName', () => {
    it('OpenAI strips provider prefix', () => {
      expect(normalizeModelName('openai/gpt-4', 'https://api.openai.com/v1')).toBe('gpt-4');
    });

    it('OpenRouter preserves full name', () => {
      expect(normalizeModelName('openai/gpt-4', 'https://openrouter.ai/api/v1')).toBe('openai/gpt-4');
    });

    it('no apiBase passes through', () => {
      expect(normalizeModelName('openai/gpt-4')).toBe('openai/gpt-4');
    });

    it('no slash in model passes through', () => {
      expect(normalizeModelName('gpt-4', 'https://api.openai.com/v1')).toBe('gpt-4');
    });

    it('env var used when no arg', () => {
      vi.mocked(getEnv).mockReturnValue('https://api.openai.com/v1');
      expect(normalizeModelName('openai/gpt-4')).toBe('gpt-4');
    });
  });

  describe('resolveRequestModel', () => {
    it('opencode.ai prefix stripped', () => {
      expect(resolveRequestModel('opencode/gpt-4', 'https://opencode.ai')).toBe('gpt-4');
    });

    it('non-opencode.ai falls to normalize', () => {
      expect(resolveRequestModel('openai/gpt-4', 'https://api.openai.com/v1')).toBe('gpt-4');
    });

    it('no model prefix passes through', () => {
      expect(resolveRequestModel('gpt-4', 'https://api.openai.com/v1')).toBe('gpt-4');
    });

    it('no apiBase passes through', () => {
      expect(resolveRequestModel('openai/gpt-4')).toBe('openai/gpt-4');
    });
  });
});
