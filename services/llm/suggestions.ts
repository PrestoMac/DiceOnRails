import { Message, LLMProvider, GameState, Character } from '../../types';
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
 * Picks the suggestions to display for the locally-viewed character. Prefers
 * the per-character map (`lastSuggestionsByCharacter`, the new source of
 * truth), falling back to the deprecated `lastSuggestions` field for old
 * saves. Returns undefined when no suggestions are stored at all so the tray
 * does not render.
 */
export function pickSuggestionsForCharacter(
    state: GameState,
    characterId: string | undefined,
): string[] | undefined {
    if (!state) return undefined;
    if (characterId && state.lastSuggestionsByCharacter) {
        const entry = state.lastSuggestionsByCharacter[characterId];
        if (entry && entry.length > 0) return entry;
        // Per-character map is authoritative when it exists — don't fall through
        // to the deprecated lastSuggestions (which the agent loop may mutate on
        // the same object reference during processing, causing chips to reappear).
        return [];
    }
    return state.lastSuggestions;
}

/** Classes that can self-heal with spells (used for wounded-self suggestions). */
const SELF_HEALING_CLASSES = new Set(['cleric', 'druid', 'paladin', 'bard', 'ranger']);

/** Class-keyed exploration suggestions — class fantasy, no mechanics. */
const CLASS_EXPLORATION_SUGGESTIONS: Record<string, string[]> = {
    rogue:     ['Scout ahead for danger', 'Search for traps and hidden doors'],
    ranger:    ['Track nearby creatures', 'Forage in the wilderness'],
    wizard:    ['Examine magical auras', 'Consult your spellbook'],
    cleric:    ['Pray for divine guidance', 'Sense nearby spirits'],
    bard:      ['Gather rumors with a song', 'Perform for the crowd'],
    fighter:   ['Stand watch', 'Sharpen your blade'],
    barbarian: ['Channel your primal instincts', 'Test your strength'],
    paladin:   ['Seek those in need', 'Pledge to a noble cause'],
    druid:     ['Commune with nature', 'Listen to the wild'],
    monk:      ['Meditate on your discipline', 'Center your ki'],
    warlock:   ['Consult your patron', 'Invoke a hidden pact'],
    sorcerer:  ['Channel your innate magic', 'Practice a cantrip'],
};

/** Returns true when a character has spell slots but all are spent. */
function isSpentCaster(c: Character): boolean {
    const slots = (c.resources || []).filter(r => r.id.startsWith('spell-slot-'));
    return slots.length > 0 && slots.every(s => (s.current ?? 0) <= 0);
}

/**
 * Builds context-aware NON-COMBAT suggestions. Two modes:
 *   - Per-character (`characterId` supplied): class-aware chips mixed with the
 *     character's own state (wounded, spent slots) and shared world context
 *     (active quest, known locations/NPCs). Each character in a multiplayer
 *     party gets unique, class-flavored chips.
 *   - Party-wide (`characterId` omitted): legacy heuristic — used by back-compat
 *     callers, error fallbacks, and old tests. Equivalent to the pre-multiplayer
 *     behavior.
 *
 * Order of precedence (per-character mode):
 *   1. wounded (< 50% HP) -> self-heal or potion, flavored by class
 *   2. caster whose spell slots are all spent -> rest
 *   3. class fantasy (scout/medicate/etc.)
 *   4. active quest objective -> pursue it
 *   5. known location/NPC -> travel / speak
 *   6. otherwise -> search the area (never empty)
 */
