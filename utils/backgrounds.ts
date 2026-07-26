import { cryptoRoll } from './random';
import { BACKGROUNDS_BY_ID, ALIGNMENTS_BY_ID, BackgroundDefinition, AlignmentDefinition } from '../data/backgrounds';

export type { BackgroundDefinition, AlignmentDefinition } from '../data/backgrounds';
export { BACKGROUNDS_CATALOG, BACKGROUNDS_BY_ID, ALIGNMENTS_BY_ID, ALIGNMENTS } from '../data/backgrounds';

/** Returns the full BackgroundDefinition for an id, or undefined if unknown/unset. */
export function getBackgroundDef(id: string | undefined | null): BackgroundDefinition | undefined {
  if (!id) return undefined;
  return BACKGROUNDS_BY_ID[id];
}

/** Returns the full AlignmentDefinition for an id, or undefined if unknown/unset. */
export function getAlignmentDef(id: string | undefined | null): AlignmentDefinition | undefined {
  if (!id) return undefined;
  return ALIGNMENTS_BY_ID[id];
}

/** The human-readable alignment name (e.g. "Lawful Good"), or undefined. */
export function getAlignmentName(id: string | undefined | null): string | undefined {
  return getAlignmentDef(id)?.name;
}

/** The background name (e.g. "Acolyte"), or undefined. */
export function getBackgroundName(id: string | undefined | null): string | undefined {
  return getBackgroundDef(id)?.name;
}

/**
 * Rolls a random entry from a trait table using the engine's cryptographically
 * secure RNG (cryptoRoll). Returns undefined if the table is empty.
 *
 * @param table - the trait table (personalityTraits / bonds / flaws, or an ideals array)
 * @param rng - optional injected RNG (defaults to cryptoRoll); used by tests.
 */
export function rollTraitFromTable<T>(table: readonly T[], rng: (sides: number) => number = cryptoRoll): T | undefined {
  if (!table || table.length === 0) return undefined;
  const idx = rng(table.length) - 1; // cryptoRoll returns [1, sides]
  return table[Math.max(0, Math.min(table.length - 1, idx))];
}
