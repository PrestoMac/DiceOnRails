import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeCharacter } from '../../helpers/characters';
import { makeGameState } from '../../helpers/state';
import {
    normalizeSuggestions,
    buildExplorationSuggestions,
    generateSuggestions,
    resolveSuggestions,
    GENERIC_SUGGESTIONS,
} from '../../../services/llm/suggestions';
import { buildCombatSuggestions } from '../../../services/mcp/combatService';

vi.mock('../../../utils/envHelper', () => {
    const getEnv = vi.fn<[string], string | undefined>();
    const getThinkingDisabledBody = vi.fn(() => undefined);
    return { getEnv, getThinkingDisabledBody };
});

vi.mock('../../../utils/debug', () => ({
    isDebugMode: false,
}));

// combatService (imported by suggestions via buildCombatSuggestions) pulls these in.
vi.mock('../../../utils/random', () => ({ cryptoRoll: vi.fn() }));
vi.mock('../../../services/supabaseClient', () => ({
    supabase: {
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                ilike: vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })) })),
            })),
        })),
    },
}));

const { getEnv } = await import('../../../utils/envHelper');

const mockFetch = vi.fn();

function makeSuggestionsResponse(content: string) {
    return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({
            choices: [{ message: { content, role: 'assistant' } }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
    } as unknown as Response;
}

describe('normalizeSuggestions', () => {
    it('filters non-strings and empties', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(normalizeSuggestions(['a', 3 as any, null as any, '', '   ', 'b'])).toEqual(['a', 'b']);
    });
    it('clamps each entry to 80 chars', () => {
        const long = 'x'.repeat(120);
        expect(normalizeSuggestions([long])[0]).toHaveLength(80);
    });
    it('caps the result at 3', () => {
        expect(normalizeSuggestions(['a', 'b', 'c', 'd', 'e'])).toHaveLength(3);
    });
    it('returns [] for non-array input', () => {
        expect(normalizeSuggestions(undefined)).toEqual([]);
        expect(normalizeSuggestions('not an array')).toEqual([]);
    });
});

describe('GENERIC_SUGGESTIONS', () => {
    it('is a non-empty array of at most 3', () => {
        expect(GENERIC_SUGGESTIONS.length).toBeGreaterThan(0);
        expect(GENERIC_SUGGESTIONS.length).toBeLessThanOrEqual(3);
    });
});

describe('buildExplorationSuggestions', () => {
    it('wounded party member -> rest', () => {
        const s = makeGameState({ party: [makeCharacter({ hp: { current: 2, max: 20 } })] });
        expect(buildExplorationSuggestions(s)).toContain('Take a short rest to recover');
    });
    it('spent caster -> rest to regain slots', () => {
        const s = makeGameState({
            party: [makeCharacter({
                class: 'wizard', level: 3,
                resources: [{ id: 'spell-slot-1', name: 'L1', current: 0, max: 4, resetOn: 'long', source: 'class', sourceId: 'wizard' }],
            })],
        });
        const out = buildExplorationSuggestions(s);
        expect(out[0]).toBe('Rest to regain spell slots');
    });
    it('active quest -> pursue', () => {
        const s = makeGameState({
            party: [makeCharacter()],
            quests: [{ id: 'q1', title: 'Find the Lost Crown', description: '', status: 'active' }],
        });
        expect(buildExplorationSuggestions(s)).toContain('Pursue: Find the Lost Crown');
    });
    it('known location != current -> travel', () => {
        const s = makeGameState({
            party: [makeCharacter()],
            lore: [{ id: 'l1', category: 'Location', title: 'Dark Tower', content: '' }],
        });
        expect(buildExplorationSuggestions(s)).toContain('Travel to Dark Tower');
    });
    it('known NPC -> speak', () => {
        const s = makeGameState({
            party: [makeCharacter()],
            lore: [{ id: 'n1', category: 'NPC', title: 'Innkeeper Bob', content: '' }],
        });
        expect(buildExplorationSuggestions(s)).toContain('Speak with Innkeeper Bob');
    });
    it('nothing applies -> search the area (never empty)', () => {
        const s = makeGameState({ party: [makeCharacter()] });
        expect(buildExplorationSuggestions(s)).toEqual(['Search the area']);
    });
    it('caps the result at 3', () => {
        const s = makeGameState({
            party: [makeCharacter({ hp: { current: 2, max: 20 } })],
            quests: [{ id: 'q1', title: 'Q1', description: '', status: 'active' }],
            lore: [
                { id: 'l1', category: 'Location', title: 'Loc', content: '' },
                { id: 'n1', category: 'NPC', title: 'Npc', content: '' },
            ],
        });
        expect(buildExplorationSuggestions(s).length).toBeLessThanOrEqual(3);
    });
});

describe('generateSuggestions', () => {
    beforeEach(() => {
        mockFetch.mockReset();
        getEnv.mockReset();
        getEnv.mockImplementation((key: string) => {
            if (key === 'VITE_LLM_API_KEY') return 'test-api-key';
            if (key === 'VITE_LLM_MODEL') return 'deepseek/deepseek-v4-flash';
            return undefined;
        });
        vi.stubGlobal('fetch', mockFetch);
    });
    afterEach(() => { vi.unstubAllGlobals(); });

    it('parses a JSON array from content', async () => {
        mockFetch.mockResolvedValueOnce(makeSuggestionsResponse('["Ask the guard","Open the chest","Leave the room"]'));
        const out = await generateSuggestions([], 'ctx', undefined, undefined, 'sid');
        expect(out).toEqual(['Ask the guard', 'Open the chest', 'Leave the room']);
    });
    it('returns [] and skips fetch when no API key', async () => {
        getEnv.mockImplementation(() => undefined);
        const out = await generateSuggestions([], 'ctx');
        expect(out).toEqual([]);
        expect(mockFetch).not.toHaveBeenCalled();
    });
    it('returns [] on a non-ok response', async () => {
        mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({}) } as unknown as Response);
        const out = await generateSuggestions([], 'ctx', undefined, undefined, 'sid');
        expect(out).toEqual([]);
    });
    it('falls back to quoted-string extraction for non-JSON content', async () => {
        mockFetch.mockResolvedValueOnce(makeSuggestionsResponse('Sure! ["Look around","Search the chest"]'));
        const out = await generateSuggestions([], 'ctx', undefined, undefined, 'sid');
        expect(out).toEqual(['Look around', 'Search the chest']);
    });
    it('clamps and caps the results', async () => {
        const long = 'y'.repeat(120);
        mockFetch.mockResolvedValueOnce(makeSuggestionsResponse(JSON.stringify([long, 'a', 'b', 'c', 'd'])));
        const out = await generateSuggestions([], 'ctx', undefined, undefined, 'sid');
        expect(out).toHaveLength(3);
        expect(out[0]).toHaveLength(80);
    });
});

