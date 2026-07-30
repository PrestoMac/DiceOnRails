export interface BeastFormDefinition {
  id: string;
  name: string;
  cr: number;
  ac: number;
  hp: number;
  speed: number;
  flySpeed?: number;
  swimSpeed?: number;
  stats: { str: number; dex: number; con: number };
  attacks: Array<{
    name: string;
    toHit: number;
    damageDice: string;
    damageType: string;
  }>;
}

export const BEAST_FORMS_CATALOG: BeastFormDefinition[] = [
  {
    id: 'wolf',
    name: 'Wolf',
    cr: 0.25,
    ac: 13,
    hp: 11,
    speed: 40,
    stats: { str: 12, dex: 15, con: 12 },
    attacks: [{ name: 'Bite', toHit: 4, damageDice: '2d4+2', damageType: 'piercing' }],
  },
  {
    id: 'panther',
    name: 'Panther',
    cr: 0.25,
    ac: 12,
    hp: 13,
    speed: 50,
    stats: { str: 14, dex: 15, con: 10 },
    attacks: [
      { name: 'Bite', toHit: 4, damageDice: '1d6+2', damageType: 'piercing' },
      { name: 'Claws', toHit: 4, damageDice: '1d4+2', damageType: 'slashing' },
    ],
  },
  {
    id: 'brown-bear',
    name: 'Brown Bear',
    cr: 1,
    ac: 11,
    hp: 34,
    speed: 40,
    stats: { str: 19, dex: 10, con: 16 },
    attacks: [
      { name: 'Bite', toHit: 5, damageDice: '1d8+4', damageType: 'piercing' },
      { name: 'Claws', toHit: 5, damageDice: '2d6+4', damageType: 'slashing' },
    ],
  },
  {
    id: 'dire-wolf',
    name: 'Dire Wolf',
    cr: 1,
    ac: 14,
    hp: 37,
    speed: 50,
    stats: { str: 17, dex: 15, con: 15 },
    attacks: [{ name: 'Bite', toHit: 5, damageDice: '2d6+3', damageType: 'piercing' }],
  },
  {
    id: 'giant-eagle',
    name: 'Giant Eagle',
    cr: 1,
    ac: 12,
    hp: 26,
    speed: 10,
    flySpeed: 60,
    stats: { str: 16, dex: 17, con: 13 },
    attacks: [
      { name: 'Beak', toHit: 5, damageDice: '1d6+3', damageType: 'piercing' },
      { name: 'Talons', toHit: 5, damageDice: '2d6+3', damageType: 'slashing' },
    ],
  },
];
