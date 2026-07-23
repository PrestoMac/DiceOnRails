import { describe, it, expect, beforeEach } from 'vitest';
import { deepClone } from '../../utils/clone';
import {
    applyCondition,
    removeCondition,
    tickConditions,
    tickConditionsByTime,
    tickConditionsByRounds,
    hasCondition,
    getConditionEffects,
    rollSaveAgainstCondition,
    isIncapsulated,
    isUnconscious,
} from '../../services/conditionEngine';
import { Character, Enemy, ActiveCondition } from '../../types';

function makeCharacter(overrides: Partial<Character> = {}): Character {
    return {
        id: 'test-char',
        name: 'Test Character',
        class: 'wizard',
        level: 5,
        race: 'human',
        stats: { str: 10, dex: 14, con: 12, int: 18, wis: 13, cha: 10 },
        hp: { current: 30, max: 30 },
        ac: 15,
        speed: 30,
        inventory: [],
        currency: { gp: 0, sp: 0, cp: 0 },
        location: 'test',
        experience: 0,
        experienceToNextLevel: 100,
        unusedStatPoints: 0,
        maxHpBonus: 0,
        hitDice: { current: 5, max: 5 },
        ...overrides,
    };
}

function makeEnemy(overrides: Partial<Enemy> = {}): Enemy {
    return {
        id: 'test-enemy',
        name: 'Test Enemy',
        hp: { current: 20, max: 20 },
        ac: 13,
        stats: { str: 14, dex: 12, con: 13, int: 6, wis: 10, cha: 8 },
        attacks: [],
        isDead: false,
        conditions: [],
        ...overrides,
    };
}

