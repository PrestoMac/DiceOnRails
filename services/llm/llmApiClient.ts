import { Message, MessageRole, LLMProvider } from '../../types';
import { getEnv } from '../../utils/envHelper';
import { isDebugMode } from '../../utils/debug';
import { buildChatCompletionUrl, buildChatCompletionHeaders, resolveProvider, normalizeModelName } from '../llmClient';

/**
 * Resolves the LLM configuration from an optional provider config or environment variables.
 * @param providerConfig - Optional provider configuration override.
 * @returns An object containing apiKey, model, apiUrl, and apiHeaders.
 */
export function resolveLLMConfig(providerConfig?: { provider: LLMProvider; apiKey: string; apiBase?: string }) {
    const apiKey = providerConfig?.apiKey || getEnv("VITE_LLM_API_KEY");
    const apiBase = providerConfig?.apiBase;
    const provider = resolveProvider(providerConfig?.provider, apiBase);
    const rawModel = getEnv("VITE_LLM_MODEL") || "deepseek/deepseek-v4-flash";
    const model = normalizeModelName(rawModel, apiBase);
    const apiUrl = buildChatCompletionUrl(provider, apiBase);
    const apiHeaders = buildChatCompletionHeaders(provider, apiKey);
    if (isDebugMode) {
        const safe = { ...apiHeaders, Authorization: apiHeaders.Authorization ? `Bearer ${apiHeaders.Authorization.slice(0, 16)}...` : 'MISSING' };
        console.log('[LLMApiClient] resolveLLMConfig', { provider, rawModel, model, apiUrl, headers: safe, hasApiKey: !!apiKey, hasApiBase: !!apiBase });
    }
    return { apiKey, model, apiUrl, apiHeaders };
}

/**
 * Maps internal Message objects to LLM API message format (role/content/tool_call_id).
 * @param history - The array of internal Message objects.
 * @returns An array of API-compatible message objects.
 */
export function mapHistoryToMessages(history: Message[]) {
  const result: Array<{
    role: string;
    content: string;
    tool_call_id?: string;
    tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
  }> = [];

  let i = 0;
  while (i < history.length) {
    const msg = history[i];

    if (msg.role === MessageRole.TOOL) {
      // Skip orphan tool messages — they'll be attached to their parent assistant
      i++;
      continue;
    }

    const entry: (typeof result)[number] = {
      role: (msg.role === MessageRole.MODEL ? 'assistant'
        : msg.role === MessageRole.SYSTEM ? 'system'
        : 'user') as string,
      content:
        msg.role === MessageRole.USER && msg.senderName && msg.senderName !== 'You'
          ? `[${msg.senderName}]: ${msg.text}`
          : msg.text || '',
    };

    // If this assistant message has tool_calls, emit them and collect the tool results
    if (msg.role === MessageRole.MODEL && msg.toolCalls && msg.toolCalls.length > 0) {
      entry.tool_calls = msg.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.arguments },
      }));
      result.push(entry);

      // Emit the tool result messages that follow
      let j = i + 1;
      while (j < history.length && history[j].role === MessageRole.TOOL) {
        result.push({
          role: 'tool',
          content: history[j].text,
          tool_call_id: history[j].toolCallId || history[j].id,
        });
        j++;
      }
      i = j;
    } else {
      result.push(entry);
      i++;
    }
  }

  return result;
}

/**
 * Wraps fetch with an abort timeout.
 * @param url - The URL to fetch.
 * @param init - The fetch init options.
 * @param timeoutMs - Timeout in milliseconds (default 30000).
 * @returns A promise resolving to the Response.
 */
export function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 30000): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
    return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}
