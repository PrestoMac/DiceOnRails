import { Message, LLMProvider, GameState } from '../../types';
import { isDebugMode } from '../../utils/debug';
import { sanitizeNarration } from '../../utils/textSanitize';
import { parseLlmResponse } from '../../utils/safeJson';
import { resolveLLMConfig, mapHistoryToMessages } from './llmApiClient';
import { buildCombatSuggestions } from '../mcp/combatService';

/** Hard cap on a single suggestion string length (matches engine clamp in mcpService.ts). */
const MAX_SUGGESTION_CHARS = 80;
/** Maximum number of suggestions surfaced in the tray at once. */
const MAX_SUGGESTIONS = 3;

/**
 * Generic fallback set so the suggestion tray is never blank when the setting
 * is enabled and every other tier produced nothing usable.
 */
export const GENERIC_SUGGESTIONS: string[] = [
    'Look around the area',
    'Check your inventory',
    'Speak to a companion',
];

/**
 * Normalizes an arbitrary suggestion list into a clean, bounded array:
 * strings only, sanitized, clamped to MAX_SUGGESTION_CHARS, capped at MAX_SUGGESTIONS.
 */
export function normalizeSuggestions(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        .map(s => sanitizeNarration(s).trim())
        .filter(s => s.length > 0)
        .map(s => s.slice(0, MAX_SUGGESTION_CHARS))
        .slice(0, MAX_SUGGESTIONS);
}

/**
 * Builds context-aware NON-COMBAT suggestions purely from game state — zero LLM
 * cost. Used as the deterministic fallback when a turn did not naturally produce
 * suggestions. Order of precedence:
 *   1. wounded party member (< 50% HP) -> rest
 *   2. a caster whose spell slots are all spent -> rest to recover slots
 *   3. an active quest objective -> pursue it
 *   4. a known location that isn't the current one -> travel there
 *   5. a known NPC -> speak with them
 *   6. otherwise -> search the area (so the result is never empty)
 */
export function buildExplorationSuggestions(state: GameState): string[] {
    if (!state) return [];
    const suggestions: string[] = [];
    const aliveParty = (state.party || []).filter(c => c.hp && c.hp.current > 0);

    // 1. Wounded party member (< 50% HP).
    const wounded = aliveParty.filter(c => c.hp.current < (c.hp.max || 1) * 0.5);
    if (wounded.length > 0) suggestions.push('Take a short rest to recover');

    // 2. A caster whose spell slots are all spent. (Spell slots are identified by
    // id prefix, matching travelService / buildCharacterEnrichment — ResourcePool
    // has no `type` field.)
    const spentCaster = aliveParty.find(c => {
        const slots = (c.resources || []).filter(r => r.id.startsWith('spell-slot-'));
        return slots.length > 0 && slots.every(s => (s.current ?? 0) <= 0);
    });
    if (spentCaster) suggestions.push('Rest to regain spell slots');

    // 3. An active quest objective.
    const activeQuest = (state.quests || []).find(q => q.status === 'active');
    if (activeQuest) suggestions.push(`Pursue: ${activeQuest.title}`);

    // 4. A known location that isn't the party's current one.
    const currentLocation = aliveParty[0]?.location;
    const knownLocation = (state.lore || []).find(
        l => l.category === 'Location' && currentLocation && l.title !== currentLocation
    );
    if (knownLocation) suggestions.push(`Travel to ${knownLocation.title}`);

    // 5. A known NPC to converse with.
    const knownNpc = (state.lore || []).find(l => l.category === 'NPC');
    if (knownNpc) suggestions.push(`Speak with ${knownNpc.title}`);

    // 6. Ultimate fallback (only when nothing else applied).
    if (suggestions.length === 0) suggestions.push('Search the area');

    return suggestions.slice(0, MAX_SUGGESTIONS);
}

