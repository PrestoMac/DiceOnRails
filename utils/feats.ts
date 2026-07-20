export * from '../data/feats';

import { FEATS_CATALOG, FeatDefinition } from '../data/feats';

/**
 * Looks up a feat definition by its ID.
 * @param id - The feat ID to search for.
 * @returns The matching FeatDefinition, or undefined if not found.
 */
export function getFeatById(id: string): FeatDefinition | undefined {
  return FEATS_CATALOG.find(f => f.id === id);
}