export function buildExplorationSuggestions(state: GameState, characterId?: string): string[] {
    if (!state) return [];
    if (!characterId) return buildExplorationSuggestionsLegacy(state);
    const character = (state.party || []).find(c => c.id === characterId);
    if (!character) return buildExplorationSuggestionsLegacy(state);

    const suggestions: string[] = [];
    const isWounded = !!character.hp && character.hp.current > 0
        && character.hp.current < (character.hp.max || 1) * 0.5;

    if (isWounded) {
        suggestions.push(SELF_HEALING_CLASSES.has(character.class.toLowerCase())
            ? 'Cast a healing spell on yourself'
            : 'Drink a healing potion');
    }
    if (isSpentCaster(character)) {
        suggestions.push('Rest to regain your spell slots');
    }

    const classFlavor = CLASS_EXPLORATION_SUGGESTIONS[character.class.toLowerCase()];
    if (classFlavor) {
        for (const s of classFlavor) {
            if (suggestions.length >= MAX_SUGGESTIONS) break;
            suggestions.push(s);
        }
    }

    // Subclass & resource-aware suggestions (gated by remaining capacity).
    if (suggestions.length < MAX_SUGGESTIONS) {
        if (character.class === 'monk' && character.level >= 2) {
            const ki = (character.resources || []).find(r => r.id === 'ki');
            if (ki && ki.current > 0) {
                suggestions.push('Use Flurry of Blows for extra strikes');
                if (suggestions.length < MAX_SUGGESTIONS) suggestions.push('Spend Ki on Patient Defense');
                if (suggestions.length < MAX_SUGGESTIONS) suggestions.push('Use Stunning Strike on the enemy');
            }
        }
        if (character.class === 'druid' && character.subclassId === 'circle-of-the-land') {
            const nr = (character.resources || []).find(r => r.id === 'natural-recovery');
            if (!nr || nr.current > 0) {
                suggestions.push('Use Natural Recovery to regain spell slots');
            }
        }
        if (character.class === 'warlock' && (character.invocations || []).includes('agonizing-blast')) {
            suggestions.push('Blast the enemy with Eldritch Blast + Agonizing Blast');
        }
        if (character.class === 'fighter' && character.level >= 2) {
            const as = (character.resources || []).find(r => r.id === 'action-surge');
            if (!as || as.current > 0) {
                suggestions.push('Use Action Surge for an extra action');
            }
        }
        if (character.class === 'rogue' && character.level >= 2) {
            const cu = (character.resources || []).find(r => r.id === 'cunning-action');
            if (cu) suggestions.push('Use Cunning Action to Dash, Disengage, or Hide');
        }
    }

    if (suggestions.length < MAX_SUGGESTIONS) {
        const activeQuest = (state.quests || []).find(q => q.status === 'active');
        if (activeQuest) suggestions.push(`Pursue: ${activeQuest.title}`);
    }
    if (suggestions.length < MAX_SUGGESTIONS) {
        const knownLocation = (state.lore || []).find(
            l => l.category === 'Location' && character.location && l.title !== character.location
        );
        if (knownLocation) suggestions.push(`Travel to ${knownLocation.title}`);
    }
    if (suggestions.length < MAX_SUGGESTIONS) {
        const knownNpc = (state.lore || []).find(l => l.category === 'NPC');
        if (knownNpc) suggestions.push(`Speak with ${knownNpc.title}`);
    }

    if (suggestions.length === 0) suggestions.push('Search the area');
    return normalizeSuggestions(suggestions).slice(0, MAX_SUGGESTIONS);
}

/**
 * Legacy party-wide NON-COMBAT generator. Used by back-compat callers (no
 * characterId) and by error-path fallbacks in `useGameActions`. Equivalent to
 * the pre-multiplayer heuristic.
 */
function buildExplorationSuggestionsLegacy(state: GameState): string[] {
    const suggestions: string[] = [];
    const aliveParty = (state.party || []).filter(c => c.hp && c.hp.current > 0);

    // 1. Wounded party member (< 50% HP).
    const wounded = aliveParty.filter(c => c.hp.current < (c.hp.max || 1) * 0.5);
    if (wounded.length > 0) suggestions.push('Take a short rest to recover');

    // 2. A caster whose spell slots are all spent. (Spell slots are identified by
    // id prefix, matching travelService / buildCharacterEnrichment — ResourcePool
    // has no `type` field.)
    const spentCaster = aliveParty.find(c => isSpentCaster(c));
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

/** Budget for the opt-in extra suggestions LLM call before falling through to the deterministic/generic tiers. */
const SUGGESTION_LLM_TIMEOUT_MS = 20_000;
/** Races a promise against a timeout; resolves to undefined if the budget is exceeded (mirrors withNarrationRetryTimeout). */
function withSuggestionsTimeout<T>(p: Promise<T>): Promise<T | undefined> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), SUGGESTION_LLM_TIMEOUT_MS); });
    return Promise.race([p.then(v => v, () => undefined), timeout]).finally(() => { if (timer) clearTimeout(timer); });
}

// ============================================================================
// Per-character suggestions (multiplayer + migrated solo)
// ============================================================================
// These functions replace the legacy single-suggestion-list model with a
// `Record<characterId, string[]>`. Each party member gets class-aware chips
// scoped to their own state. Solo play stores a single entry under the lone
// character's id, so there is one unified code path.
// ============================================================================

/**
 * Parses an LLM response body into a `Record<characterId, string[]>`.
 *
 * Tries strict JSON first. On failure, falls back to a tolerant regex pass
 * that salvages `"key": [...]` / `"key": "..."` pairs. Keys that match a
 * party member's NAME (case-insensitive) are remapped to that character's id,
 * so a model that responded with `{"Aldric": [...]}` is normalized to
 * `{"<aldricId>": [...]}`. Returns an empty record on any failure.
 */
