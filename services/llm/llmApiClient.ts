import { Message, MessageRole, LLMProvider } from '../../types';
import { getEnv } from '../../utils/envHelper';
import { isDebugMode } from '../../utils/debug';
import { buildChatCompletionUrl, buildChatCompletionHeaders, resolveProvider, normalizeModelName } from '../llmClient';

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

export function mapHistoryToMessages(history: Message[]) {
    return history.map(msg => ({
        role: (msg.role === MessageRole.MODEL ? "assistant"
            : msg.role === MessageRole.SYSTEM ? "system"
            : msg.role === MessageRole.TOOL ? "tool"
            : "user") as string,
        content: (msg.role === MessageRole.USER && msg.senderName && msg.senderName !== "You")
            ? `[${msg.senderName}]: ${msg.text}`
            : (msg.text || ""),
        ...(msg.role === MessageRole.TOOL ? { tool_call_id: msg.toolCallId || msg.id } : {}),
    }));
}

export function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 30000): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}
