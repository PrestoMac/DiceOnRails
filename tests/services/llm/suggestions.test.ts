import { describe, it, expect, vi } from 'vitest';
import { makeCharacter } from '../../helpers/characters';
import { makeGameState } from '../../helpers/state';
import {
    normalizeSuggestions,
    buildExplorationSuggestions,
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