function parseSuggestionMap(content: string, party: Character[]): Record<string, string[]> {
    if (!content) return {};
    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch {
        // Not valid JSON — try to salvage object-shape via regex. Captures
        // both array values (`"k": ["a","b"]`) and single-string values
        // (`"k": "a"`).
        const out: Record<string, string[]> = {};
        const objRe = /"([^"]{1,60})"\s*:\s*(\[[^\]]*\]|"[^"]+")/g;
        let m: RegExpExecArray | null;
        while ((m = objRe.exec(content)) !== null) {
            const key = m[1];
            const rawVal = m[2];
            const val = rawVal.startsWith('[')
                ? parseSuggestionArray(rawVal)
                : normalizeSuggestions([rawVal.replace(/^"|"$/g, '')]);
            if (val.length > 0) out[key] = val;
        }
        return remapKeysToIds(out, party);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const source = parsed as Record<string, unknown>;
    const out: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(source)) {
        const arr = Array.isArray(v) ? v : [v];
        const normalized = normalizeSuggestions(arr);
        if (normalized.length > 0) out[k] = normalized;
    }
    return remapKeysToIds(out, party);
}

/** Remaps any keys that match a party member's name (case-insensitive) to their id. */
function remapKeysToIds(in_: Record<string, string[]>, party: Character[]): Record<string, string[]> {
    if (party.length === 0) return in_;
    const out: Record<string, string[]> = {};
    const byNameLower = new Map<string, string>();
    for (const c of party) {
        if (c.name) byNameLower.set(c.name.toLowerCase(), c.id);
    }
    for (const [k, v] of Object.entries(in_)) {
        const mapped = byNameLower.get(k.toLowerCase());
        out[mapped ?? k] = v;
    }
    return out;
}

/**
 * One structured LLM call requesting per-character suggestions. Returns a
 * `Record<characterId, string[]>` keyed by id (with name→id remapping applied
 * to the model's output). The prompt lists every party member with their
 * class/level/HP/spell-slot state so the model can produce class-appropriate,
 * unique chips per character. Returns `{}` on any failure or non-object
 * response; never throws. Mirrors `generateSuggestions` (same endpoint,
 * temperature 0.9, content-only) but with a structured-output prompt.
 */
export const generateSuggestionsPerCharacter = async (
    history: Message[],
    context: string,
    party: Character[],
    frozenMessages?: { role: 'user' | 'system'; content: string }[],
    providerConfig?: { provider: LLMProvider; apiKey: string; apiBase?: string },
    sessionId?: string,
): Promise<Record<string, string[]>> => {
    const { apiKey: finalApiKey, model, apiUrl, apiHeaders } = resolveLLMConfig(providerConfig, sessionId);
    if (!finalApiKey) {
        if (isDebugMode) console.error('[Suggestions] generateSuggestionsPerCharacter: No API key');
        return {};
    }
    if (party.length === 0) return {};
    const partyRoster = party.map(c => {
        const slots = (c.resources || []).filter(r => r.id.startsWith('spell-slot-'));
        const slotSummary = slots.length > 0
            ? `, slots ${slots.filter(s => (s.current ?? 0) > 0).length}/${slots.length}`
            : '';
        const hp = c.hp ? `HP ${c.hp.current}/${c.hp.max}` : 'HP ?';
        return `- id="${c.id}" name="${c.name}" (${c.class} L${c.level}, ${hp}${slotSummary})`;
    }).join('\n');
    const messages = mapHistoryToMessages(history);
    const systemMessage = {
        role: 'system' as const,
        content:
            'You suggest the next 2-3 actions for EACH character in a fantasy RPG party, given the latest narration and game state. Each character must receive UNIQUE, class-appropriate actions in the FIRST PERSON from that character\'s perspective. Respond with ONLY a JSON object keyed by character id (use the exact id strings provided below), each value a JSON array of 2-3 short strings, max 60 characters each, no numbering, no markdown, no extra commentary. Respond in English. Example: {"char-1":["I smite the goblin with divine fury","Heal the wounded rogue"],"char-2":["I slip into shadows for a Sneak Attack","I disarm the trap"]}',
    };
    const contextMessage = {
        role: 'user' as const,
        content: `[Dungeon State Context: ${context}]\nPARTY ROSTER (key suggestions by the id= values):\n${partyRoster}`,
    };
    const payloadBase: Record<string, unknown> = {
        model,
        messages: [systemMessage, ...(frozenMessages || []), ...messages, contextMessage],
        temperature: 0.9,
    };
    if (sessionId) payloadBase.session_id = sessionId;
    if (isDebugMode) console.log('[Suggestions] generateSuggestionsPerCharacter request', { model, partySize: party.length, messageCount: (payloadBase.messages as unknown[]).length });
    const fetchController = new AbortController();
    const fetchTimer = setTimeout(() => fetchController.abort(new Error('generateSuggestionsPerCharacter timed out after 30s')), 30_000);
    try {
        const response = await fetch(apiUrl, { method: 'POST', headers: apiHeaders, body: JSON.stringify(payloadBase), signal: fetchController.signal });
        if (!response.ok) {
            const errMsg = `LLM request failed: ${response.status}`;
            throw new Error(errMsg);
        }
        const data = parseLlmResponse(await response.json());
        const msg = data.choices[0].message;
        const c = (typeof msg.content === 'string' && msg.content.trim()) ? msg.content : '';
        return parseSuggestionMap(c, party);
    } catch (error) {
        if (isDebugMode) console.error('[Suggestions] generateSuggestionsPerCharacter failed:', error instanceof Error ? error.message : String(error));
        return {};
    } finally {
        clearTimeout(fetchTimer);
    }
};

