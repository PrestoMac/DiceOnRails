export * from '../data/races';

import { RACES_CATALOG, RaceDefinition } from '../data/races';

/** Lookup map of race ID to race definition, built from the races catalog. */
export const RACES_BY_ID: Record<string, RaceDefinition> = {};

for (const r of RACES_CATALOG) RACES_BY_ID[r.id] = r;
