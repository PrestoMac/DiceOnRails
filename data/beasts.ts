import { BEAST_FORMS } from '../services/transformationEngine';
import { Enemy } from '../types';

/**
 * Canonical beast form catalog for Druid Wild Shape and Polymorph.
 * Re-exported from the transformation engine, which is the single source of truth
 * for beast stats, attacks, AC, HP, and speed. This catalog exists for UI/display
 * and tooling purposes (e.g. listing available forms to the player).
 *
 * Available forms: Wolf, Panther, Brown Bear, Dire Wolf, Giant Eagle,
 * Giant Crocodile (CR 5, swim), Tyrannosaurus Rex (CR 8).
 */
export type BeastFormDefinition = Enemy;

export const BEAST_FORMS_CATALOG: BeastFormDefinition[] = Object.values(BEAST_FORMS);

export const BEAST_FORMS_BY_ID: Record<string, BeastFormDefinition> = { ...BEAST_FORMS };

/** Returns all beast forms whose CR is at or below the given max CR (for Wild Shape CR limits). */
export function getAvailableBeastForms(maxCR: number): BeastFormDefinition[] {
  return BEAST_FORMS_CATALOG.filter(b => b.cr != null && b.cr <= maxCR);
}
