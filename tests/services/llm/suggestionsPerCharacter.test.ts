import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeCharacter, makeWizard } from '../../helpers/characters';
import { makeGameState } from '../../helpers/state';
import {
    pickSuggestionsForCharacter,
    buildExplorationSuggestions,
    resolveSuggestionsPerCharacter,
    generateSuggestionsPerCharacter,
} from '../../../services/llm/suggestions';
import { buildCombatSuggestions } from '../../../services/mcp/combatService';
import type { GameState, Character } from '../../../types';

vi.mock('../../../utils/envHelper', () => {
    const getEnv = vi.fn<[string], string | undefined>();
    const getThinkingDisabledBody = vi.fn(() => undefined);
    return { getEnv, getThinkingDisabledBody };
});

vi.mock('../../../utils/debug', () => ({
    isDebugMode: false,
}));

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

function makeRogue(overrides: Partial<Character> = {}): Character {
    return makeCharacter({
        id: 'rogue-1',
        name: 'Vex',
        class: 'rogue',
        ...overrides,
    });
}

function makeCleric(overrides: Partial<Character> = {}): Character {
    return makeCharacter({
        id: 'cleric-1',
        name: 'Aldric',
        class: 'cleric',
        ...overrides,
    });
}

describe('pickSuggestionsForCharacter', () => {
    it('returns the per-character entry when present', () => {
        const s = makeGameState({
            lastSuggestionsByCharacter: { 'hero-1': ['A', 'B'] },
            lastSuggestions: ['legacy'],
        });
        expect(pickSuggestionsForCharacter(s, 'hero-1')).toEqual(['A', 'B']);
    });
    it('falls back to lastSuggestions when the per-character entry is absent', () => {
        const s = makeGameState({
            lastSuggestionsByCharacter: { 'other-char': ['X'] },
            lastSuggestions: ['legacy'],
        });
        expect(pickSuggestionsForCharacter(s, 'hero-1')).toEqual(['legacy']);
    });
    it('falls back to lastSuggestions when no characterId is supplied', () => {
        const s = makeGameState({ lastSuggestions: ['legacy'] });
        expect(pickSuggestionsForCharacter(s, undefined)).toEqual(['legacy']);
    });
    it('returns undefined when neither field has data', () => {
        const s = makeGameState({});
        expect(pickSuggestionsForCharacter(s, 'hero-1')).toBeUndefined();
    });
    it('ignores empty per-character arrays and falls through', () => {
        const s = makeGameState({
            lastSuggestionsByCharacter: { 'hero-1': [] },
            lastSuggestions: ['legacy'],
        });
        expect(pickSuggestionsForCharacter(s, 'hero-1')).toEqual(['legacy']);
    });
});

