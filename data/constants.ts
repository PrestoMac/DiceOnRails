import { XPTableEntry, StartingLocation } from '../types';

export interface SkillDefinition {
  name: string;
  label: string;
  stat: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  description: string;
  /** Font Awesome icon for the skill. */
  icon?: string;
}

export const SKILLS_LIST: readonly SkillDefinition[] = [
  { name: 'athletics', label: 'Athletics', stat: 'str', description: 'Climbing, jumping, swimming, and physical force', icon: 'fa-person-running' },
  { name: 'acrobatics', label: 'Acrobatics', stat: 'dex', description: 'Balance, flips, tumbling, and nimble moves', icon: 'fa-person-skating' },
  { name: 'sleight of hand', label: 'Sleight of Hand', stat: 'dex', description: 'Manual dexterity, picking pockets, and tricks', icon: 'fa-hand-sparkles' },
  { name: 'stealth', label: 'Stealth', stat: 'dex', description: 'Sneaking, moving silently, and hiding', icon: 'fa-user-secret' },
  { name: 'arcana', label: 'Arcana', stat: 'int', description: 'Spells, magical items, and planes of existence', icon: 'fa-wand-magic-sparkles' },
  { name: 'history', label: 'History', stat: 'int', description: 'Historical events, legendary figures, and lore', icon: 'fa-book' },
  { name: 'investigation', label: 'Investigation', stat: 'int', description: 'Searching for clues, solving mysteries', icon: 'fa-magnifying-glass' },
  { name: 'nature', label: 'Nature', stat: 'int', description: 'Plants, animals, weather, and wild lands', icon: 'fa-tree' },
  { name: 'religion', label: 'Religion', stat: 'int', description: 'Deities, holy symbols, cults, and prayers', icon: 'fa-cross' },
  { name: 'animal handling', label: 'Animal Handling', stat: 'wis', description: 'Taming beasts, riding mounts, sensing animal intent', icon: 'fa-paw' },
  { name: 'insight', label: 'Insight', stat: 'wis', description: 'Sensing motives, spotting lies, reading body language', icon: 'fa-eye' },
  { name: 'medicine', label: 'Medicine', stat: 'wis', description: 'Healing wounds, diagnosing diseases', icon: 'fa-heart-pulse' },
  { name: 'perception', label: 'Perception', stat: 'wis', description: 'Noticing hidden things, listening, alertness', icon: 'fa-eye' },
  { name: 'survival', label: 'Survival', stat: 'wis', description: 'Foraging, tracking, building fire, navigating', icon: 'fa-compass' },
  { name: 'deception', label: 'Deception', stat: 'cha', description: 'Lying, putting on disguises, acting', icon: 'fa-masks-theater' },
  { name: 'intimidation', label: 'Intimidation', stat: 'cha', description: 'Coercing, threatening, displays of authority', icon: 'fa-skull' },
  { name: 'performance', label: 'Performance', stat: 'cha', description: 'Entertaining, singing, acting, playing music', icon: 'fa-guitar' },
  { name: 'persuasion', label: 'Persuasion', stat: 'cha', description: 'Diplomacy, honest arguments, negotiating', icon: 'fa-comments' },
];

export const XP_TABLE: readonly XPTableEntry[] = Object.freeze([
  { level: 1, xpRequired: 0 },
  { level: 2, xpRequired: 300 },
  { level: 3, xpRequired: 900 },
  { level: 4, xpRequired: 2100 },
  { level: 5, xpRequired: 4600 },
  { level: 6, xpRequired: 9000 },
  { level: 7, xpRequired: 15000 },
  { level: 8, xpRequired: 23000 },
  { level: 9, xpRequired: 34000 },
  { level: 10, xpRequired: 48000 },
  { level: 11, xpRequired: 65000 },
  { level: 12, xpRequired: 85000 },
  { level: 13, xpRequired: 108000 },
  { level: 14, xpRequired: 134000 },
  { level: 15, xpRequired: 164000 },
  { level: 16, xpRequired: 198000 },
  { level: 17, xpRequired: 236000 },
  { level: 18, xpRequired: 278000 },
  { level: 19, xpRequired: 325000 },
  { level: 20, xpRequired: 378000 },
]);

export const STAT_POINTS_PER_LEVEL = 2 as const;
export const MAX_STAT_VALUE = 20 as const;

export const ASI_LEVELS: readonly number[] = Object.freeze([1, 4, 8, 12, 16, 19]);

export const FALLBACK_STARTING_LOCATION: StartingLocation = {
  name: "The Rusty Tankard Tavern",
  description: "A worn but welcoming establishment common room, filled with pipe smoke and the scent of roasted meats.",
  introHook: "The air is thick with smoke and the smell of roasted meats. A hooded figure at the corner table catches your eye as you settle into a chair."
};
