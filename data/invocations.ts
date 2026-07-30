export interface InvocationDefinition {
  id: string;
  name: string;
  description: string;
  minLevel: number;
  prerequisite?: string;
}

export const INVOCATIONS_CATALOG: InvocationDefinition[] = [
  { id: 'agonizing-blast', name: 'Agonizing Blast', description: 'When you cast eldritch blast, add your Charisma modifier to the damage it deals on a hit.', minLevel: 2, prerequisite: 'eldritch-blast cantrip' },
  { id: 'armor-of-shadows', name: 'Armor of Shadows', description: 'You can cast mage armor on yourself at will, without expending a spell slot or material components.', minLevel: 2 },
  { id: 'fiendish-vigor', name: 'Fiendish Vigor', description: 'You can cast false life on yourself at will as a 1st-level spell, without expending a spell slot or material components.', minLevel: 2 },
  { id: 'repelling-blast', name: 'Repelling Blast', description: 'When you hit a creature with eldritch blast, you can push the creature up to 10 feet away from you in a straight line.', minLevel: 2, prerequisite: 'eldritch-blast cantrip' },
  { id: 'devil-sight', name: 'Devil\'s Sight', description: 'You can see normally in darkness, both magical and nonmagical, to a distance of 120 feet.', minLevel: 2 },
  { id: 'eldritch-sight', name: 'Eldritch Sight', description: 'You can cast detect magic at will, without expending a spell slot.', minLevel: 2 },
  { id: 'mask-of-many-faces', name: 'Mask of Many Faces', description: 'You can cast disguise self at will, without expending a spell slot.', minLevel: 2 },
  { id: 'thirsting-blade', name: 'Thirsting Blade', description: 'You can attack with your pact weapon twice, instead of once, whenever you take the Attack action on your turn.', minLevel: 5, prerequisite: 'Pact of the Blade' },
];
