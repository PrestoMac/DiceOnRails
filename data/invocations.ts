export interface InvocationDefinition {
  id: string;
  name: string;
  description: string;
  minLevel: number;
  prerequisite?: string;
  /** Mechanically-applied effect tag. The engine reads these to apply bonuses. */
  effect?: 'agonizing-blast' | 'extra-attack' | 'at-will-spell' | 'passive';
  /** For at-will-spell invocations: the spell id(s) added to the warlock's known list. */
  grantsSpells?: string[];
}

export const INVOCATIONS_CATALOG: InvocationDefinition[] = [
  { id: 'agonizing-blast', name: 'Agonizing Blast', description: 'When you cast eldritch blast, add your Charisma modifier to the damage it deals on a hit.', minLevel: 2, prerequisite: 'eldritch-blast cantrip', effect: 'agonizing-blast' },
  { id: 'armor-of-shadows', name: 'Armor of Shadows', description: 'You can cast mage armor on yourself at will, without expending a spell slot or material components.', minLevel: 2, effect: 'at-will-spell', grantsSpells: ['mage-armor'] },
  { id: 'fiendish-vigor', name: 'Fiendish Vigor', description: 'You can cast false life on yourself at will as a 1st-level spell, without expending a spell slot or material components.', minLevel: 2, effect: 'at-will-spell', grantsSpells: ['false-life'] },
  { id: 'repelling-blast', name: 'Repelling Blast', description: 'When you hit a creature with eldritch blast, you can push the creature up to 10 feet away from you in a straight line.', minLevel: 2, prerequisite: 'eldritch-blast cantrip', effect: 'passive' },
  { id: 'devil-sight', name: 'Devil\'s Sight', description: 'You can see normally in darkness, both magical and nonmagical, to a distance of 120 feet.', minLevel: 2, effect: 'passive' },
  { id: 'eldritch-sight', name: 'Eldritch Sight', description: 'You can cast detect magic at will, without expending a spell slot.', minLevel: 2, effect: 'at-will-spell', grantsSpells: ['detect-magic'] },
  { id: 'mask-of-many-faces', name: 'Mask of Many Faces', description: 'You can cast disguise self at will, without expending a spell slot.', minLevel: 2, effect: 'at-will-spell', grantsSpells: ['disguise-self'] },
  { id: 'thirsting-blade', name: 'Thirsting Blade', description: 'You can attack with your pact weapon twice, instead of once, whenever you take the Attack action on your turn.', minLevel: 5, prerequisite: 'Pact of the Blade', effect: 'extra-attack' },
];

export const INVOCATIONS_BY_ID: Record<string, InvocationDefinition> = Object.fromEntries(
  INVOCATIONS_CATALOG.map(i => [i.id, i])
);

/** Returns the number of invocations a warlock of the given level knows. */
export function getInvocationCount(level: number): number {
  if (level < 2) return 0;
  if (level >= 18) return 8;
  if (level >= 15) return 7;
  if (level >= 12) return 6;
  if (level >= 9) return 5;
  if (level >= 7) return 4;
  if (level >= 5) return 3;
  return 2;
}

/** Returns the spell ids granted as at-will casts by the character's owned invocations.
 *  These spells do not consume a spell slot when cast and do not count against the
 *  spells-known cap. */
export function getAtWillInvocationSpells(invocations: string[] | undefined): string[] {
  if (!invocations || invocations.length === 0) return [];
  const spells: string[] = [];
  for (const id of invocations) {
    const inv = INVOCATIONS_BY_ID[id];
    if (inv?.effect === 'at-will-spell') {
      for (const s of inv.grantsSpells ?? []) {
        if (!spells.includes(s)) spells.push(s);
      }
    }
  }
  return spells;
}
