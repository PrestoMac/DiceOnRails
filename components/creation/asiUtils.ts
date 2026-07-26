import { RaceDefinition } from '../../utils/races';

/**
 * Computes the full effective racial ASI map for a race, resolving Half-Elf's
 * `'flexible-2'` ASI into concrete per-stat bonuses using the two chosen stats.
 * Returns a plain `Record<string, number>` (e.g. `{ cha: 2, con: 1, dex: 1 }`)
 * that every creation step can use uniformly for stat caps, AC preview, etc.
 *
 * - Standard race with `asi: { str: 2, con: 1 }` → returned verbatim.
 * - Half-Elf (`asi: 'flexible-2'`) → `{ cha: 2 }` plus +1 to each chosen stat
 *   (only when both choices are provided; a missing choice contributes nothing).
 */
export function getEffectiveAsiMap(
  selectedRace: RaceDefinition,
  halfElfChoice1: string | null,
  halfElfChoice2: string | null,
): Record<string, number> {
  if (typeof selectedRace.asi === 'object') {
    return { ...(selectedRace.asi as Record<string, number>) };
  }
  // Half-Elf flexible ASI: +2 CHA and two chosen +1s.
  const map: Record<string, number> = { cha: 2 };
  if (halfElfChoice1) map[halfElfChoice1] = (map[halfElfChoice1] || 0) + 1;
  if (halfElfChoice2) map[halfElfChoice2] = (map[halfElfChoice2] || 0) + 1;
  return map;
}
