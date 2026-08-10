/**
 * Condition and exhaustion reference data, consumed by the live character sheet,
 * the Compendium Conditions tab, and tooltip rollers. Single source of truth.
 */

/** Display metadata for a single condition: icon, short summary, mechanical effects. */
export interface ConditionInfoEntry {
  /** Font Awesome icon name (without the `fas ` prefix). */
  icon: string;
  /** One-sentence summary shown in compact lists. */
  summary: string;
  /** Tone used by UI tinting (debuffs are red, buffs are emerald, neutral conditions use red by default). */
  tone?: 'debuff' | 'buff' | 'neutral';
  /** Long-form mechanical effects (bulleted when surfaced in the Compendium). */
  effects?: string[];
}

/**
 * Lookup table mapping condition IDs to their display icon, summary, and effects.
 * Merges the previous in-component duplicates (ConditionsDisplay.tsx and CharacterSheet.tsx).
 */
export const CONDITION_INFO: Record<string, ConditionInfoEntry> = {
  blinded: {
    icon: 'fa-eye-slash',
    summary: 'Auto-fail sight checks; attacks have disadvantage; attacks against you have advantage.',
    effects: [
      'You automatically fail any ability check that requires sight.',
      'Attack rolls against you have advantage, and your attack rolls have disadvantage.',
    ],
  },
  charmed: {
    icon: 'fa-heart',
    summary: "Can't attack charmer; charmer has advantage on social checks against you.",
    effects: [
      'You cannot attack the charmer or target them with harmful abilities.',
      'The charmer has advantage on ability checks to interact socially with you.',
    ],
  },
  deafened: {
    icon: 'fa-deaf',
    summary: 'Auto-fail hearing checks; immune to sonic effects.',
    effects: [
      'You automatically fail any ability check that requires hearing.',
      'You are immune to effects that rely on sound (e.g. thunder damage riders that require hearing).',
    ],
  },
  frightened: {
    icon: 'fa-ghost',
    summary: 'Disadvantage on ability checks/attacks while source is in sight; cannot move closer to source.',
    effects: [
      'You have disadvantage on ability checks and attack rolls while the source of fear is within sight.',
      'You cannot willingly move closer to the source of your fear.',
    ],
  },
  grappled: {
    icon: 'fa-hand',
    summary: 'Speed becomes 0.',
    effects: [
      'Your speed becomes 0, and you cannot benefit from any bonus to your speed.',
      'The condition ends if the grappler is moved away, incapacitated, or you move out of reach.',
    ],
  },
  incapacitated: {
    icon: 'fa-ban',
    summary: "Can't take actions or reactions.",
    effects: [
      'You cannot take actions or reactions.',
      'Your concentration is broken (if any).',
      'You cannot speak.',
    ],
  },
  invisible: {
    icon: 'fa-user-secret',
    summary: 'Attacks against you have disadvantage; your attacks have advantage.',
    effects: [
      'Attack rolls against you have disadvantage.',
      'Your attack rolls have advantage.',
    ],
  },
  paralyzed: {
    icon: 'fa-person-falling',
    summary: "Incapacitated, can't move or speak; attacks against you have advantage; hits within 5 ft auto-crit.",
    effects: [
      'You are incapacitated and cannot move or speak.',
      'Attack rolls against you have advantage.',
      'Any attack that hits you within 5 ft is a critical hit if the attacker can see you.',
      'You automatically fail Strength and Dexterity saving throws.',
    ],
  },
  petrified: {
    icon: 'fa-cube',
    summary: 'Incapacitated, resistant to all damage, immune to poison/disease.',
    effects: [
      'You are transformed into a solid inanimate substance along with all your gear.',
      'Your weight increases by a factor of ten, and you cease aging.',
      'You are incapacitated and unaware of your surroundings.',
      'Attack rolls against you have advantage.',
      'You automatically fail Strength and Dexterity saving throws.',
      'You have resistance to all damage and are immune to poison and disease.',
    ],
  },
  poisoned: {
    icon: 'fa-skull-crossbones',
    summary: 'Disadvantage on attack rolls and ability checks.',
    effects: [
      'You have disadvantage on attack rolls and ability checks.',
    ],
  },
  prone: {
    icon: 'fa-person-falling',
    summary: 'Disadvantage on attacks; melee attacks against you have advantage, ranged have disadvantage.',
    effects: [
      'Your only movement option is to crawl (each foot costs 1 extra foot).',
      'You have disadvantage on attack rolls.',
      'Attack rolls against you have advantage if the attacker is within 5 ft, otherwise disadvantage.',
      'Standing up costs half your speed.',
    ],
  },
  restrained: {
    icon: 'fa-link',
    summary: 'Speed 0; attacks against you have advantage; disadvantage on DEX saves.',
    effects: [
      'Your speed becomes 0, and you cannot benefit from any bonus to your speed.',
      'Attack rolls against you have advantage, and your attack rolls have disadvantage.',
      'You have disadvantage on Dexterity saving throws.',
    ],
  },
  stunned: {
    icon: 'fa-dizzy',
    summary: "Incapacitated, can't move; attacks against you have advantage; auto-fail STR/DEX saves.",
    effects: [
      'You are incapacitated and cannot move.',
      'You can speak only falteringly.',
      'Attack rolls against you have advantage.',
      'You automatically fail Strength and Dexterity saving throws.',
    ],
  },
  unconscious: {
    icon: 'fa-bed',
    summary: 'Incapacitated, can\'t move/speak; attacks against you have advantage; hits within 5 ft auto-crit.',
    effects: [
      'You are incapacitated, cannot move or speak, and are unaware of your surroundings.',
      'You drop whatever you are holding and fall prone.',
      'Attack rolls against you have advantage.',
      'Any attack that hits you within 5 ft is a critical hit if the attacker can see you.',
      'You automatically fail Strength and Dexterity saving throws.',
    ],
  },
  bane: {
    icon: 'fa-minus-circle',
    tone: 'debuff',
    summary: 'Roll 1d4 and subtract from attack rolls and saving throws.',
    effects: [
      'While affected, subtract 1d4 from every attack roll and saving throw you make.',
    ],
  },
  bless: {
    icon: 'fa-plus-circle',
    tone: 'buff',
    summary: 'Roll 1d4 and add to attack rolls and saving throws.',
    effects: [
      'While affected, add 1d4 to every attack roll and saving throw you make.',
    ],
  },
  'mage-armor-ac': {
    icon: 'fa-shield-halved',
    tone: 'buff',
    summary: '+3 AC while unarmored (Mage Armor).',
    effects: ['+3 AC bonus while you are not wearing armor.'],
  },
  'shield-ac': {
    icon: 'fa-shield',
    tone: 'buff',
    summary: '+5 AC bonus (Shield reaction).',
    effects: ['+5 AC bonus until the start of your next turn.'],
  },
  'shield-of-faith-ac': {
    icon: 'fa-shield-halved',
    tone: 'buff',
    summary: '+2 AC bonus (Shield of Faith).',
    effects: ['+2 AC bonus while the spell is active.'],
  },
  heroism: {
    icon: 'fa-medal',
    tone: 'buff',
    summary: 'Immune to frightened; temporary HP each turn.',
    effects: [
      'You are immune to the frightened condition.',
      'At the start of each of your turns, you gain temporary HP equal to the caster\'s spellcasting ability modifier.',
    ],
  },
  'hunters-mark': {
    icon: 'fa-bullseye',
    tone: 'buff',
    summary: '+1d6 weapon damage vs marked target.',
    effects: ['Deal an extra 1d6 weapon damage to the marked target on every hit.'],
  },
  'divine-favor': {
    icon: 'fa-sun',
    tone: 'buff',
    summary: '+1d4 radiant damage on weapon hits.',
    effects: ['Your weapon attacks deal an extra 1d4 radiant damage on every hit.'],
  },
  'branding-smite': {
    icon: 'fa-eye',
    tone: 'buff',
    summary: 'Next hit deals +2d6 radiant and prevents invisibility.',
    effects: [
      'The next time you hit a creature with a weapon attack it takes an extra 2d6 radiant damage.',
      'The target cannot become invisible until the spell ends.',
    ],
  },
  'magic-weapon': {
    icon: 'fa-wand-magic',
    tone: 'buff',
    summary: '+1 to attack and damage rolls with affected weapon.',
    effects: ['The affected weapon gains a +1 bonus to attack rolls and damage rolls.'],
  },
};

/** Display metadata for a single exhaustion level: summary of the cumulative effects. */
export interface ExhaustionLevelInfo {
  level: number;
  label: string;
  description: string;
}

/**
 * The six levels of exhaustion (per SRD 5e). Effects are cumulative.
 * Adding entries here fixes the previously missing data source noted in bugs.md C4/C5.
 */
export const EXHAUSTION_LEVELS: ExhaustionLevelInfo[] = [
  { level: 1, label: 'Disadvantaged', description: 'Disadvantage on ability checks.' },
  { level: 2, label: 'Slowed', description: 'Speed halved.' },
  { level: 3, label: 'Strained', description: 'Disadvantage on attack rolls and saving throws.' },
  { level: 4, label: 'Wounded', description: 'Hit point maximum halved.' },
  { level: 5, label: 'Crippled', description: 'Speed reduced to 0.' },
  { level: 6, label: 'Dead', description: 'Death.' },
];

/**
 * Returns the cumulative effects text for a given exhaustion level (1-6).
 * Out-of-range values return an empty string.
 */
export function getExhaustionSummary(level: number): string {
  if (!level || level < 1) return '';
  return EXHAUSTION_LEVELS.slice(0, level).map(l => l.description).join(' ');
}
