export * from '../data/races';

import { RACES_CATALOG, RaceDefinition } from '../data/races';

export const RACES_BY_ID: Record<string, RaceDefinition> = {};

for (const r of RACES_CATALOG) RACES_BY_ID[r.id] = r;