describe('buildExplorationSuggestions (per-character / class-aware)', () => {
    it('returns class-fantasy suggestions for a rogue', () => {
        const s = makeGameState({ party: [makeRogue()] });
        const out = buildExplorationSuggestions(s, 'rogue-1');
        expect(out.some(x => x.toLowerCase().includes('scout') || x.toLowerCase().includes('trap'))).toBe(true);
    });
    it('suggests self-heal for a wounded cleric (not "drink a potion")', () => {
        const s = makeGameState({ party: [makeCleric({ hp: { current: 2, max: 20 } })] });
        const out = buildExplorationSuggestions(s, 'cleric-1');
        expect(out).toContain('Cast a healing spell on yourself');
        expect(out).not.toContain('Drink a healing potion');
    });
    it('suggests a potion for a wounded rogue (no self-healing)', () => {
        const s = makeGameState({ party: [makeRogue({ hp: { current: 2, max: 20 } })] });
        const out = buildExplorationSuggestions(s, 'rogue-1');
        expect(out).toContain('Drink a healing potion');
    });
    it('suggests rest for a caster with all slots spent', () => {
        const s = makeGameState({
            party: [makeWizard({
                id: 'wiz-1',
                resources: [
                    { id: 'spell-slot-1', name: 'L1', current: 0, max: 4, resetOn: 'long', source: 'class', sourceId: 'wizard' },
                ],
            })],
        });
        const out = buildExplorationSuggestions(s, 'wiz-1');
        expect(out).toContain('Rest to regain your spell slots');
    });
    it('produces DIFFERENT suggestions for two characters of different classes', () => {
        const rogue = makeRogue();
        const cleric = makeCleric();
        const s = makeGameState({ party: [rogue, cleric] });
        const rogueOut = buildExplorationSuggestions(s, 'rogue-1');
        const clericOut = buildExplorationSuggestions(s, 'cleric-1');
        // They should differ in at least one entry.
        expect(rogueOut).not.toEqual(clericOut);
    });
    it('falls back to legacy party-wide logic when characterId is omitted', () => {
        const s = makeGameState({ party: [makeCharacter({ hp: { current: 2, max: 20 } })] });
        expect(buildExplorationSuggestions(s)).toContain('Take a short rest to recover');
    });
    it('falls back to legacy when the characterId is not found in the party', () => {
        const s = makeGameState({ party: [makeCharacter({ hp: { current: 2, max: 20 } })] });
        expect(buildExplorationSuggestions(s, 'nonexistent-id')).toContain('Take a short rest to recover');
    });
    it('never returns an empty array (always at least one fallback)', () => {
        const s = makeGameState({ party: [makeRogue()] });
        expect(buildExplorationSuggestions(s, 'rogue-1').length).toBeGreaterThan(0);
    });
    it('caps the result at 3', () => {
        const s = makeGameState({
            party: [makeRogue({ hp: { current: 2, max: 20 } })],
            quests: [{ id: 'q1', title: 'Quest', description: '', status: 'active' }],
            lore: [
                { id: 'l1', category: 'Location', title: 'Loc', content: '' },
                { id: 'n1', category: 'NPC', title: 'Npc', content: '' },
            ],
        });
        expect(buildExplorationSuggestions(s, 'rogue-1').length).toBeLessThanOrEqual(3);
    });
});

describe('buildCombatSuggestions (per-character / class-aware)', () => {
    function makeCombatState(party: Character[], enemies: { id: string; name: string }[] = [{ id: 'e1', name: 'Goblin' }]): GameState {
        return makeGameState({
            party,
            combat: {
                isActive: true, round: 1, turnIndex: 0, initiative: [],
                enemies: enemies.map(e => ({
                    id: e.id, name: e.name, ac: 12, hp: { current: 7, max: 7 }, attacks: [], isDead: false,
                })),
            } as unknown as GameState['combat'],
        });
    }
    it('produces a Sneak Attack chip for a rogue', () => {
        const s = makeCombatState([makeRogue()]);
        const out = buildCombatSuggestions(s, 'rogue-1');
        expect(out.some(x => /sneak attack/i.test(x))).toBe(true);
    });
    it('produces a Smite chip for a paladin', () => {
        const pal = makeCharacter({ id: 'pal-1', name: 'Percival', class: 'paladin' });
        const s = makeCombatState([pal]);
        const out = buildCombatSuggestions(s, 'pal-1');
        expect(out.some(x => /smite/i.test(x))).toBe(true);
    });
    it('suggests self-heal for a wounded cleric in combat', () => {
        const s = makeCombatState([makeCleric({ hp: { current: 2, max: 20 } })]);
        const out = buildCombatSuggestions(s, 'cleric-1');
        expect(out).toContain('Cast a healing spell on yourself');
    });
    it('suggests a potion for a wounded non-healer in combat', () => {
        const s = makeCombatState([makeRogue({ hp: { current: 2, max: 20 } })]);
        const out = buildCombatSuggestions(s, 'rogue-1');
        expect(out).toContain('Drink a healing potion');
    });
    it('suggests cantrip for an out-of-slots caster', () => {
        const s = makeCombatState([
            makeWizard({
                id: 'wiz-1',
                resources: [
                    { id: 'spell-slot-1', name: 'L1', current: 0, max: 4, resetOn: 'long', source: 'class', sourceId: 'wizard' },
                ],
            }),
        ]);
        const out = buildCombatSuggestions(s, 'wiz-1');
        expect(out).toContain('Cast a cantrip');
    });
    it('produces DIFFERENT combat chips for two different-class characters', () => {
        const s = makeCombatState([makeRogue(), makeCleric()]);
        const rogueOut = buildCombatSuggestions(s, 'rogue-1');
        const clericOut = buildCombatSuggestions(s, 'cleric-1');
        expect(rogueOut).not.toEqual(clericOut);
    });
    it('falls back to legacy logic when characterId is omitted', () => {
        const s = makeCombatState([makeCharacter({ name: 'Val', hp: { current: 2, max: 20 } })]);
        const out = buildCombatSuggestions(s);
        expect(out).toContain('Heal Val');
    });
    it('never returns empty during combat', () => {
        const s = makeCombatState([makeRogue()], []);
        const out = buildCombatSuggestions(s, 'rogue-1');
        expect(out.length).toBeGreaterThan(0);
        expect(out.length).toBeLessThanOrEqual(3);
    });
});

