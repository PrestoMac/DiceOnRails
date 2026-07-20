import { ShopItem } from './types';
export { SHOP_ITEMS } from '../../data/shopItems';

export const STEP_LABELS = [
  'Name', 'Race', 'Class', 'Stats', 'Skills', 'Feats',
  'Path', 'Spells', 'Gear', 'Review', 'Start'
];

export const STAT_LABELS: Record<string, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

export const POINT_BUY_COSTS: Record<number, number> = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9,
};

export const CLASS_RECOMMENDED_SKILLS: Record<string, string[]> = {
  'Fighter':   ['Athletics', 'Perception', 'Intimidation'],
  'Wizard':    ['Arcana', 'History', 'Investigation'],
  'Rogue':     ['Stealth', 'Sleight of Hand', 'Perception'],
  'Cleric':    ['Religion', 'Medicine', 'Persuasion'],
  'Druid':     ['Nature', 'Perception', 'Animal Handling'],
  'Ranger':    ['Survival', 'Nature', 'Stealth'],
  'Barbarian': ['Athletics', 'Intimidation', 'Survival'],
  'Bard':      ['Persuasion', 'Performance', 'Deception'],
  'Paladin':   ['Persuasion', 'Athletics', 'Religion'],
  'Sorcerer':  ['Arcana', 'Persuasion', 'Deception'],
  'Warlock':   ['Arcana', 'Deception', 'Intimidation'],
  'Monk':      ['Athletics', 'Stealth', 'Acrobatics'],
};


export const GEN_MODES = [
  { key: 'buy' as const, label: 'Point Buy' },
  { key: 'array' as const, label: 'Standard Array' },
  { key: 'roll' as const, label: 'Roll Stats' },
];

export const DRAGON_ANCESTRIES: { id: string; label: string; damageType: string }[] = [
  { id: 'black',   label: 'Black',   damageType: 'acid' },
  { id: 'blue',    label: 'Blue',    damageType: 'lightning' },
  { id: 'brass',   label: 'Brass',   damageType: 'fire' },
  { id: 'bronze',  label: 'Bronze',  damageType: 'lightning' },
  { id: 'copper',  label: 'Copper',  damageType: 'acid' },
  { id: 'gold',    label: 'Gold',    damageType: 'fire' },
  { id: 'green',   label: 'Green',   damageType: 'poison' },
  { id: 'red',     label: 'Red',     damageType: 'fire' },
  { id: 'silver',  label: 'Silver',  damageType: 'cold' },
  { id: 'white',   label: 'White',   damageType: 'cold' },
];
