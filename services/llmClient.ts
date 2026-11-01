import { getEnv } from "../utils/envHelper";
import { isDebugMode } from "../utils/debug";
import { LLMProvider } from "../types";

/** Builds an OpenRouter chat URL, optionally using the same-origin proxy. */
export function buildChatCompletionUrl(provider: LLMProvider, customBase?: string): string {
    const configured = customBase || getEnv("VITE_LLM_API_BASE");
    // Old saved custom endpoints must not receive OpenRouter credentials.
    const base = configured?.replace(/\/+$/, '') === '/api' ? '/api' : 'https://openrouter.ai/api/v1';
    const url = `${base.replace(/\/+$/, '')}/chat/completions`;
    if (isDebugMode) console.log('[LLM Client] buildChatCompletionUrl', { provider, customBase, resolvedBase: base, finalUrl: url });
    return url;
}

/** Builds the HTTP headers for a chat completion request, including Authorization and OpenRouter-specific headers. */
export function buildChatCompletionHeaders(provider: LLMProvider, apiKey: string, origin?: string): Record<string, string> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
    };
    headers["HTTP-Referer"] = origin || (typeof window !== 'undefined' ? window.location.origin : "http://localhost:5173");
    headers["X-Title"] = "DiceOnRails";
    if (isDebugMode) {
        const safe = { ...headers, Authorization: headers.Authorization ? `Bearer ${headers.Authorization.slice(0, 16)}...` : 'MISSING' };
        console.log('[LLM Client] buildChatCompletionHeaders', { provider, origin, headers: safe });
    }
    return headers;
}

/** Resolves the API key from a settings value or the VITE_LLM_API_KEY environment variable. */
export function resolveApiKey(settingsKey?: string): string | undefined {
    const key = settingsKey || getEnv("VITE_LLM_API_KEY");
    if (isDebugMode) console.log('[LLM Client] resolveApiKey', { fromSettings: !!settingsKey, fromEnv: !!getEnv("VITE_LLM_API_KEY"), found: !!key });
    return key;
}

/** Treats legacy provider settings as OpenRouter. */
export function resolveProvider(provider?: LLMProvider, apiBase?: string): LLMProvider {
    if (isDebugMode) console.log('[LLM Client] resolveProvider', { provider, apiBase, result: 'openrouter' });
    return 'openrouter';
}

/** Preserves OpenRouter's provider/model identifier. */
export function normalizeModelName(model: string, apiBase?: string): string {
    if (isDebugMode) console.log('[LLM Client] normalizeModelName', { model, apiBase });
    return model;
}

/** Preserves OpenRouter's provider/model identifier. */
export function resolveRequestModel(model: string, apiBase?: string): string {
    return normalizeModelName(model, apiBase);
}

/**
 * Builds a stable session ID for OpenRouter's sticky routing feature.
 *
 * Sticky routing pins all requests within a logical session to the same provider
 * endpoint, ensuring the provider-side KV prompt cache stays warm across turns.
 * Without this, OpenRouter may load-balance each request to a different provider
 * instance, causing a cold cache miss every turn even for identical prefixes.
 *
 * For named campaigns the campaign ID is used directly. For anonymous local play
 * a random ID is generated once and persisted in localStorage for the browser
 * session so repeated turns within the same tab still benefit from caching.
 *
 * @param campaignId - The current campaign ID, or undefined for anonymous sessions.
 * @returns A session ID string ≤ 256 chars (OpenRouter's max).
 */
export function buildSessionId(campaignId?: string): string {
    const ANON_KEY = 'dor_anon_session_id';
    if (!campaignId || campaignId === 'anonymous') {
        try {
            const existing = typeof localStorage !== 'undefined' ? localStorage.getItem(ANON_KEY) : null;
            if (existing) return existing;
            const id = `anon-${crypto.randomUUID()}`;
            if (typeof localStorage !== 'undefined') localStorage.setItem(ANON_KEY, id);
            return id;
        } catch {
            return `anon-${Date.now()}`;
        }
    }
    // Named campaign: use campaign ID as-is (UUIDs are ~36 chars, well under limit)
    return `campaign-${campaignId}`.slice(0, 256);
}
