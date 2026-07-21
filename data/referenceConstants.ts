/**
 * Pure-data reference constants surfaced in the Compendium and live tooltips.
 * Includes stat/skill/derived-stat metadata, rest mechanics, death saves,
 * currency, and the buff sources set previously inlined in CharacterSheet.tsx.
 */

/** Metadata describing a single ability score (stat). */
export interface StatInfoEntry {
  key: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  label: string;
  governs: string;
  shortDescription: string;
}

/** Reference data for each of the six ability scores. */
export const STAT_INFO: Record<string, StatInfoEntry> = {
  str: {
    key: 'str',
    label: 'Strength',
    governs: 'Athletics, melee weapon attacks, carrying capacity, breaking down doors.',
    shortDescription: 'Physical power, athletic ability, and melee force.',
  },
  dex: {
    key: 'dex',
    label: 'Dexterity',
    governs: 'Acrobatics, Sleight of Hand, Stealth, ranged and finesse attacks, AC, initiative.',
    shortDescription: 'Agility, reflexes, balance, and aim.',
  },
  con: {
    key: 'con',
    label: 'Constitution',
    governs: 'Hit Points per level, Constitution saving throws (concentration, poison).',
    shortDescription: 'Health, stamina, and resilience.',
  },
  int: {
    key: 'int',
    label: 'Intelligence',
    governs: 'Arcana, History, Investigation, Nature, Religion; Wizard spellcasting.',
    shortDescription: 'Memory, reasoning, and analytical skill.',
  },
  wis: {
    key: 'wis',
    label: 'Wisdom',
    governs: 'Animal Handling, Insight, Medicine, Perception, Survival; Cleric/Druid spellcasting.',
    shortDescription: 'Awareness, intuition, and willpower.',
  },
  cha: {
    key: 'cha',
    label: 'Charisma',
    governs: 'Deception, Intimidation, Performance, Persuasion; Bard/Paladin/Sorcerer/Warlock spellcasting.',
    shortDescription: 'Force of personality, leadership, and charm.',
  },
};

/** Metadata for derived stats shown on the character sheet. */
export interface DerivedStatInfoEntry {
  key: string;
  label: string;
  formula: string;
  description: string;
}

/** Formulas and explanations for derived stats (AC, HP, Spell DC, etc.). */
export const DERIVED_STAT_INFO: Record<string, DerivedStatInfoEntry> = {
  ac: {
    key: 'ac',
    label: 'Armor Class',
    formula: '10 + DEX mod (unarmored) | light: 11 + DEX | medium: 13 + min(DEX,2) | heavy: fixed',
    description: 'The target an attack roll must meet or exceed to hit you. Armor type determines how much DEX is applied.',
  },
  hp: {
    key: 'hp',
    label: 'Hit Points',
    formula: 'Hit Die + CON mod at L1, then (Hit Die + CON mod) per level',
    description: 'Your health pool. At 0 HP you fall unconscious and begin making death saves.',
  },
  initiative: {
    key: 'initiative',
    label: 'Initiative',
    formula: 'd20 + DEX modifier',
    description: 'Rolled at the start of combat to determine turn order. Higher is better.',
  },
  proficiency: {
    key: 'proficiency',
    label: 'Proficiency Bonus',
    formula: '1 + ceil(level / 4)',
    description: 'Added to attack rolls, saving throws, and skill checks you are proficient in. Scales with level.',
  },
  spellDc: {
    key: 'spellDc',
    label: 'Spell Save DC',
    formula: '8 + proficiency + spellcasting ability modifier',
    description: 'The target a creature must roll on a saving throw to resist your spell.',
  },
  spellAttack: {
    key: 'spellAttack',
    label: 'Spell Attack Modifier',
    formula: 'proficiency + spellcasting ability modifier',
    description: 'Added to your d20 when rolling a spell attack roll.',
  },
  speed: {
    key: 'speed',
    label: 'Speed',
    formula: 'Base race speed (+/- penalties)',
    description: 'How many feet you can move on your turn. Halved by grappled/exhaustion 2, zeroed by restrained/exhaustion 5.',
  },
  darkvision: {
    key: 'darkvision',
    label: 'Darkvision',
    formula: 'Racial trait',
    description: 'See in dim light as if bright, and in darkness as if dim, up to this range (in feet).',
  },
  hitDice: {
    key: 'hitDice',
    label: 'Hit Dice',
    formula: 'Class hit die (d6/d8/d10/d12)',
    description: 'Spend during a Short Rest to recover HP. Long Rest restores up to half your maximum.',
  },
};

/** Currency conversion info for the Compendium Rules tab and tooltips. */
export const CURRENCY_INFO = {
  gold: { key: 'gp', label: 'Gold Piece (GP)', short: 'GP' },
  silver: { key: 'sp', label: 'Silver Piece (SP)', short: 'SP' },
  copper: { key: 'cp', label: 'Copper Piece (CP)', short: 'CP' },
  conversion: '10 CP = 1 SP · 10 SP = 1 GP · 50 GP = 1 lb',
} as const;

