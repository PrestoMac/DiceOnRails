import { getEnv } from "../utils/envHelper";
import { isDebugMode } from "../utils/debug";

export type LLMProvider = 'openai' | 'openrouter';

export function buildChatCompletionUrl(provider: LLMProvider, customBase?: string): string {
    const base = customBase || getEnv("VITE_LLM_API_BASE") || (provider === 'openai' ? 'https://api.openai.com/v1' : 'https://openrouter.ai/api/v1');
    const url = `${base.replace(/\/+$/, '')}/chat/completions`;
    if (isDebugMode) console.log('[LLM Client] buildChatCompletionUrl', { provider, customBase, resolvedBase: base, finalUrl: url });
    return url;
}

export function buildChatCompletionHeaders(provider: LLMProvider, apiKey: string, origin?: string): Record<string, string> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
    };
    if (provider === 'openrouter') {
        headers["HTTP-Referer"] = origin || (typeof window !== 'undefined' ? window.location.origin : "http://localhost:5173");
        headers["X-Title"] = "DiceOnRails";
    }
    if (isDebugMode) {
        const safe = { ...headers, Authorization: headers.Authorization ? `Bearer ${headers.Authorization.slice(0, 16)}...` : 'MISSING' };
        console.log('[LLM Client] buildChatCompletionHeaders', { provider, origin, headers: safe });
    }
    return headers;
}

export function resolveApiKey(settingsKey?: string): string | undefined {
    const key = settingsKey || getEnv("VITE_LLM_API_KEY");
    if (isDebugMode) console.log('[LLM Client] resolveApiKey', { fromSettings: !!settingsKey, fromEnv: !!getEnv("VITE_LLM_API_KEY"), found: !!key });
    return key;
}

export function resolveProvider(provider?: LLMProvider, apiBase?: string): LLMProvider {
    const base = apiBase || getEnv("VITE_LLM_API_BASE");
    const envVar = getEnv("VITE_LLM_API_BASE");
    let result: LLMProvider;
    if (base && !base.includes('openrouter.ai')) {
        result = 'openai';
    } else {
        result = provider || 'openrouter';
    }
    if (isDebugMode) console.log('[LLM Client] resolveProvider', { providerArg: provider, apiBase, envVar, baseUsed: base, result });
    return result;
}

export function normalizeModelName(model: string, apiBase?: string): string {
    const base = apiBase || getEnv("VITE_LLM_API_BASE");
    const envVar = getEnv("VITE_LLM_API_BASE");
    let result: string;
    if (base && !base.includes('openrouter.ai')) {
        result = model.split('/').pop() || model;
    } else {
        result = model;
    }
    if (isDebugMode) console.log('[LLM Client] normalizeModelName', { model, apiBase, envVar, baseUsed: base, result });
    return result;
}

export function resolveRequestModel(model: string, apiBase?: string): string {
    const base = apiBase || getEnv("VITE_LLM_API_BASE") || '';
    let result: string;
    if (base.includes('opencode.ai') && model.startsWith('opencode/')) {
        result = model.slice('opencode/'.length);
    } else {
        result = normalizeModelName(model, base);
    }
    if (isDebugMode) console.log('[LLM Client] resolveRequestModel', { model, apiBase, envVar: getEnv("VITE_LLM_API_BASE"), baseUsed: base, result });
    return result;
}
