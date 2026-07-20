import { Character, Enemy, ActiveCondition, SaveStat } from '../types';
import { cryptoRoll } from '../utils/random';
import { getMod } from './classEngine';

type Target = Character | Enemy;

/** Parses the highest exhaustion level from a target's active conditions matching 'exhaustion-N'. */
export function parseExhaustionLevel(target: Target): number {
  const levels = (target.conditions ?? [])
    .filter(c => c.id.startsWith('exhaustion-'))
    .map(c => parseInt(c.id.split('-')[1]))
    .filter(n => !isNaN(n));
  return levels.length > 0 ? Math.max(...levels) : 0;
}

/** Returns the exhaustion penalty (equal to the exhaustion level) applied to all d20 rolls. */
export function getExhaustionPenalty(target: Target): number {
  return parseExhaustionLevel(target);
}

/** Applies a condition to a target respecting immunities; if the condition already exists from the same source, refreshes its duration. */
export function applyCondition(target: Target, condition: ActiveCondition): boolean {
  if ('conditionsImmunities' in target) {
    const immunities = (target as Enemy).conditionsImmunities ?? [];
    const lowerId = condition.id.toLowerCase();
    if (immunities.some(i => lowerId === i.toLowerCase() || lowerId.startsWith(i.toLowerCase() + '-'))) {
      return false;
    }
  }
  if (!target.conditions) target.conditions = [];
  const existing = target.conditions.find(c => c.id === condition.id && c.source === condition.source);
  if (existing) {
    existing.duration = condition.duration;
    return true;
  }
  target.conditions.push(condition);
  return true;
}

/** Removes a condition from a target by ID and optional source, executing any onRemove callback. */
export function removeCondition(target: Target, conditionId: string, source?: string): boolean {
  if (!target.conditions) return false;
  const before = target.conditions.length;
  for (const c of target.conditions) {
    if (c.id === conditionId && (source === undefined || c.source === source)) {
      if (c.onRemove) {
        if (typeof c.onRemove === 'function') {
          c.onRemove(target);
        } else if (c.onRemove.kind === 'acBonus') {
          target.acBonus = Math.max(0, (target.acBonus || 0) - c.onRemove.value);
        }
      }
    }
  }
  target.conditions = target.conditions.filter(c =>
    c.id !== conditionId || (source !== undefined && c.source !== source)
  );
  return target.conditions.length < before;
}

/** Ticks all round-based conditions on a target, decrementing durations and removing expired ones. */
export function tickConditions(target: Target): string[] {
  if (!target.conditions) return [];
  const expired: string[] = [];
  const remaining: ActiveCondition[] = [];
  for (const cond of target.conditions) {
    if (cond.durationUnit === 'permanent') {
      remaining.push(cond);
      continue;
    }
    if (cond.durationUnit === 'minute') {
      remaining.push(cond);
      continue;
    }
    if (cond.duration != null) {
      cond.duration--;
      if (cond.duration <= 0) {
        expired.push(cond.id);
        if (cond.onRemove) {
          if (typeof cond.onRemove === 'function') {
            cond.onRemove(target);
          } else if (cond.onRemove.kind === 'acBonus') {
            target.acBonus = Math.max(0, (target.acBonus || 0) - cond.onRemove.value);
          }
        }
        continue;
      }
    }
    remaining.push(cond);
  }
  target.conditions = remaining;
  return expired;
}

/** Ticks minute-duration conditions on a target by a given number of minutes, removing expired ones. */
export function tickConditionsByTime(target: Target, minutes: number): string[] {
  if (!target.conditions) return [];
  const expired: string[] = [];
  const remaining: ActiveCondition[] = [];
  for (const cond of target.conditions) {
    if (cond.durationUnit === 'permanent') {
      remaining.push(cond);
      continue;
    }
    if (cond.duration != null && cond.durationUnit === 'minute') {
      cond.duration -= minutes;
      if (cond.duration <= 0) {
        expired.push(cond.id);
        if (cond.onRemove) {
          if (typeof cond.onRemove === 'function') cond.onRemove(target);
          else if (cond.onRemove.kind === 'acBonus')
            target.acBonus = Math.max(0, (target.acBonus || 0) - cond.onRemove.value);
        }
        continue;
      }
    }
    remaining.push(cond);
  }
  target.conditions = remaining;
  return expired;
}



