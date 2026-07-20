interface MonsterEntry {
  name: string;
  size: string;
  type: string;
  ac: number;
  hp: number;
  hitDice: string;
  stats: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  attacks: { name: string; toHit: number; damageDice: string; damageType: string; description?: string }[];
  cr: number;
  xp: number;
  speed?: string;
  specialAbilities?: string[];
  damageResistances?: string[];
  damageImmunities?: string[];
  damageVulnerabilities?: string[];
  conditionsImmunities?: string[];
}

export const SRD_MONSTERS: MonsterEntry[] = [
  {
    name: 'Commoner',
    size: 'Medium',
    type: 'humanoid',
    ac: 10,
    hp: 4,
    hitDice: '1d8',
    stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    attacks: [{ name: 'Club', toHit: 2, damageDice: '1d4', damageType: 'bludgeoning' }],
    cr: 0, xp: 10
  },
  {
    name: 'Giant Rat',
    size: 'Small',
    type: 'beast',
    ac: 12,
    hp: 7,
    hitDice: '2d6',
    stats: { str: 7, dex: 15, con: 11, int: 2, wis: 10, cha: 4 },
    attacks: [{ name: 'Bite', toHit: 4, damageDice: '1d4+2', damageType: 'piercing' }],
    cr: 0.125, xp: 25,
    specialAbilities: ['Keen Smell: Advantage on Perception (smell)', 'Pack Tactics: Advantage if ally within 5 ft.']
  },
  {
    name: 'Kobold',
    size: 'Small',
    type: 'humanoid',
    ac: 12,
    hp: 5,
    hitDice: '2d6-2',
    stats: { str: 7, dex: 15, con: 9, int: 8, wis: 7, cha: 8 },
    attacks: [
      { name: 'Dagger', toHit: 4, damageDice: '1d4+2', damageType: 'piercing' },
      { name: 'Sling', toHit: 4, damageDice: '1d4+2', damageType: 'bludgeoning' }
    ],
    cr: 0.125, xp: 25,
    specialAbilities: ['Sunlight Sensitivity: Disadvantage in sunlight', 'Pack Tactics: Advantage if ally within 5 ft.']
  },
  {
    name: 'Bandit',
    size: 'Medium',
    type: 'humanoid',
    ac: 12,
    hp: 11,
    hitDice: '2d8+2',
    stats: { str: 11, dex: 12, con: 12, int: 10, wis: 10, cha: 10 },
    attacks: [
      { name: 'Scimitar', toHit: 3, damageDice: '1d6+1', damageType: 'slashing' },
      { name: 'Light Crossbow', toHit: 3, damageDice: '1d8+1', damageType: 'piercing' }
    ],
    cr: 0.125, xp: 25
  },
  {
    name: 'Goblin',
    size: 'Small',
    type: 'humanoid',
    ac: 15,
    hp: 7,
    hitDice: '2d6',
    stats: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    attacks: [
      { name: 'Scimitar', toHit: 4, damageDice: '1d6+2', damageType: 'slashing' },
      { name: 'Shortbow', toHit: 4, damageDice: '1d6+2', damageType: 'piercing' }
    ],
    cr: 0.25, xp: 50,
    specialAbilities: ['Nimble Escape: Disengage or Hide as bonus action']
  },
  {
    name: 'Skeleton',
    size: 'Medium',
    type: 'undead',
    ac: 13,
    hp: 13,
    hitDice: '2d8+4',
    stats: { str: 10, dex: 14, con: 15, int: 6, wis: 8, cha: 5 },
    attacks: [
      { name: 'Shortsword', toHit: 4, damageDice: '1d6+2', damageType: 'piercing' },
      { name: 'Shortbow', toHit: 4, damageDice: '1d6+2', damageType: 'piercing' }
    ],
    cr: 0.25, xp: 50,
    damageVulnerabilities: ['bludgeoning'],
    damageImmunities: ['poison'],
    conditionsImmunities: ['poisoned', 'exhaustion']
  },
  {
    name: 'Zombie',
    size: 'Medium',
    type: 'undead',
    ac: 8,
    hp: 22,
    hitDice: '3d8+9',
    stats: { str: 13, dex: 6, con: 16, int: 3, wis: 6, cha: 5 },
    attacks: [{ name: 'Slam', toHit: 3, damageDice: '1d6+1', damageType: 'bludgeoning' }],
    cr: 0.25, xp: 50,
    damageImmunities: ['poison'],
    conditionsImmunities: ['poisoned'],
    specialAbilities: ['Undead Fortitude: CON save vs 5+damage to drop to 1 HP instead of 0 (except radiant/crit)']
  },
  {
    name: 'Wolf',
    size: 'Medium',
    type: 'beast',
    ac: 13,
    hp: 11,
    hitDice: '2d8+2',
    stats: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 },
    attacks: [{ name: 'Bite', toHit: 4, damageDice: '2d4+2', damageType: 'piercing', description: 'DC 11 STR save or knocked prone' }],
    cr: 0.25, xp: 50,
    specialAbilities: ['Keen Hearing and Smell: Advantage on Perception', 'Pack Tactics: Advantage if ally within 5 ft.']
  },
  {
    name: 'Cultist',
    size: 'Medium',
    type: 'humanoid',
    ac: 12,
    hp: 9,
    hitDice: '2d8',
    stats: { str: 11, dex: 12, con: 10, int: 10, wis: 11, cha: 10 },
    attacks: [{ name: 'Scimitar', toHit: 3, damageDice: '1d6+1', damageType: 'slashing' }],
    cr: 0.125, xp: 25
  },
  {
    name: 'Giant Wasp',
    size: 'Medium',
    type: 'beast',
    ac: 12,
    hp: 13,
    hitDice: '3d8',
    stats: { str: 10, dex: 14, con: 10, int: 1, wis: 10, cha: 3 },
    attacks: [{ name: 'Sting', toHit: 4, damageDice: '1d6+2', damageType: 'piercing', description: 'DC 11 CON save or 3d6 poison damage' }],
    cr: 0.5, xp: 100
  },
  {
    name: 'Hobgoblin',
    size: 'Medium',
    type: 'humanoid',
    ac: 18,
    hp: 11,
    hitDice: '2d8+2',
    stats: { str: 13, dex: 12, con: 12, int: 10, wis: 10, cha: 9 },
    attacks: [
      { name: 'Longsword', toHit: 3, damageDice: '1d8+1', damageType: 'slashing' },
      { name: 'Longbow', toHit: 3, damageDice: '1d8+1', damageType: 'piercing' }
    ],
    cr: 0.5, xp: 100,
    specialAbilities: ['Martial Advantage: +2d6 damage if ally within 5 ft.']
  },
  {
    name: 'Orc',
    size: 'Medium',
    type: 'humanoid',
    ac: 13,
    hp: 15,
    hitDice: '2d8+6',
    stats: { str: 16, dex: 12, con: 16, int: 7, wis: 11, cha: 10 },
    attacks: [
      { name: 'Greataxe', toHit: 5, damageDice: '1d12+3', damageType: 'slashing' },
      { name: 'Javelin', toHit: 5, damageDice: '1d6+3', damageType: 'piercing' }
    ],
    cr: 0.5, xp: 100,
    specialAbilities: ['Aggressive: Bonus action move toward enemy']
  },
  {
    name: 'Gnoll',
    size: 'Medium',
    type: 'humanoid',
    ac: 15,
    hp: 22,
    hitDice: '5d8',
    stats: { str: 14, dex: 12, con: 11, int: 6, wis: 10, cha: 7 },
    attacks: [
      { name: 'Bite', toHit: 4, damageDice: '1d4+2', damageType: 'piercing' },
      { name: 'Spear', toHit: 4, damageDice: '1d6+2', damageType: 'piercing' },
      { name: 'Longbow', toHit: 3, damageDice: '1d8+1', damageType: 'piercing' }
    ],
    cr: 0.5, xp: 100,
    specialAbilities: ['Rampage: Bonus action move+attack when reducing creature to 0 HP']
  },
  {
    name: 'Bugbear',
    size: 'Medium',
    type: 'humanoid',
    ac: 16,
    hp: 27,
    hitDice: '5d8+5',
    stats: { str: 15, dex: 14, con: 13, int: 8, wis: 11, cha: 9 },
    attacks: [
      { name: 'Morningstar', toHit: 4, damageDice: '2d8+2', damageType: 'piercing' },
      { name: 'Javelin', toHit: 4, damageDice: '2d6+2', damageType: 'piercing' }
    ],
    cr: 1, xp: 200,
    specialAbilities: ['Brute: Extra damage die on melee', 'Surprise Attack: +2d6 on first round']
  },
  {
    name: 'Dire Wolf',
    size: 'Large',
    type: 'beast',
    ac: 14,
    hp: 37,
    hitDice: '5d10+10',
    stats: { str: 17, dex: 15, con: 15, int: 3, wis: 12, cha: 7 },
    attacks: [{ name: 'Bite', toHit: 5, damageDice: '2d6+3', damageType: 'piercing', description: 'DC 13 STR save or knocked prone' }],
    cr: 1, xp: 200,
    specialAbilities: ['Pack Tactics: Advantage if ally within 5 ft.', 'Keen Hearing and Smell']
  },
  {
    name: 'Ghoul',
    size: 'Medium',
    type: 'undead',
    ac: 12,
    hp: 22,
    hitDice: '5d8',
    stats: { str: 13, dex: 15, con: 10, int: 7, wis: 10, cha: 6 },
    attacks: [
      { name: 'Bite', toHit: 2, damageDice: '2d6+2', damageType: 'piercing' },
      { name: 'Claws', toHit: 4, damageDice: '2d4+2', damageType: 'slashing', description: 'DC 10 CON save or paralyzed 1 min' }
    ],
    cr: 1, xp: 200,
    damageImmunities: ['poison'],
    conditionsImmunities: ['poisoned', 'charmed', 'exhaustion']
  },
  {
    name: 'Giant Spider',
    size: 'Large',
    type: 'beast',
    ac: 14,
    hp: 26,
    hitDice: '4d10+4',
    stats: { str: 14, dex: 16, con: 12, int: 2, wis: 11, cha: 4 },
    attacks: [
      { name: 'Bite', toHit: 5, damageDice: '1d8+3', damageType: 'piercing', description: 'DC 11 CON save or 2d8 poison damage' },
      { name: 'Web', toHit: 5, damageDice: '', damageType: '', description: 'Restrained (recharge 5-6)' }
    ],
    cr: 1, xp: 200,
    specialAbilities: ['Spider Climb', 'Web Sense', 'Web Walker']
  },
  {
    name: 'Ghast',
    size: 'Medium',
    type: 'undead',
    ac: 13,
    hp: 36,
    hitDice: '8d8',
    stats: { str: 16, dex: 17, con: 10, int: 11, wis: 10, cha: 8 },
    attacks: [
      { name: 'Bite', toHit: 3, damageDice: '2d8+3', damageType: 'piercing' },
      { name: 'Claws', toHit: 5, damageDice: '2d6+3', damageType: 'slashing', description: 'DC 10 CON save or paralyzed 1 min' }
    ],
    cr: 2, xp: 450,
    damageImmunities: ['poison'],
    damageResistances: ['necrotic'],
    conditionsImmunities: ['poisoned', 'charmed', 'exhaustion'],
    specialAbilities: ['Stench: Creatures within 5 ft. have disadvantage on attack rolls and DC 10 CON save at start of turn']
  },
  {
    name: 'Ogre',
    size: 'Large',
    type: 'giant',
    ac: 11,
    hp: 59,
    hitDice: '7d10+21',
    stats: { str: 19, dex: 8, con: 16, int: 5, wis: 7, cha: 7 },
    attacks: [
      { name: 'Greatclub', toHit: 6, damageDice: '2d8+4', damageType: 'bludgeoning' },
      { name: 'Javelin', toHit: 6, damageDice: '2d6+4', damageType: 'piercing' }
    ],
    cr: 2, xp: 450
  },
  {
    name: 'Gargoyle',
    size: 'Medium',
    type: 'elemental',
    ac: 15,
    hp: 52,
    hitDice: '7d8+21',
    stats: { str: 15, dex: 11, con: 16, int: 6, wis: 11, cha: 7 },
    attacks: [
      { name: 'Bite', toHit: 4, damageDice: '1d6+2', damageType: 'piercing' },
      { name: 'Claws', toHit: 4, damageDice: '1d6+2', damageType: 'slashing' }
    ],
    cr: 2, xp: 450,
    damageResistances: ['bludgeoning, piercing, slashing from nonmagical weapons'],
    damageImmunities: ['poison'],
    conditionsImmunities: ['poisoned', 'exhaustion'],
    specialAbilities: ['False Appearance: Indistinguishable from statue while still']
  },
  {
    name: 'Berserker',
    size: 'Medium',
    type: 'humanoid',
    ac: 13,
    hp: 67,
    hitDice: '9d8+27',
    stats: { str: 16, dex: 12, con: 17, int: 9, wis: 11, cha: 9 },
    attacks: [{ name: 'Greataxe', toHit: 5, damageDice: '1d12+3', damageType: 'slashing' }],
    cr: 2, xp: 450,
    specialAbilities: ['Reckless: Advantage on attacks, attacks against berserker have advantage', 'Relentless Endurance: Drop to 1 HP instead of 0 once per day']
  },
  {
    name: 'Harpy',
    size: 'Medium',
    type: 'monstrosity',
    ac: 11,
    hp: 38,
    hitDice: '7d8+7',
    stats: { str: 12, dex: 13, con: 12, int: 7, wis: 10, cha: 13 },
    attacks: [
      { name: 'Claws', toHit: 3, damageDice: '2d4+1', damageType: 'slashing' },
      { name: 'Club', toHit: 3, damageDice: '1d4+1', damageType: 'bludgeoning' }
    ],
    cr: 1, xp: 200,
    specialAbilities: ['Luring Song: DC 11 WIS save or be charmed and move toward harpy']
  },
  {
    name: 'Minotaur',
    size: 'Large',
    type: 'monstrosity',
    ac: 14,
    hp: 76,
    hitDice: '9d10+27',
    stats: { str: 18, dex: 11, con: 16, int: 6, wis: 16, cha: 9 },
    attacks: [
      { name: 'Greataxe', toHit: 6, damageDice: '2d12+4', damageType: 'slashing' },
      { name: 'Gore', toHit: 6, damageDice: '2d8+4', damageType: 'piercing', description: 'DC 14 STR save or knocked prone (only when charging)' }
    ],
    cr: 3, xp: 700,
    specialAbilities: ['Charge: If moves 10+ ft. before Gore, +2d8 damage and prone on save',
      'Labyrinthine Recall: Perfect recall of paths']
  },
  {
    name: 'Owlbear',
    size: 'Large',
    type: 'monstrosity',
    ac: 13,
    hp: 59,
    hitDice: '7d10+21',
    stats: { str: 20, dex: 12, con: 17, int: 3, wis: 12, cha: 7 },
    attacks: [
      { name: 'Beak', toHit: 7, damageDice: '1d10+5', damageType: 'piercing' },
      { name: 'Claws', toHit: 7, damageDice: '2d8+5', damageType: 'slashing' }
    ],
    cr: 3, xp: 700,
    specialAbilities: ['Multiattack: Beak + Claws', 'Keen Sight and Smell: Advantage on Perception']
  },
  {
    name: 'Wight',
    size: 'Medium',
    type: 'undead',
    ac: 14,
    hp: 45,
    hitDice: '6d8+18',
    stats: { str: 15, dex: 14, con: 16, int: 10, wis: 13, cha: 15 },
    attacks: [
      { name: 'Life Drain', toHit: 4, damageDice: '1d6+2', damageType: 'necrotic', description: 'DC 13 CON save or HP max reduced' },
      { name: 'Longsword', toHit: 4, damageDice: '1d8+2', damageType: 'slashing' },
      { name: 'Longbow', toHit: 4, damageDice: '1d8+2', damageType: 'piercing' }
    ],
    cr: 3, xp: 700,
    damageResistances: ['necrotic', 'bludgeoning, piercing, slashing from nonmagical not silvered'],
    damageImmunities: ['poison'],
    conditionsImmunities: ['poisoned', 'exhaustion'],
    specialAbilities: ['Multiattack: 2 longsword or longbow attacks; can replace one with Life Drain',
      'Sunlight Sensitivity: Disadvantage in sunlight']
  },
  {
    name: 'Ettin',
    size: 'Large',
    type: 'giant',
    ac: 12,
    hp: 85,
    hitDice: '10d10+30',
    stats: { str: 21, dex: 8, con: 17, int: 6, wis: 10, cha: 8 },
    attacks: [
      { name: 'Battleaxe', toHit: 7, damageDice: '2d8+5', damageType: 'slashing' },
      { name: 'Morningstar', toHit: 7, damageDice: '2d8+5', damageType: 'piercing' }
    ],
    cr: 4, xp: 1100,
    specialAbilities: ['Multiattack: Two attacks (one per head)', 'Two Heads: Advantage on Perception and saves vs blinded/charmed/stunned/unconscious']
  },
  {
    name: 'Vampire Spawn',
    size: 'Medium',
    type: 'undead',
    ac: 15,
    hp: 82,
    hitDice: '11d8+33',
    stats: { str: 16, dex: 16, con: 16, int: 11, wis: 10, cha: 12 },
    attacks: [
      { name: 'Claws', toHit: 6, damageDice: '2d4+3', damageType: 'slashing' },
      { name: 'Bite', toHit: 6, damageDice: '1d6+3', damageType: 'piercing', description: 'Plus 2d6 necrotic, HP max reduced, target grappled' }
    ],
    cr: 5, xp: 1800,
    damageResistances: ['necrotic', 'bludgeoning, piercing, slashing from nonmagical weapons'],
    specialAbilities: ['Regeneration: 10 HP at start of turn if not in sunlight or running water',
      'Spider Climb', 'Sunlight Hypersensitivity', 'Vampire Weaknesses']
  },
  {
    name: 'Troll',
    size: 'Large',
    type: 'giant',
    ac: 15,
    hp: 84,
    hitDice: '8d10+40',
    stats: { str: 18, dex: 13, con: 20, int: 7, wis: 9, cha: 7 },
    attacks: [
      { name: 'Bite', toHit: 7, damageDice: '1d6+4', damageType: 'piercing' },
      { name: 'Claw', toHit: 7, damageDice: '2d6+4', damageType: 'slashing' }
    ],
    cr: 5, xp: 1800,
    specialAbilities: ['Multiattack: Bite + 2x Claw', 'Keen Smell: Advantage on Perception',
      'Regeneration: 10 HP/turn (stopped by acid/fire); dies only if starts turn at 0 HP and can\'t regenerate']
  }
];
