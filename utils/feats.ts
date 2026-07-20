export * from '../data/feats';

import { FEATS_CATALOG, FeatDefinition } from '../data/feats';

export function getFeatById(id: string): FeatDefinition | undefined {
  return FEATS_CATALOG.find(f => f.id === id);
}
