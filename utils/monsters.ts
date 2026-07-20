export * from '../data/monsters';

import type { Enemy } from '../types';
import { SRD_MONSTERS } from '../data/monsters';

function toEnemy(entry: typeof SRD_MONSTERS[number]): Enemy {
  return {
    id: entry.name,
    name: entry.name,
    size: entry.size,
    type: entry.type,
    ac: entry.ac,
    hp: { current: entry.hp, max: entry.hp },
    stats: entry.stats,
    attacks: entry.attacks,
    cr: entry.cr,
    xp: entry.xp,
    isDead: false,
    specialAbilities: entry.specialAbilities,
    damageResistances: entry.damageResistances,
    damageImmunities: entry.damageImmunities,
    damageVulnerabilities: entry.damageVulnerabilities,
    conditionsImmunities: entry.conditionsImmunities,
  };
}

export function lookupMonster(name: string): Enemy | undefined {
  const clean = name.trim().toLowerCase();
  let found = SRD_MONSTERS.find(m => m.name.toLowerCase() === clean);
  if (found) return toEnemy(found);

  found = SRD_MONSTERS.find(m => clean.includes(m.name.toLowerCase()) || m.name.toLowerCase().includes(clean));
  if (found) return toEnemy(found);

  const aliasMap: Record<string, string> = {
    'rat': 'Giant Rat',
    'spider': 'Giant Spider',
    'grick': 'Owlbear',
    'wolf': 'Wolf',
    'skeleton warrior': 'Skeleton',
    'skeletal warrior': 'Skeleton',
    'dead': 'Zombie',
    'walker': 'Zombie',
    'undead': 'Zombie',
    'hobgoblin captain': 'Hobgoblin',
    'orc warrior': 'Orc',
    'orc berserker': 'Orc',
    'kobold warrior': 'Kobold',
    'human guard': 'Bandit',
    'guard': 'Bandit',
    'thug': 'Berserker',
    'big spider': 'Giant Spider',
    'large spider': 'Giant Spider',
    'big wolf': 'Dire Wolf',
    'large wolf': 'Dire Wolf',
    'ogre brute': 'Ogre',
    'troll brute': 'Troll',
  };

  const alias = aliasMap[clean];
  if (alias) return lookupMonster(alias);

  return undefined;
}

export function getMonstersByCR(maxCR: number): Enemy[] {
  return SRD_MONSTERS.filter(m => m.cr <= maxCR).map(toEnemy);
}

export function getMonstersByType(type: string): Enemy[] {
  return SRD_MONSTERS.filter(m => m.type === type).map(toEnemy);
}

export function getMonstersByCRRange(minCR: number, maxCR: number): Enemy[] {
  return SRD_MONSTERS.filter(m => m.cr >= minCR && m.cr <= maxCR).map(toEnemy);
}
