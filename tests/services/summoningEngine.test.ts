import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Enemy } from '../../types';
import {
    createSummonedCreature,
    tickSummonedCreatures,
    getSummonedCreaturesForCaster,
} from '../../services/summoningEngine';

function buildSummonedCreature(overrides: Partial<Enemy> = {}): Enemy {
    return {
        id: 'summon-default',
        name: 'Default',
        hp: { current: 20, max: 20 },
        ac: 10,
        attacks: [],
        cr: 1,
        isDead: false,
        type: 'test',
        summonFields: { duration: 10, ownerId: 'caster-default' },
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('createSummonedCreature', () => {
    beforeEach(() => {
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
    });

    it('creates zombie with correct stats', () => {
        const creature = createSummonedCreature('zombie', 'caster-1', 5);
        expect(creature).not.toBeNull();
        expect(creature?.name).toBe('Zombie');
        expect(creature?.hp).toEqual({ current: 22, max: 22 });
        expect(creature?.ac).toBe(8);
        expect(creature?.cr).toBe(0.25);
        expect(creature?.summonFields?.duration).toBe(1440);
        expect(creature?.type).toBe('undead');
    });

    it('is case-insensitive', () => {
        const upper = createSummonedCreature('ZOMBIE', 'caster-1', 5);
        const mixed = createSummonedCreature('ZoMbIe', 'caster-2', 5);
        expect(upper).not.toBeNull();
        expect(mixed).not.toBeNull();
        expect(upper?.name).toBe('Zombie');
        expect(mixed?.name).toBe('Zombie');
    });

    it('creates giant-spider', () => {
        const creature = createSummonedCreature('giant-spider', 'caster-1', 5);
        expect(creature).not.toBeNull();
        expect(creature?.name).toBe('Giant Spider');
        expect(creature?.hp).toEqual({ current: 26, max: 26 });
        expect(creature?.ac).toBe(14);
        expect(creature?.cr).toBe(1);
        expect(creature?.summonFields?.duration).toBe(60);
        expect(creature?.type).toBe('beast');
    });

    it('returns null for invalid template', () => {
        const creature = createSummonedCreature('tarrasque', 'caster-1', 20);
        expect(creature).toBeNull();
    });

    it('sets ownerId to casterId', () => {
        const creature = createSummonedCreature('zombie', 'caster-xyz', 5);
        expect(creature).not.toBeNull();
        expect(creature?.summonFields?.ownerId).toBe('caster-xyz');
    });

    it('starts id with summon-', () => {
        const creature = createSummonedCreature('zombie', 'caster-1', 5);
        expect(creature).not.toBeNull();
        expect(creature?.id).toMatch(/^summon-/);
    });

    it('sets HP current equal to max', () => {
        const creature = createSummonedCreature('dire-wolf', 'caster-1', 7);
        expect(creature).not.toBeNull();
        expect(creature?.hp.current).toBe(creature?.hp.max);
    });

    it('sets duration from template', () => {
        const creature = createSummonedCreature('air-elemental', 'caster-1', 9);
        expect(creature).not.toBeNull();
        expect(creature?.summonFields?.duration).toBe(60);
    });

    it('sets type from template', () => {
        const creature = createSummonedCreature('skeleton', 'caster-1', 3);
        expect(creature).not.toBeNull();
        expect(creature?.type).toBe('undead');
    });

    it('copies attacks from template', () => {
        const creature = createSummonedCreature('skeleton', 'caster-1', 3);
        expect(creature).not.toBeNull();
        expect(creature?.attacks).toHaveLength(2);
        expect(creature?.attacks[0].name).toBe('Shortsword');
        expect(creature?.attacks[1].name).toBe('Shortbow');
    });
});

describe('tickSummonedCreatures', () => {
    it('decrements duration by 1', () => {
        const creatures = [buildSummonedCreature({ id: 's1', summonFields: { duration: 5, ownerId: 'caster-default' } })];
        tickSummonedCreatures(creatures);
        expect(creatures[0].summonFields?.duration).toBe(4);
    });

    it('removes creature when duration hits 0', () => {
        const creatures = [buildSummonedCreature({ id: 's1', summonFields: { duration: 1, ownerId: 'caster-default' } })];
        const result = tickSummonedCreatures(creatures);
        expect(result).toHaveLength(0);
    });

    it('removes dead creature (HP 0)', () => {
        const creatures = [buildSummonedCreature({ id: 's1', summonFields: { duration: 5, ownerId: 'caster-default' }, hp: { current: 0, max: 20 } })];
        const result = tickSummonedCreatures(creatures);
        expect(result).toHaveLength(0);
    });

    it('removes creature with negative HP', () => {
        const creatures = [buildSummonedCreature({ id: 's1', summonFields: { duration: 5, ownerId: 'caster-default' }, hp: { current: -3, max: 20 } })];
        const result = tickSummonedCreatures(creatures);
        expect(result).toHaveLength(0);
    });

    it('keeps alive and active creature', () => {
        const creatures = [buildSummonedCreature({ id: 's1', summonFields: { duration: 5, ownerId: 'caster-default' }, hp: { current: 15, max: 20 } })];
        const result = tickSummonedCreatures(creatures);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('s1');
    });

    it('handles empty array', () => {
        const result = tickSummonedCreatures([]);
        expect(result).toEqual([]);
    });

    it('multiple creatures, some expire', () => {
        const creatures = [
            buildSummonedCreature({ id: 's1', summonFields: { duration: 1, ownerId: 'caster-default' }, hp: { current: 10, max: 10 } }),
            buildSummonedCreature({ id: 's2', summonFields: { duration: 5, ownerId: 'caster-default' }, hp: { current: 10, max: 10 } }),
            buildSummonedCreature({ id: 's3', summonFields: { duration: 3, ownerId: 'caster-default' }, hp: { current: 0, max: 10 } }),
        ];
        const result = tickSummonedCreatures(creatures);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('s2');
    });
});

describe('getSummonedCreaturesForCaster', () => {
    it('returns only matching ownerId', () => {
        const creatures = [
            buildSummonedCreature({ id: 's1', summonFields: { duration: 10, ownerId: 'caster-a' }, hp: { current: 10, max: 10 } }),
            buildSummonedCreature({ id: 's2', summonFields: { duration: 10, ownerId: 'caster-b' }, hp: { current: 10, max: 10 } }),
            buildSummonedCreature({ id: 's3', summonFields: { duration: 10, ownerId: 'caster-a' }, hp: { current: 10, max: 10 } }),
        ];
        const result = getSummonedCreaturesForCaster(creatures, 'caster-a');
        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('s1');
        expect(result[1].id).toBe('s3');
    });

    it('excludes dead creatures', () => {
        const creatures = [
            buildSummonedCreature({ id: 's1', summonFields: { duration: 10, ownerId: 'caster-a' }, hp: { current: 0, max: 10 } }),
            buildSummonedCreature({ id: 's2', summonFields: { duration: 10, ownerId: 'caster-a' }, hp: { current: 10, max: 10 } }),
        ];
        const result = getSummonedCreaturesForCaster(creatures, 'caster-a');
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('s2');
    });

    it('returns empty array if none match', () => {
        const creatures = [
            buildSummonedCreature({ id: 's1', summonFields: { duration: 10, ownerId: 'caster-a' }, hp: { current: 10, max: 10 } }),
        ];
        const result = getSummonedCreaturesForCaster(creatures, 'caster-b');
        expect(result).toEqual([]);
    });

    it('handles empty array', () => {
        const result = getSummonedCreaturesForCaster([], 'caster-a');
        expect(result).toEqual([]);
    });
});