/** Ticks conditions by a given number of rounds, removing expired ones; skips permanent and minute-duration conditions. */
export function tickConditionsByRounds(target: Target, rounds: number): string[] {
  if (!target.conditions || rounds <= 0) return [];
  const expired: string[] = [];
  const remaining: ActiveCondition[] = [];
  for (const cond of target.conditions) {
    if (cond.durationUnit === 'permanent') {
      remaining.push(cond);
      continue;
    }
    if (cond.durationUnit !== 'minute' && cond.duration != null) {
      cond.duration -= rounds;
      if (cond.duration <= 0) {
        expired.push(cond.id);
        if (cond.onRemove) {
          if (typeof cond.onRemove === 'function') cond.onRemove(target);
          else if (cond.onRemove.kind === 'acBonus')
            target.acBonus = Math.max(0, (target.acBonus || 0) - cond.onRemove.value);
        }
        continue;
      }
    }
    remaining.push(cond);
  }
  target.conditions = remaining;
  return expired;
}

/** Checks whether a target has a specific condition by ID. */
export function hasCondition(target: Target, conditionId: string): boolean {
  if (!target.conditions) return false;
  return target.conditions.some(c => c.id === conditionId);
}

/** Aggregates all gameplay-relevant effects from active conditions into a single snapshot object, including exhaustion penalties. */
export function getConditionEffects(target: Target): {
  advantageOnAttacks: boolean;
  disadvantageOnAttacks: boolean;
  attacksAgainstHaveAdvantage: boolean;
  speedModifier: number;
  acModifier: number;
  isBlinded: boolean;
  isCharmed: boolean;
  isFrightened: boolean;
  isParalyzed: boolean;
  isProne: boolean;
  isRestrained: boolean;
  isStunned: boolean;
  isIncapacitated: boolean;
  isPoisoned: boolean;
  isDeafened: boolean;
  isUnconscious: boolean;
  attacksAgainstHaveDisadvantage: boolean;
  d20Modifier: number;
  speedPenaltyFt: number;
} {
  const ids = new Set((target.conditions ?? []).map(c => c.id));
  const exhaustionLevel = parseExhaustionLevel(target);

  return {
    isBlinded: ids.has('blinded'),
    isCharmed: ids.has('charmed'),
    isFrightened: ids.has('frightened'),
    isParalyzed: ids.has('paralyzed'),
    isProne: ids.has('prone'),
    isRestrained: ids.has('restrained'),
    isStunned: ids.has('stunned'),
    isIncapacitated: ids.has('incapacitated'),
    isPoisoned: ids.has('poisoned'),
    isDeafened: ids.has('deafened'),
    isUnconscious: ids.has('unconscious'),
    disadvantageOnAttacks: ids.has('blinded') || ids.has('prone') || ids.has('poisoned') || ids.has('restrained') || ids.has('frightened') || ids.has('unconscious'),
    attacksAgainstHaveAdvantage: ids.has('blinded') || ids.has('prone') || ids.has('paralyzed') || ids.has('restrained') || ids.has('stunned') || ids.has('unconscious'),
    advantageOnAttacks: ids.has('frightened') ? false : (ids.has('paralyzed') || ids.has('stunned') || ids.has('unconscious')),
    speedModifier: (ids.has('restrained') || ids.has('unconscious')) ? 0 : 1,
    acModifier: 0,
    attacksAgainstHaveDisadvantage: false,
    d20Modifier: -exhaustionLevel,
    speedPenaltyFt: -(exhaustionLevel * 5),
  };
}

/** Rolls a saving throw for a target against a condition's save DC, returning whether the save succeeded along with roll details. */
export function rollSaveAgainstCondition(
  target: Target,
  condition: ActiveCondition,
  spellSaveDC: number
): { succeeded: boolean; roll: number; total: number } {
  if (!condition.saveEnd) {
    return { succeeded: false, roll: 0, total: 0 };
  }
  const statVal = (target as any).stats?.[condition.saveEnd] || 10;
  const mod = getMod(statVal);
  const roll = cryptoRoll(20);
  const total = roll + mod - getExhaustionPenalty(target);
  return { succeeded: total >= spellSaveDC, roll, total };
}

/** Checks whether a target is incapacitated (has the incapacitated, paralyzed, or stunned condition). */
export function isIncapacitated(target: Target): boolean {
  return hasCondition(target, 'incapacitated') || hasCondition(target, 'paralyzed') || hasCondition(target, 'stunned');
}

/** Alias for isIncapacitated, kept for backward compatibility with serialized game states. */
export const isIncapsulated = isIncapacitated;

/** Checks whether a target is unconscious. */
export function isUnconscious(target: Target): boolean {
  return hasCondition(target, 'unconscious');
}
