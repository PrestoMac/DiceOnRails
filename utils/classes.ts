export * from '../data/classes';

import { CLASSES_CATALOG, ClassDefinition } from '../data/classes';

export const CLASSES_BY_ID: Record<string, ClassDefinition> = {};

for (const c of CLASSES_CATALOG) CLASSES_BY_ID[c.id] = c;
