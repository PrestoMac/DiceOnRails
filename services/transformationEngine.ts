import { Character, Enemy } from '../types';
import type { TransformationState } from '../types';
import { getMod } from './classEngine';

const BEAST_TEMPLATES: Record<string, Omit<Enemy, 'id' | 'isDead' | 'hp'> & { hp: number; speed: number }> = {
  'wolf': {
    name: 'Wolf', cr: 0.25, hp: 11, ac: 13,
    attacks: [{ name: 'Bite', toHit: 4, damageDice: '2d4+2', damageType: 'piercing' }],
    speed: 40,
    type: 'beast',
    stats: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 }
  },
  'brown-bear': {
    name: 'Brown Bear', cr: 1, hp: 34, ac: 11,
    attacks: [{ name: 'Bite', toHit: 5, damageDice: '1d8+3', damageType: 'piercing' },
              { name: 'Claws', toHit: 5, damageDice: '2d6+3', damageType: 'slashing' }],
    speed: 40,
    type: 'beast',
    stats: { str: 19, dex: 10, con: 16, int: 2, wis: 13, cha: 7 }
  },
  'giant-eagle': {
    name: 'Giant Eagle', cr: 1, hp: 26, ac: 13,
    attacks: [{ name: 'Talons', toHit: 4, damageDice: '2d6+2', damageType: 'slashing' }],
    speed: 80,
    type: 'beast',
    stats: { str: 16, dex: 15, con: 13, int: 6, wis: 14, cha: 10 }
  },
  'dire-wolf': {
    name: 'Dire Wolf', cr: 1, hp: 37, ac: 14,
    attacks: [{ name: 'Bite', toHit: 5, damageDice: '2d6+3', damageType: 'piercing' }],
    speed: 50,
    type: 'beast',
    stats: { str: 17, dex: 15, con: 15, int: 3, wis: 12, cha: 7 }
  },
  'giant-crocodile': {
    name: 'Giant Crocodile', cr: 5, hp: 78, ac: 14,
    attacks: [{ name: 'Bite', toHit: 8, damageDice: '2d10+5', damageType: 'piercing' }],
    speed: 30,
    type: 'beast',
    stats: { str: 21, dex: 9, con: 17, int: 2, wis: 10, cha: 7 }
  },
  'tyrannosaurus-rex': {
    name: 'Tyrannosaurus Rex', cr: 8, hp: 136, ac: 13,
    attacks: [{ name: 'Bite', toHit: 10, damageDice: '4d12+7', damageType: 'piercing' }],
    speed: 50,
    type: 'beast',
    stats: { str: 25, dex: 10, con: 19, int: 2, wis: 12, cha: 9 }
  }
};

/** Lookup table of beast form definitions (Wolf, Brown Bear, Giant Eagle, etc.) keyed by lowercase name, used for polymorph and wild shape. */
export const BEAST_FORMS: Record<string, Enemy> = {};
for (const [key, tpl] of Object.entries(BEAST_TEMPLATES)) {
  BEAST_FORMS[key] = {
    id: tpl.name,
    name: tpl.name,
    cr: tpl.cr,
    hp: { current: tpl.hp, max: tpl.hp },
    ac: tpl.ac,
    attacks: tpl.attacks as Enemy['attacks'],
    type: tpl.type,
    stats: tpl.stats,
    isDead: false,
    beastFields: { speed: tpl.speed }
  };
}

/** Selects a random beast form whose CR is at or below the given target CR, or null if none are eligible. */
export function getBeastForPolymorph(targetCR: number): Enemy | null {
  const eligible = Object.values(BEAST_FORMS).filter(b => b.cr != null && b.cr <= targetCR);
  if (eligible.length === 0) return null;
  return eligible[Math.floor(Math.random() * eligible.length)];
}

/** Applies the Polymorph transformation to a character, storing the original form and beast stats in a TransformationState. */
export function applyPolymorph(
  character: Character,
  beastForm: Enemy,
  duration: number
): TransformationState {
  return createTransformationState(character, beastForm, duration, 'polymorph');
}

/** Applies the Wild Shape transformation to a character, storing the original form and beast stats in a TransformationState. */
export function applyWildShape(
  character: Character,
  beastForm: Enemy,
  duration: number
): TransformationState {
  return createTransformationState(character, beastForm, duration, 'wild-shape');
}

/** Checks whether a transformation has expired (duration <= 0), indicating reversion should occur. */
export function revertTransformation(state: TransformationState): boolean {
  return state.duration <= 0;
}

function createTransformationState(
  character: Character,
  beastForm: Enemy,
  duration: number,
  transformationType: TransformationState['transformationType']
): TransformationState {
  return {
    originalForm: {
      stats: { ...character.stats },
      hp: { ...character.hp },
      ac: calculateBeastAC(character, beastForm),
      attacks: []
    },
    transformedInto: beastForm.name,
    transformationType,
    duration,
    casterId: character.id
  };
}

function calculateBeastAC(character: Character, beast: Enemy): number {
  const dexMod = beast.stats ? getMod(beast.stats.dex) : 0;
  return Math.max(10 + dexMod, beast.ac);
}