describe('generateSuggestionsPerCharacter (structured LLM call)', () => {
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

    it('parses a JSON object keyed by character id', async () => {
        mockFetch.mockResolvedValueOnce(makeSuggestionsResponse(
            JSON.stringify({ 'rogue-1': ['Hide', 'Sneak Attack'], 'cleric-1': ['Heal', 'Bless'] })
        ));
        const party = [makeRogue(), makeCleric()];
        const out = await generateSuggestionsPerCharacter([], 'ctx', party, undefined, undefined, 'sid');
        expect(out['rogue-1']).toEqual(['Hide', 'Sneak Attack']);
        expect(out['cleric-1']).toEqual(['Heal', 'Bless']);
    });
    it('remaps name-keyed responses to character ids', async () => {
        mockFetch.mockResolvedValueOnce(makeSuggestionsResponse(
            JSON.stringify({ 'Vex': ['Steal'], 'Aldric': ['Pray'] })
        ));
        const party = [makeRogue(), makeCleric()];
        const out = await generateSuggestionsPerCharacter([], 'ctx', party, undefined, undefined, 'sid');
        expect(out['rogue-1']).toEqual(['Steal']);
        expect(out['cleric-1']).toEqual(['Pray']);
    });
    it('returns {} when no API key is set', async () => {
        getEnv.mockImplementation(() => undefined);
        const out = await generateSuggestionsPerCharacter([], 'ctx', [makeRogue()], undefined, undefined, 'sid');
        expect(out).toEqual({});
        expect(mockFetch).not.toHaveBeenCalled();
    });
    it('returns {} for empty party', async () => {
        const out = await generateSuggestionsPerCharacter([], 'ctx', [], undefined, undefined, 'sid');
        expect(out).toEqual({});
        expect(mockFetch).not.toHaveBeenCalled();
    });
    it('returns {} on a non-ok response', async () => {
        mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({}) } as unknown as Response);
        const out = await generateSuggestionsPerCharacter([], 'ctx', [makeRogue()], undefined, undefined, 'sid');
        expect(out).toEqual({});
    });
    it('salvages object-shape via regex for non-JSON content', async () => {
        mockFetch.mockResolvedValueOnce(makeSuggestionsResponse(
            'Sure! {"rogue-1": ["Scout","Hide"]}'
        ));
        const out = await generateSuggestionsPerCharacter([], 'ctx', [makeRogue()], undefined, undefined, 'sid');
        expect(out['rogue-1']).toEqual(['Scout', 'Hide']);
    });
});