describe('conditionEngine', () => {
    describe('applyCondition', () => {
        it('applies a condition to a character', () => {
            const char = makeCharacter();
            const result = applyCondition(char, {
                id: 'blinded',
                source: 'faerie-fire',
                duration: 10,
            });
            expect(result).toBe(true);
            expect(char.conditions).toHaveLength(1);
            expect(char.conditions).toBeDefined();
            expect(char.conditions[0].id).toBe('blinded');
        });

        it('checks enemy condition immunities', () => {
            const enemy = makeEnemy({ conditionsImmunities: ['poisoned'] });
            const result = applyCondition(enemy, {
                id: 'poisoned',
                source: 'poison-spray',
                duration: 5,
            });
            expect(result).toBe(false);
            expect(enemy.conditions).toHaveLength(0);
        });

        it('checks immunity prefix match: exhaustion blocks exhaustion-3', () => {
            const enemy = makeEnemy({ conditionsImmunities: ['exhaustion'] });
            const result = applyCondition(enemy, {
                id: 'exhaustion-3',
                source: 'fatigue',
                duration: Infinity,
            });
            expect(result).toBe(false);
            expect(enemy.conditions).toHaveLength(0);
        });

        it('does not block charmed when immunity list has charm', () => {
            const enemy = makeEnemy({ conditionsImmunities: ['charm'] });
            const result = applyCondition(enemy, {
                id: 'charmed',
                source: 'charm-person',
                duration: 10,
            });
            expect(result).toBe(true);
            expect(enemy.conditions).toHaveLength(1);
            expect(enemy.conditions[0].id).toBe('charmed');
        });

        it('refreshes duration on duplicate (same id + source)', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'blinded', source: 'faerie-fire', duration: 5 });
            applyCondition(char, { id: 'blinded', source: 'faerie-fire', duration: 10 });
            expect(char.conditions).toHaveLength(1);
            expect(char.conditions).toBeDefined();
            expect(char.conditions[0].duration).toBe(10);
        });

        it('allows same condition from different sources', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'charmed', source: 'charm-person', duration: 10 });
            applyCondition(char, { id: 'charmed', source: 'suggestion', duration: 10 });
            expect(char.conditions).toHaveLength(2);
        });
    });

    describe('removeCondition', () => {
        it('removes a condition by ID', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'blinded', source: 'faerie-fire', duration: 10 });
            const removed = removeCondition(char, 'blinded');
            expect(removed).toBe(true);
            expect(char.conditions).toHaveLength(0);
        });

        it('removes only matching source when source specified', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'charmed', source: 'charm-person', duration: 10 });
            applyCondition(char, { id: 'charmed', source: 'suggestion', duration: 10 });
            removeCondition(char, 'charmed', 'charm-person');
            expect(char.conditions).toHaveLength(1);
            expect(char.conditions).toBeDefined();
            expect(char.conditions[0].source).toBe('suggestion');
        });
    });

    describe('tickConditions', () => {
        it('decrements duration each round', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'blinded', source: 'faerie-fire', duration: 3 });
            tickConditions(char);
            expect(char.conditions).toBeDefined();
            expect(char.conditions[0].duration).toBe(2);
        });

        it('removes expired conditions', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'blinded', source: 'faerie-fire', duration: 1 });
            const expired = tickConditions(char);
            expect(expired).toContain('blinded');
            expect(char.conditions).toHaveLength(0);
        });

        it('keeps permanent conditions (duration = 0 passed as null-like)', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'mage-armor-ac', source: 'mage-armor', duration: Infinity as unknown as number });
            tickConditions(char);
            expect(char.conditions).toHaveLength(1);
        });

        it('calls onRemove RemoveEffect when expired', () => {
            const char = makeCharacter();
            char.acBonus = 2;
            applyCondition(char, { id: 'shield-ac', source: 'shield', duration: 1, onRemove: { kind: 'acBonus', value: 2 } });
            tickConditions(char);
            expect(char.acBonus).toBe(0);
        });
    });

    describe('hasCondition', () => {
        it('returns true when condition exists', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'blinded', source: 'test', duration: 5 });
            expect(hasCondition(char, 'blinded')).toBe(true);
        });

        it('returns false when condition does not exist', () => {
            const char = makeCharacter();
            expect(hasCondition(char, 'blinded')).toBe(false);
        });
    });

    describe('getConditionEffects', () => {
        it('returns correct effects for blinded', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'blinded', source: 'test', duration: 5 });
            const effects = getConditionEffects(char);
            expect(effects.isBlinded).toBe(true);
            expect(effects.disadvantageOnAttacks).toBe(true);
            expect(effects.attacksAgainstHaveAdvantage).toBe(true);
        });

        it('returns correct effects for unconscious', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'unconscious', source: 'sleep', duration: 10 });
            const effects = getConditionEffects(char);
            expect(effects.isUnconscious).toBe(true);
            expect(effects.speedModifier).toBe(0);
            expect(effects.disadvantageOnAttacks).toBe(true);
            expect(effects.attacksAgainstHaveAdvantage).toBe(true);
        });

        it('combines multiple conditions', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'blinded', source: 'test', duration: 5 });
            applyCondition(char, { id: 'poisoned', source: 'test', duration: 5 });
            const effects = getConditionEffects(char);
            expect(effects.isBlinded).toBe(true);
            expect(effects.isPoisoned).toBe(true);
            expect(effects.disadvantageOnAttacks).toBe(true);
        });

        it('returns no effects for clean character', () => {
            const char = makeCharacter();
            const effects = getConditionEffects(char);
            expect(effects.isBlinded).toBe(false);
            expect(effects.isUnconscious).toBe(false);
            expect(effects.disadvantageOnAttacks).toBe(false);
            expect(effects.attacksAgainstHaveAdvantage).toBe(false);
            expect(effects.advantageOnAttacks).toBe(false);
            expect(effects.speedModifier).toBe(1);
        });

        it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('exhaustion level %i: returns d20Modifier -%i and speedPenaltyFt -%ift', (level) => {
            const char = makeCharacter();
            applyCondition(char, { id: `exhaustion-${level}`, source: 'fatigue', duration: Infinity, durationUnit: 'minute' });
            const effects = getConditionEffects(char);
            expect(effects.d20Modifier).toBe(-level);
            expect(effects.speedPenaltyFt).toBe(-(level * 5));
        });

        it('combines blinded with exhaustion-3', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'blinded', source: 'test', duration: 5 });
            applyCondition(char, { id: 'exhaustion-3', source: 'fatigue', duration: Infinity, durationUnit: 'minute' });
            const effects = getConditionEffects(char);
            expect(effects.isBlinded).toBe(true);
            expect(effects.disadvantageOnAttacks).toBe(true);
            expect(effects.attacksAgainstHaveAdvantage).toBe(true);
            expect(effects.d20Modifier).toBe(-3);
            expect(effects.speedPenaltyFt).toBe(-15);
        });
    });

    describe('rollSaveAgainstCondition', () => {
        it('returns failed save when no saveEnd defined', () => {
            const char = makeCharacter();
            const cond: ActiveCondition = { id: 'blinded', source: 'test', duration: 5 };
            const result = rollSaveAgainstCondition(char, cond, 15);
            expect(result.succeeded).toBe(false);
        });

        it('rolls a save with correct modifier', () => {
            const char = makeCharacter({ stats: { str: 10, dex: 14, con: 12, int: 18, wis: 13, cha: 10 } });
            const cond: ActiveCondition = { id: 'paralyzed', source: 'hold-person', duration: 10, saveEnd: 'wis', saveDC: 15 };
            const result = rollSaveAgainstCondition(char, cond, 15);
            expect(result.roll).toBeGreaterThanOrEqual(1);
            expect(result.roll).toBeLessThanOrEqual(20);
            expect(result.total).toBe(result.roll + 1);
        });
    });

    describe('isIncapsulated', () => {
        it('returns true for incapacitated', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'incapacitated', source: 'test', duration: 5 });
            expect(isIncapsulated(char)).toBe(true);
        });

        it('returns true for paralyzed', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'paralyzed', source: 'test', duration: 5 });
            expect(isIncapsulated(char)).toBe(true);
        });

        it('returns true for stunned', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'stunned', source: 'test', duration: 5 });
            expect(isIncapsulated(char)).toBe(true);
        });

        it('returns false for blinded', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'blinded', source: 'test', duration: 5 });
            expect(isIncapsulated(char)).toBe(false);
        });
    });

    describe('isUnconscious', () => {
        it('returns true when unconscious', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'unconscious', source: 'sleep', duration: 10 });
            expect(isUnconscious(char)).toBe(true);
        });

        it('returns false when not unconscious', () => {
            const char = makeCharacter();
            expect(isUnconscious(char)).toBe(false);
        });
    });

    describe('RemoveEffect data model', () => {
        let char: Character;

        beforeEach(() => {
            char = makeCharacter();
        });

        it('tickConditions handles RemoveEffect acBonus removal', () => {
            char.acBonus = 5;
            applyCondition(char, {
                id: 'shield-ac',
                source: 'shield',
                duration: 1,
                onRemove: { kind: 'acBonus', value: 5 },
            });

            expect(char.conditions).toHaveLength(1);
            const cond = char.conditions[0];

            const roundTripped = deepClone(cond);
            expect(roundTripped.onRemove).toEqual({ kind: 'acBonus', value: 5 });

            tickConditions(char);

            expect(char.conditions).toHaveLength(0);
            expect(char.acBonus).toBe(0);
        });

        it('tickConditions backward compatible with onRemove RemoveEffect', () => {
            char.acBonus = 5;
            applyCondition(char, {
                id: 'test-cond',
                source: 'test',
                duration: 1,
                onRemove: { kind: 'acBonus', value: 5 },
            });

            tickConditions(char);

            expect(char.acBonus).toBe(0);
            expect(char.conditions).toHaveLength(0);
        });

        it('removeCondition calls onRemove for RemoveEffect before removal', () => {
            char.acBonus = 3;
            applyCondition(char, {
                id: 'mage-armor-ac',
                source: 'mage-armor',
                duration: Infinity,
                onRemove: { kind: 'acBonus', value: 3 },
            });

            expect(char.acBonus).toBe(3);
            expect(char.conditions).toHaveLength(1);

            removeCondition(char, 'mage-armor-ac', 'mage-armor');

            expect(char.conditions).toHaveLength(0);
            expect(char.acBonus).toBe(0);
        });

        it('removeCondition calls onRemove RemoveEffect before removal', () => {
            char.acBonus = 5;
            applyCondition(char, {
                id: 'test-cond',
                source: 'test',
                duration: Infinity,
                onRemove: { kind: 'acBonus', value: 5 },
            });

            removeCondition(char, 'test-cond', 'test');

            expect(char.acBonus).toBe(0);
            expect(char.conditions).toHaveLength(0);
        });

        it('removeCondition does not throw when onRemove is undefined', () => {
            applyCondition(char, {
                id: 'simple-cond',
                source: 'test',
                duration: Infinity,
            });

            expect(() => removeCondition(char, 'simple-cond', 'test')).not.toThrow();
            expect(char.conditions).toHaveLength(0);
        });
    });

    describe('tickConditionsByTime', () => {
        it('decrements minute-based conditions by minutes', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'blessed', source: 'bless', duration: 10, durationUnit: 'minute' });
            tickConditionsByTime(char, 3);
            expect(char.conditions).toHaveLength(1);
            expect(char.conditions[0].duration).toBe(7);
        });

        it('skips round-based conditions', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'blinded', source: 'faerie-fire', duration: 5, durationUnit: 'round' });
            tickConditionsByTime(char, 3);
            expect(char.conditions).toHaveLength(1);
            expect(char.conditions[0].duration).toBe(5);
        });

        it('skips legacy conditions with undefined durationUnit', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'old-cond', source: 'test', duration: 5 });
            tickConditionsByTime(char, 3);
            expect(char.conditions).toHaveLength(1);
            expect(char.conditions[0].duration).toBe(5);
        });

        it('expires condition when duration reaches zero', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'haste', source: 'haste-spell', duration: 2, durationUnit: 'minute' });
            const expired = tickConditionsByTime(char, 2);
            expect(expired).toContain('haste');
            expect(char.conditions).toHaveLength(0);
        });

        it('expires condition when duration goes negative', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'haste', source: 'haste-spell', duration: 1, durationUnit: 'minute' });
            const expired = tickConditionsByTime(char, 5);
            expect(expired).toContain('haste');
            expect(char.conditions).toHaveLength(0);
        });

        it('calls onRemove RemoveEffect when expired (minutes)', () => {
            const char = makeCharacter();
            char.acBonus = 5;
            applyCondition(char, { id: 'shield-ac', source: 'shield', duration: 1, durationUnit: 'minute', onRemove: { kind: 'acBonus', value: 5 } });
            tickConditionsByTime(char, 1);
            expect(char.acBonus).toBe(0);
            expect(char.conditions).toHaveLength(0);
        });

        it('calls onRemove RemoveEffect (acBonus) when expired', () => {
            const char = makeCharacter();
            char.acBonus = 5;
            applyCondition(char, {
                id: 'shield-ac', source: 'shield', duration: 1, durationUnit: 'minute',
                onRemove: { kind: 'acBonus', value: 5 },
            });
            tickConditionsByTime(char, 1);
            expect(char.acBonus).toBe(0);
            expect(char.conditions).toHaveLength(0);
        });

        it('handles permanent conditions (Infinity duration)', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'exhaustion-1', source: 'fatigue', duration: Infinity, durationUnit: 'minute' });
            tickConditionsByTime(char, 100);
            expect(char.conditions).toHaveLength(1);
            expect(char.conditions[0].duration).toBe(Infinity);
        });

        it('returns array of expired condition IDs', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'blessed', source: 'bless', duration: 1, durationUnit: 'minute' });
            applyCondition(char, { id: 'inspired', source: 'bardic', duration: 5, durationUnit: 'minute' });
            const expired = tickConditionsByTime(char, 1);
            expect(expired).toContain('blessed');
            expect(expired).not.toContain('inspired');
            expect(char.conditions).toHaveLength(1);
        });

        it('handles empty conditions array', () => {
            const char = makeCharacter();
            char.conditions = [];
            const expired = tickConditionsByTime(char, 5);
            expect(expired).toHaveLength(0);
        });

        it('handles undefined conditions', () => {
            const char = makeCharacter();
            delete char.conditions;
            const expired = tickConditionsByTime(char, 5);
            expect(expired).toHaveLength(0);
        });
    });

    describe('tickConditionsByRounds', () => {
        it('decrements round-based conditions by rounds', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'blinded', source: 'faerie-fire', duration: 10, durationUnit: 'round' });
            tickConditionsByRounds(char, 3);
            expect(char.conditions).toHaveLength(1);
            expect(char.conditions[0].duration).toBe(7);
        });

        it('skips minute-based conditions', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'blessed', source: 'bless', duration: 10, durationUnit: 'minute' });
            tickConditionsByRounds(char, 5);
            expect(char.conditions).toHaveLength(1);
            expect(char.conditions[0].duration).toBe(10);
        });

        it('expires round-based condition when duration reaches zero', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'blinded', source: 'faerie-fire', duration: 3, durationUnit: 'round' });
            const expired = tickConditionsByRounds(char, 3);
            expect(expired).toContain('blinded');
            expect(char.conditions).toHaveLength(0);
        });

        it('expires round-based condition when duration goes negative', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'blinded', source: 'faerie-fire', duration: 2, durationUnit: 'round' });
            const expired = tickConditionsByRounds(char, 5);
            expect(expired).toContain('blinded');
            expect(char.conditions).toHaveLength(0);
        });

        it('handles legacy conditions (undefined durationUnit) as round-based', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'old-cond', source: 'test', duration: 5 });
            tickConditionsByRounds(char, 2);
            expect(char.conditions).toHaveLength(1);
            expect(char.conditions[0].duration).toBe(3);
        });

        it('calls onRemove RemoveEffect when expired (rounds)', () => {
            const char = makeCharacter();
            char.acBonus = 3;
            applyCondition(char, { id: 'test-cond', source: 'test', duration: 1, durationUnit: 'round', onRemove: { kind: 'acBonus', value: 3 } });
            tickConditionsByRounds(char, 1);
            expect(char.acBonus).toBe(0);
            expect(char.conditions).toHaveLength(0);
        });

        it('returns empty array when rounds is zero or negative', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'blinded', source: 'test', duration: 5, durationUnit: 'round' });
            const expired = tickConditionsByRounds(char, 0);
            expect(expired).toHaveLength(0);
            expect(char.conditions).toHaveLength(1);
        });

        it('handles empty conditions', () => {
            const char = makeCharacter();
            char.conditions = [];
            const expired = tickConditionsByRounds(char, 5);
            expect(expired).toHaveLength(0);
        });
    });

    describe('tickConditions (round-based) skips minute-based', () => {
        it('does not decrement minute-based conditions', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'blessed', source: 'bless', duration: 10, durationUnit: 'minute' });
            tickConditions(char);
            expect(char.conditions).toHaveLength(1);
            expect(char.conditions[0].duration).toBe(10);
        });

        it('does decrement round-based conditions', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'blinded', source: 'faerie-fire', duration: 3, durationUnit: 'round' });
            tickConditions(char);
            expect(char.conditions).toHaveLength(1);
            expect(char.conditions[0].duration).toBe(2);
        });

        it('does decrement legacy conditions (undefined unit)', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'old-cond', source: 'test', duration: 3 });
            tickConditions(char);
            expect(char.conditions).toHaveLength(1);
            expect(char.conditions[0].duration).toBe(2);
        });
    });

    describe('permanent duration unit', () => {
        it('tickConditions skips permanent-unit conditions', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'exhaustion-1', source: 'fatigue', duration: -1, durationUnit: 'permanent' });
            const expired = tickConditions(char);
            expect(expired).toHaveLength(0);
            expect(char.conditions).toHaveLength(1);
            expect(char.conditions[0].duration).toBe(-1);
        });

        it('tickConditionsByTime skips permanent-unit conditions', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'exhaustion-2', source: 'fatigue', duration: -1, durationUnit: 'permanent' });
            applyCondition(char, { id: 'mage-armor-ac', source: 'mage-armor', duration: 480, durationUnit: 'minute' });
            const expired = tickConditionsByTime(char, 480);
            expect(expired).toContain('mage-armor-ac');
            expect(expired).not.toContain('exhaustion-2');
            const remaining = (char.conditions ?? []).map(c => c.id);
            expect(remaining).toContain('exhaustion-2');
            expect(remaining).not.toContain('mage-armor-ac');
        });

        it('tickConditionsByRounds skips permanent-unit conditions', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'exhaustion-3', source: 'fatigue', duration: -1, durationUnit: 'permanent' });
            applyCondition(char, { id: 'blinded', source: 'test', duration: 2, durationUnit: 'round' });
            const expired = tickConditionsByRounds(char, 5);
            expect(expired).toContain('blinded');
            expect(expired).not.toContain('exhaustion-3');
            expect(char.conditions).toHaveLength(1);
            expect(char.conditions[0].id).toBe('exhaustion-3');
        });

        it('permanent sentinel (-1) survives JSON round-trip', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'exhaustion-1', source: 'fatigue', duration: -1, durationUnit: 'permanent' });
            const roundtripped = deepClone(char) as Character;
            expect(roundtripped.conditions).toHaveLength(1);
            const cond = roundtripped.conditions?.[0];
            expect(cond?.duration).toBe(-1);
            expect(cond?.durationUnit).toBe('permanent');
        });

        it('applyCondition refresh does not duplicate by id+source', () => {
            const char = makeCharacter();
            applyCondition(char, { id: 'mage-armor-ac', source: 'mage-armor', duration: 480, durationUnit: 'minute' });
            applyCondition(char, { id: 'mage-armor-ac', source: 'mage-armor', duration: 480, durationUnit: 'minute' });
            expect(char.conditions).toHaveLength(1);
        });
    });
});