/** Reference info for the Short and Long Rest mechanics. */
export interface RestInfoEntry {
  key: 'short' | 'long';
  label: string;
  duration: string;
  description: string;
  restores: string[];
}

export const REST_INFO: RestInfoEntry[] = [
  {
    key: 'short',
    label: 'Short Rest',
    duration: 'At least 1 hour',
    description: 'A brief pause to bind wounds, eat, and recover resources.',
    restores: [
      'Spend Hit Dice (up to your maximum) to recover HP',
      'Recover class resources that reset on a Short Rest (e.g. Fighter\'s Action Surge, Warlock pact slots)',
      'Does NOT restore HP automatically',
    ],
  },
  {
    key: 'long',
    label: 'Long Rest',
    duration: 'At least 8 hours (can be interrupted briefly)',
    description: 'A full night\'s rest. You must have at least 1 HP to begin one. (24-hour engine-enforced cooldown.)',
    restores: [
      'All HP restored',
      'Recover half your total Hit Dice (minimum 1)',
      'Spell slots fully restored (except Warlock pact slots — those reset on Short Rest)',
      'Reduces exhaustion by 1 level',
      'Resets all resources that recover on a Long Rest',
    ],
  },
];

/** Death save reference info. */
export const DEATH_SAVE_INFO = {
  label: 'Death Saves',
  description: 'At the start of each of your turns while at 0 HP, you make a death save (d20, no modifier unless a feat applies).',
  success: '3 successes: you become stable and stop rolling.',
  failure: '3 failures: you die.',
  nat20: 'Rolling a natural 20 counts as 2 successes.',
  nat1: 'Rolling a natural 1 counts as 2 failures.',
  takingDamage: 'Any damage suffered at 0 HP counts as 1 failure; a critical hit counts as 2.',
} as const;

/** Exhaustion quick reference mirror of data/conditionInfo.ts (kept here for the Rules tab). */
export interface ExhaustionInfoEntry {
  level: number;
  description: string;
}

export const EXHAUSTION_INFO: ExhaustionInfoEntry[] = [
  { level: 1, description: 'Disadvantage on ability checks.' },
  { level: 2, description: 'Speed halved.' },
  { level: 3, description: 'Disadvantage on attack rolls and saving throws.' },
  { level: 4, description: 'Hit point maximum halved.' },
  { level: 5, description: 'Speed reduced to 0.' },
  { level: 6, description: 'Death.' },
];

/** The set of condition sources that should be rendered as buffs (was CharacterSheet BUFF_SOURCES). */
export const BUFF_SOURCES: ReadonlySet<string> = new Set([
  'mage-armor', 'shield', 'shield-of-faith', 'barkskin',
  'heroism', 'hunters-mark', 'divine-favor', 'branding-smite', 'magic-weapon',
  'bless',
]);

/** Core combat rule references surfaced in the Compendium Rules tab. */
export const COMBAT_RULES = {
  critical: {
    label: 'Critical Hits',
    description: 'A natural 20 on an attack roll is a critical hit. Roll all of the attack\'s damage dice twice (including Sneak Attack dice) and add them together.',
  },
  concentration: {
    label: 'Concentration',
    description: 'You can only concentrate on one spell at a time. Taking damage forces a Constitution save (DC 10 or half damage, whichever is higher). Failure ends the spell.',
  },
  advantage: {
    label: 'Advantage / Disadvantage',
    description: 'Roll two d20s and use the higher (advantage) or lower (disadvantage). Effects with the same name do not stack — you either have it or you don\'t.',
  },
  cover: {
    label: 'Cover',
    description: 'Half cover: +2 AC / DEX saves. Three-quarters cover: +5. Total cover: cannot be targeted directly.',
  },
} as const;

/** Difficulty Class reference table. */
export const DC_TABLE = [
  { dc: 5, label: 'Very Easy' },
  { dc: 10, label: 'Easy' },
  { dc: 15, label: 'Medium' },
  { dc: 20, label: 'Hard' },
  { dc: 25, label: 'Very Hard' },
  { dc: 30, label: 'Nearly Impossible' },
] as const;

/** Challenge Rating to XP table (mirrors constants.ts PROGRESSION_SYSTEM_PROMPT). */
export const CR_TO_XP: Array<{ cr: string; xp: number }> = [
  { cr: '0', xp: 10 },
  { cr: '1/8', xp: 25 },
  { cr: '1/4', xp: 50 },
  { cr: '1/2', xp: 100 },
  { cr: '1', xp: 200 },
  { cr: '2', xp: 450 },
  { cr: '3', xp: 700 },
  { cr: '4', xp: 1100 },
  { cr: '5', xp: 1800 },
  { cr: '10', xp: 5900 },
];

/** Skill check XP rewards by DC (mirrors constants.ts PROGRESSION_SYSTEM_PROMPT). */
export const DC_TO_XP: Array<{ dc: number; label: string; xp: number }> = [
  { dc: 10, label: 'Easy', xp: 15 },
  { dc: 15, label: 'Medium', xp: 35 },
  { dc: 20, label: 'Hard', xp: 75 },
  { dc: 25, label: 'Very Hard', xp: 150 },
];