/**
 * Resolves per-character suggestions via the 4-tier fallback chain, returning
 * a `Record<characterId, string[]>` guaranteed to contain an entry for every
 * alive party member (so the tray is never blank for any player when the
 * feature is on).
 *
 *   Tier 0 — inline per-character suggestions captured by the agent loop
 *            (`turnSuggestionsByChar`, free; preferred when present for a char).
 *   Tier 1 — one structured LLM call (`generateSuggestionsPerCharacter`).
 *            Gated by `enableSuggestions`. Same cost as the legacy single call.
 *   Tier 2 — deterministic per-character generator (combat ->
 *            `buildCombatSuggestions(state, charId)`, else
 *            `buildExplorationSuggestions(state, charId)`). Zero LLM cost.
 *   Tier 3 — `GENERIC_SUGGESTIONS` cloned per character.
 *
 * When `enableSuggestions` is off, returns Tier 0 entries only (byte-identical
 * to the legacy feature-off behavior, but scoped per character).
 *
 * Solo: `party.length === 1` produces a single-entry record keyed by the lone
 * character's id — the migrated source of truth going forward.
 */
export async function resolveSuggestionsPerCharacter(
    state: GameState,
    history: Message[],
    context: string,
    frozen: { role: 'user' | 'system'; content: string }[] | undefined,
    turnSuggestionsByChar: Record<string, string[]> | undefined,
    enableSuggestions: boolean,
    sessionId: string | undefined,
): Promise<Record<string, string[]>> {
    const party = (state.party || []).filter(c => c.hp && c.hp.current > 0);
    const result: Record<string, string[]> = {};

    // Tier 0: inline per-character suggestions (always available, zero cost).
    if (turnSuggestionsByChar) {
        for (const c of party) {
            const t0 = normalizeSuggestions(turnSuggestionsByChar[c.id]);
            if (t0.length > 0) result[c.id] = t0;
        }
    }
    // Feature off -> Tier 0 only (mirrors the legacy feature-off contract).
    if (!enableSuggestions) {
        return fillMissingWithDeterministic(state, party, result);
    }

    // Identify characters still missing suggestions after Tier 0.
    const missingTier0 = party.filter(c => !result[c.id]);
    if (missingTier0.length === 0) return result;

    // Tier 1: one structured LLM call for all missing characters.
    const llmMap = await withSuggestionsTimeout(
        generateSuggestionsPerCharacter(history, context, missingTier0, frozen, undefined, sessionId)
    );
    if (llmMap) {
        for (const c of missingTier0) {
            const t1 = normalizeSuggestions(llmMap[c.id]);
            if (t1.length > 0) result[c.id] = t1;
        }
    }

    return fillMissingWithDeterministic(state, party, result);
}

/**
 * Fills any party members still missing suggestions with Tier 2 (deterministic
 * per-character generator) and Tier 3 (GENERIC_SUGGESTIONS) so every alive
 * member has an entry. Pure / synchronous.
 */
function fillMissingWithDeterministic(
    state: GameState,
    party: Character[],
    result: Record<string, string[]>,
): Record<string, string[]> {
    for (const c of party) {
        if (result[c.id] && result[c.id].length > 0) continue;
        // Tier 2: deterministic per-character.
        const det = state.combat?.isActive
            ? buildCombatSuggestions(state, c.id)
            : buildExplorationSuggestions(state, c.id);
        const t2 = normalizeSuggestions(det);
        if (t2.length > 0) { result[c.id] = t2; continue; }
        // Tier 3: generic fallback (defense-in-depth — Tier 2 always returns non-empty).
        result[c.id] = [...GENERIC_SUGGESTIONS];
    }
    return result;
}
