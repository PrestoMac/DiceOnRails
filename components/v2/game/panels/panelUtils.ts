import type { ActiveCondition } from '../../../../types';
import { BUFF_SOURCES } from '../../../../data/referenceConstants';
import { cryptoRoll } from '../../../../utils/random';

/** Prettifies a kebab-case id for display (e.g. 'half-elf' → 'Half Elf'). */
export function titleCase(id: string): string {
  return id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Capitalizes the first character of a string (used for status/difficulty chips). */
export function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Classifies a live condition as a buff (ported from the legacy CharacterSheet).
 * Buffs render verdant; everything else renders blood.
 */
export function isBuffCondition(c: ActiveCondition): boolean {
  if (BUFF_SOURCES.has(c.source)) return true;
  if (c.id.endsWith('-ac')) return true;
  if (typeof c.onRemove === 'object' && c.onRemove?.kind === 'acBonus') return true;
  if (c.id === 'bless') return true;
  return false;
}

/** Human-readable remaining duration (ported from the legacy CharacterSheet). */
export function formatConditionDuration(c: ActiveCondition): string {
  if (c.durationUnit === 'permanent') return 'permanent';
  if (c.duration == null || c.duration < 0) return 'permanent';
  if (c.durationUnit === 'minute') {
    if (c.duration >= 60) {
      const h = Math.floor(c.duration / 60);
      const m = c.duration % 60;
      return m === 0 ? `${h}h` : `${h}h ${m}m`;
    }
    return `${c.duration}m`;
  }
  return `${c.duration}r`;
}

export interface DiceFormulaResult {
  results: number[];
  total: number;
}

/**
 * Rolls a healing-dice formula like '2d4+2' via the engine's bias-free RNG
 * (ported exactly from the legacy CharacterSheet rollDiceFormula).
 */
export function rollDiceFormula(formula: string): DiceFormulaResult {
  const m = /^(\d+)d(\d+)(?:\+(\d+))?$/.exec(formula.replace(/\s+/g, ''));
  if (m) {
    const rolls = Array.from({ length: Number(m[1]) }, () => cryptoRoll(Number(m[2])));
    return { results: rolls, total: rolls.reduce((a, b) => a + b, 0) + Number(m[3] ?? 0) };
  }
  const flat = Number(formula);
  return Number.isNaN(flat) ? { results: [4], total: 4 } : { results: [flat], total: flat };
}