/** Parses an LLM response body into a normalized suggestion array. */
function parseSuggestionArray(content: string): string[] {
    if (!content) return [];
    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch {
        // Not valid JSON — try to salvage quoted strings (handles models that wrap
        // the array in prose or omit braces). Falls back to line-splitting.
        const matches = content.match(/"([^"]{2,80})"/g);
        parsed = matches ? matches.map(m => m.replace(/"/g, '')) : content.split(/\r?\n/);
    }
    return normalizeSuggestions(parsed);
}

/**
 * Minimal-prompt LLM call that requests 2-3 next-action suggestions as a JSON
 * array. Mirrors generateNarrationSimple (temperature 0.9, content-only — no
 * reasoning_content fallback). Returns [] on any failure or non-array response;
 * never throws. Per-item sanitized + clamped to 80 chars.
 */
export const generateSuggestions = async (
    history: Message[],
    context: string,
    frozenMessages?: { role: 'user' | 'system'; content: string }[],
    providerConfig?: { provider: LLMProvider; apiKey: string; apiBase?: string },
    sessionId?: string,
): Promise<string[]> => {
    const { apiKey: finalApiKey, model, apiUrl, apiHeaders } = resolveLLMConfig(providerConfig, sessionId);
    if (!finalApiKey) {
        if (isDebugMode) console.error('[Suggestions] generateSuggestions: No API key');
        return [];
    }
    const messages = mapHistoryToMessages(history);
    const systemMessage = {
        role: 'system' as const,
        content:
            'You suggest the next 2-3 actions a player could take in a fantasy RPG, given the latest narration and game state. Respond with ONLY a JSON array of 2-3 short strings, each in the FIRST PERSON from the player perspective, max 60 characters, no numbering, no markdown, no extra commentary. Respond in English. Example: ["Ask the tavernkeeper about rumors","Inspect the odd statue"]',
    };
    const contextMessage = { role: 'user' as const, content: `[Dungeon State Context: ${context}]` };
    const payloadBase: Record<string, unknown> = {
        model,
        messages: [systemMessage, ...(frozenMessages || []), ...messages, contextMessage],
        temperature: 0.9,
    };
    if (sessionId) payloadBase.session_id = sessionId;
    if (isDebugMode) console.log('[Suggestions] generateSuggestions request', { model, messageCount: (payloadBase.messages as unknown[]).length });
    const fetchController = new AbortController();
    const fetchTimer = setTimeout(() => fetchController.abort(new Error('generateSuggestions timed out after 30s')), 30_000);
    try {
        const response = await fetch(apiUrl, { method: 'POST', headers: apiHeaders, body: JSON.stringify(payloadBase), signal: fetchController.signal });
        if (!response.ok) {
            const errMsg = `LLM request failed: ${response.status}`;
            throw new Error(errMsg);
        }
        const data = parseLlmResponse(await response.json());
        const msg = data.choices[0].message;
        const c = (typeof msg.content === 'string' && msg.content.trim()) ? msg.content : '';
        return parseSuggestionArray(c);
    } catch (error) {
        if (isDebugMode) console.error('[Suggestions] generateSuggestions failed:', error instanceof Error ? error.message : String(error));
        return [];
    } finally {
        clearTimeout(fetchTimer);
    }
};

/** Budget for the opt-in extra suggestions LLM call before falling through to the deterministic/generic tiers. */
const SUGGESTION_LLM_TIMEOUT_MS = 20_000;
/** Races a promise against a timeout; resolves to undefined if the budget is exceeded (mirrors withNarrationRetryTimeout). */
function withSuggestionsTimeout<T>(p: Promise<T>): Promise<T | undefined> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), SUGGESTION_LLM_TIMEOUT_MS); });
    return Promise.race([p.then(v => v, () => undefined), timeout]).finally(() => { if (timer) clearTimeout(timer); });
}

/**
 * Resolves the final suggestion set for a turn via a 4-tier fallback chain so the
 * tray is never blank when the feature is enabled:
 *   Tier 0 — inline suggestions captured by the agent loop (preferred).
 *   Tier 1 — opt-in extra LLM call (only when enableSuggestions is on). Placed
 *            above the deterministic tier for higher-fidelity chips; cost is
 *            gated entirely by the setting.
 *   Tier 2 — deterministic generator (combat -> buildCombatSuggestions, else
 *            buildExplorationSuggestions). Zero LLM cost.
 *   Tier 3 — generic always-show fallback.
 * When enableSuggestions is false this is byte-identical to the previous
 * `result.suggestions || []` (Tier 0 only; no call, no fallback tiers).
 */
export async function resolveSuggestions(
    state: GameState,
    history: Message[],
    context: string,
    frozen: { role: 'user' | 'system'; content: string }[] | undefined,
    turnSuggestions: string[] | undefined,
    enableSuggestions: boolean,
    sessionId: string | undefined,
): Promise<string[]> {
    // Tier 0: agent-loop inline suggestions (always available, zero cost).
    const t0 = normalizeSuggestions(turnSuggestions);
    // Feature off -> behave like the old `result.suggestions || []`: Tier 0 only.
    if (!enableSuggestions) return t0;
    if (t0.length > 0) return t0;

    // Tier 1: opt-in extra LLM call (higher fidelity, gated by the setting).
    const llm = await withSuggestionsTimeout(generateSuggestions(history, context, frozen, undefined, sessionId));
    const t1 = normalizeSuggestions(llm);
    if (t1.length > 0) return t1;

    // Tier 2: deterministic generator (combat vs exploration).
    const det = state.combat?.isActive ? buildCombatSuggestions(state) : buildExplorationSuggestions(state);
    const t2 = normalizeSuggestions(det);
    if (t2.length > 0) return t2;

    // Tier 3: generic always-show fallback.
    return [...GENERIC_SUGGESTIONS];
}
