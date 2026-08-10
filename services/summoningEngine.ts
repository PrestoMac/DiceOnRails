import { EnemyAttack, Enemy } from '../types';

interface CreatureTemplate {
  name: string;
  hp: number;
  ac: number;
  attacks: EnemyAttack[];
  cr: number;
  duration: number;
  type: string;
}

const TEMPLATES: Record<string, CreatureTemplate> = {
  zombie: {
    name: 'Zombie', hp: 22, ac: 8,
    attacks: [{ name: 'Slam', toHit: 3, damageDice: '1d6+1', damageType: 'bludgeoning' }],
    cr: 0.25, duration: 1440, type: 'undead'
  },
  skeleton: {
    name: 'Skeleton', hp: 13, ac: 13,
    attacks: [
      { name: 'Shortsword', toHit: 4, damageDice: '1d6+2', damageType: 'slashing' },
      { name: 'Shortbow', toHit: 4, damageDice: '1d6+2', damageType: 'piercing' }
    ],
    cr: 0.25, duration: 1440, type: 'undead'
  },
  'giant-spider': {
    name: 'Giant Spider', hp: 26, ac: 14,
    attacks: [{ name: 'Bite', toHit: 5, damageDice: '1d8+3', damageType: 'piercing' }],
    cr: 1, duration: 60, type: 'beast'
  },
  'dire-wolf': {
    name: 'Dire Wolf', hp: 37, ac: 14,
    attacks: [{ name: 'Bite', toHit: 5, damageDice: '2d6+3', damageType: 'piercing' }],
    cr: 1, duration: 60, type: 'beast'
  },
  'giant-eagle': {
    name: 'Giant Eagle', hp: 26, ac: 13,
    attacks: [{ name: 'Talons', toHit: 4, damageDice: '2d6+2', damageType: 'slashing' }],
    cr: 1, duration: 60, type: 'beast'
  },
  'air-elemental': {
    name: 'Air Elemental', hp: 90, ac: 15,
    attacks: [{ name: 'Slam', toHit: 8, damageDice: '2d8+5', damageType: 'bludgeoning' }],
    cr: 5, duration: 60, type: 'elemental'
  }
};

function buildCreature(template: CreatureTemplate, casterId: string, id: string): Enemy {
  return {
    id,
    name: template.name,
    hp: { current: template.hp, max: template.hp },
    ac: template.ac,
    attacks: template.attacks,
    cr: template.cr,
    type: template.type,
    isDead: false,
    summonFields: { duration: template.duration, ownerId: casterId }
  };
}

/** Creates a summoned creature from a named template (e.g. zombie, skeleton, dire-wolf), returning null for unknown templates. */
export function createSummonedCreature(
  template: string,
  casterId: string,
  _casterLevel: number
): Enemy | null {
  const t = TEMPLATES[template.toLowerCase()];
  return t ? buildCreature(t, casterId, `summon-${Math.random().toString(36).slice(2, 11)}`) : null;
}

/** Filters out summoned creatures whose duration has expired or have 0 HP, decrementing duration for survivors. */
export const tickSummonedCreatures = (creatures: Enemy[]): Enemy[] =>
  creatures.filter(c => { if (c.summonFields) c.summonFields.duration--; return c.summonFields && c.summonFields.duration > 0 && c.hp.current > 0; });

/** Returns all non-dead summoned creatures owned by the given caster. */
export const getSummonedCreaturesForCaster = (
  creatures: Enemy[],
  casterId: string
): Enemy[] => creatures.filter(c => c.summonFields?.ownerId === casterId && c.hp.current > 0);