describe('resolveSuggestionsPerCharacter (4-tier per-char)', () => {
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

    it('Tier 0 wins per character (no LLM call)', async () => {
        const party = [makeRogue(), makeCleric()];
        const s = makeGameState({ party });
        const out = await resolveSuggestionsPerCharacter(
            s, [], 'ctx', undefined,
            { 'rogue-1': ['R1', 'R2'], 'cleric-1': ['C1'] },
            true, 'sid',
        );
        expect(out['rogue-1']).toEqual(['R1', 'R2']);
        expect(out['cleric-1']).toEqual(['C1']);
        expect(mockFetch).not.toHaveBeenCalled();
    });
    it('disabled feature -> Tier 0 only (no LLM call), missing chars get deterministic', async () => {
        const party = [makeRogue(), makeCleric()];
        const s = makeGameState({ party });
        const out = await resolveSuggestionsPerCharacter(
            s, [], 'ctx', undefined,
            { 'rogue-1': ['R1'] },  // cleric-1 has no Tier 0
            false, 'sid',
        );
        expect(out['rogue-1']).toEqual(['R1']);
        // Cleric fell through to Tier 2 deterministic (class-aware).
        expect(out['cleric-1'].length).toBeGreaterThan(0);
        expect(mockFetch).not.toHaveBeenCalled();
    });
    it('enabled + Tier 0 missing for one char -> LLM call fills it', async () => {
        const party = [makeRogue(), makeCleric()];
        const s = makeGameState({ party });
        mockFetch.mockResolvedValueOnce(makeSuggestionsResponse(
            JSON.stringify({ 'cleric-1': ['Pray', 'Bless'] })
        ));
        const out = await resolveSuggestionsPerCharacter(
            s, [], 'ctx', undefined,
            { 'rogue-1': ['R1'] },  // cleric-1 missing
            true, 'sid',
        );
        expect(out['rogue-1']).toEqual(['R1']);
        expect(out['cleric-1']).toEqual(['Pray', 'Bless']);
    });
    it('enabled + LLM returns nothing -> Tier 2 deterministic per character', async () => {
        const party = [makeRogue(), makeCleric()];
        const s = makeGameState({ party });
        mockFetch.mockResolvedValueOnce(makeSuggestionsResponse(''));
        const out = await resolveSuggestionsPerCharacter(s, [], 'ctx', undefined, undefined, true, 'sid');
        expect(out['rogue-1'].length).toBeGreaterThan(0);
        expect(out['cleric-1'].length).toBeGreaterThan(0);
        // Class-aware: rogue and cleric should differ.
        expect(out['rogue-1']).not.toEqual(out['cleric-1']);
    });
    it('guarantees an entry for every alive party member', async () => {
        getEnv.mockImplementation(() => undefined);
        const party = [makeRogue(), makeCleric(), makeWizard({ id: 'wiz-1' })];
        const s = makeGameState({ party });
        const out = await resolveSuggestionsPerCharacter(s, [], 'ctx', undefined, undefined, true, 'sid');
        expect(Object.keys(out).sort()).toEqual(['cleric-1', 'rogue-1', 'wiz-1']);
    });
    it('downed characters are excluded from the result', async () => {
        getEnv.mockImplementation(() => undefined);
        const alive = makeRogue();
        const downed = makeCleric({ hp: { current: 0, max: 20 } });
        const s = makeGameState({ party: [alive, downed] });
        const out = await resolveSuggestionsPerCharacter(s, [], 'ctx', undefined, undefined, true, 'sid');
        expect(out['rogue-1']).toBeDefined();
        expect(out['cleric-1']).toBeUndefined();
    });
    it('solo (party of 1) produces a single-entry record', async () => {
        getEnv.mockImplementation(() => undefined);
        const s = makeGameState({ party: [makeRogue()] });
        const out = await resolveSuggestionsPerCharacter(s, [], 'ctx', undefined, undefined, true, 'sid');
        expect(Object.keys(out)).toEqual(['rogue-1']);
    });
});