describe('resolveSuggestions (tier chain)', () => {
    beforeEach(() => {
        mockFetch.mockReset();
        getEnv.mockReset();
        getEnv.mockImplementation((key: string) => {
            if (key === 'VITE_LLM_API_KEY') return 'test-api-key';
            if (key === 'VITE_LLM_MODEL') return 'deepseek/deepseek-v4-flash';
            return undefined;
        });
        vi.stubGlobal('fetch', mockFetch);
    });
    afterEach(() => { vi.unstubAllGlobals(); });

    it('Tier 0 wins and makes no LLM call', async () => {
        const out = await resolveSuggestions(makeGameState(), [], 'ctx', undefined, ['Attack'], true, 'sid');
        expect(out).toEqual(['Attack']);
        expect(mockFetch).not.toHaveBeenCalled();
    });
    it('disabled + empty Tier 0 -> [] and no LLM call (byte-identical)', async () => {
        const out = await resolveSuggestions(makeGameState(), [], 'ctx', undefined, [], false, 'sid');
        expect(out).toEqual([]);
        expect(mockFetch).not.toHaveBeenCalled();
    });
    it('disabled + non-empty Tier 0 -> returns Tier 0', async () => {
        const out = await resolveSuggestions(makeGameState(), [], 'ctx', undefined, ['Look'], false, 'sid');
        expect(out).toEqual(['Look']);
        expect(mockFetch).not.toHaveBeenCalled();
    });
    it('enabled + empty Tier 0 -> Tier 1 LLM call wins', async () => {
        mockFetch.mockResolvedValueOnce(makeSuggestionsResponse('["Flee","Hide"]'));
        const out = await resolveSuggestions(makeGameState(), [], 'ctx', undefined, [], true, 'sid');
        expect(out).toEqual(['Flee', 'Hide']);
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });
    it('enabled + LLM returns nothing -> falls to Tier 2 deterministic', async () => {
        mockFetch.mockResolvedValueOnce(makeSuggestionsResponse(''));
        const s = makeGameState({ party: [makeCharacter({ hp: { current: 2, max: 20 } })] });
        const out = await resolveSuggestions(s, [], 'ctx', undefined, [], true, 'sid');
        expect(out).toContain('Take a short rest to recover');
    });
    it('enabled + LLM call unavailable (no key) -> falls to Tier 2 deterministic', async () => {
        getEnv.mockImplementation(() => undefined);
        const s = makeGameState({ quests: [{ id: 'q', title: 'Slay Dragon', description: '', status: 'active' }] });
        const out = await resolveSuggestions(s, [], 'ctx', undefined, [], true, 'sid');
        expect(out).toContain('Pursue: Slay Dragon');
    });
});

describe('buildCombatSuggestions (hardened)', () => {
    it('never returns empty during active combat, even with no enemies/casters/wounded', () => {
        const s = makeGameState({
            party: [makeCharacter()],
            combat: { isActive: true, round: 1, turnIndex: 0, initiative: [], enemies: [] },
        });
        const out = buildCombatSuggestions(s);
        expect(out.length).toBeGreaterThan(0);
        expect(out.length).toBeLessThanOrEqual(3);
    });
    it('suggests heal + attack when wounded and enemies present', () => {
        const s = makeGameState({
            party: [makeCharacter({ name: 'Val', hp: { current: 2, max: 20 } })],
            combat: {
                isActive: true, round: 1, turnIndex: 0, initiative: [],
                enemies: [{ id: 'e1', name: 'Goblin', ac: 12, hp: { current: 7, max: 7 }, attacks: [], isDead: false }],
            },
        });
        const out = buildCombatSuggestions(s);
        expect(out).toContain('Heal Val');
        expect(out.some(x => x.startsWith('Attack the'))).toBe(true);
    });
    it('suggests casting when a party member has spell slots remaining', () => {
        const s = makeGameState({
            party: [makeCharacter({
                name: 'Magus',
                resources: [{ id: 'spell-slot-1', name: 'L1', current: 2, max: 4, resetOn: 'long', source: 'class', sourceId: 'wizard' }],
            })],
            combat: {
                isActive: true, round: 1, turnIndex: 0, initiative: [],
                enemies: [{ id: 'e1', name: 'Goblin', ac: 12, hp: { current: 7, max: 7 }, attacks: [], isDead: false }],
            },
        });
        const out = buildCombatSuggestions(s);
        expect(out).toContain('Cast a spell with Magus');
    });
});
