/**
 * Glossary of jargon terms surfaced in the Compendium Glossary tab.
 * Pure data — no JSX, no engine calls.
 */

export interface GlossaryEntry {
  term: string;
  /** Short definition (1–2 sentences). */
  definition: string;
  /** Related terms shown as "see also" links. */
  seeAlso?: string[];
  /** Optional category used for filtering. */
  category?: 'combat' | 'magic' | 'stats' | 'progression' | 'equipment' | 'general';
}

/** Alphabetized jargon glossary. Sorted by lowercased term, ascending. */
export const GLOSSARY: GlossaryEntry[] = [
  {
    term: 'Ability Check',
    definition: 'A d20 + relevant stat modifier (+ proficiency if skilled) rolled to attempt a non-combat action like climbing, lying, or recalling lore.',
    seeAlso: ['Stat', 'Proficiency'],
    category: 'general',
  },
  {
    term: 'AC (Armor Class)',
    definition: 'The target number an attack roll must meet or beat to hit. Calculated from armor, Dexterity, shields, and bonuses.',
    seeAlso: ['Stat', 'Cover'],
    category: 'combat',
  },
  {
    term: 'Action',
    definition: 'One of the main activities you can take on your turn (Attack, Cast a Spell, Dash, Dodge, etc.). You get one per turn.',
    seeAlso: ['Bonus Action', 'Reaction'],
    category: 'combat',
  },
  {
    term: 'Advantage',
    definition: 'Roll two d20s and use the higher result. Commonly granted by attacking a prone target (in melee) or having an ally distract your foe.',
    seeAlso: ['Disadvantage'],
    category: 'combat',
  },
  {
    term: 'ASI',
    definition: 'Ability Score Improvement. At levels 4, 8, 12, 16, 19 you can increase one stat by 2, two stats by 1 each, or take a feat instead.',
    seeAlso: ['Feat', 'Stat'],
    category: 'progression',
  },
  {
    term: 'Attack Roll',
    definition: 'A d20 + relevant modifier (STR/DEX for weapons, spellcasting stat for spells) + proficiency, compared against the target\'s AC.',
    seeAlso: ['AC (Armor Class)', 'Proficiency'],
    category: 'combat',
  },
  {
    term: 'Bonus Action',
    definition: 'A secondary, quicker action available if a spell or feature explicitly grants it (e.g. casting Healing Word). You get at most one per turn.',
    seeAlso: ['Action', 'Reaction'],
    category: 'combat',
  },
  {
    term: 'Cantrip',
    definition: 'A level 0 spell that can be cast without expending a spell slot. Damage scales with character level.',
    seeAlso: ['Spell Slot'],
    category: 'magic',
  },
  {
    term: 'Concentration',
    definition: 'Maintaining a spell over multiple turns. You can only concentrate on ONE spell at a time. Damage forces a CON save or the spell ends.',
    seeAlso: ['Saving Throw'],
    category: 'magic',
  },
  {
    term: 'Condition',
    definition: 'A temporary state affecting a creature (blinded, poisoned, frightened, etc.). Often ends on a save or after a duration.',
    seeAlso: ['Saving Throw'],
    category: 'combat',
  },
  {
    term: 'Cover',
    definition: 'Physical obstruction granting AC and DEX save bonuses: half (+2), three-quarters (+5), total (cannot be targeted).',
    seeAlso: ['AC (Armor Class)'],
    category: 'combat',
  },
  {
    term: 'CR (Challenge Rating)',
    definition: 'A monster\'s overall threat level. Used by the GM to award XP. Higher CR = more XP.',
    seeAlso: ['XP (Experience Points)'],
    category: 'combat',
  },
  {
    term: 'Critical Hit',
    definition: 'A natural 20 on an attack roll. Roll all damage dice twice and add them together.',
    seeAlso: ['Attack Roll'],
    category: 'combat',
  },
  {
    term: 'Damage Type',
    definition: 'The kind of damage dealt (slashing, fire, necrotic, etc.). Creatures may resist, be immune to, or be vulnerable to specific types.',
    category: 'combat',
  },
  {
    term: 'DC (Difficulty Class)',
    definition: 'The target number for a saving throw or ability check. Set by the GM or spell. Easy DC 10, Medium DC 15, Hard DC 20.',
    seeAlso: ['Saving Throw', 'Ability Check'],
    category: 'general',
  },
  {
    term: 'Death Save',
    definition: 'A special d20 roll (no modifier) made at 0 HP. 10+ = success, <10 = failure. 3 successes = stable; 3 failures = death. Nat 20 = 2 successes; nat 1 = 2 failures.',
    seeAlso: ['HP (Hit Points)'],
    category: 'combat',
  },
  {
    term: 'Disadvantage',
    definition: 'Roll two d20s and use the lower result. Commonly imposed by being frightened, poisoned, or attacking while prone.',
    seeAlso: ['Advantage'],
    category: 'combat',
  },
  {
    term: 'Exhaustion',
    definition: 'A cumulative debuff (6 levels): 1) disadvantage on ability checks, 2) speed halved, 3) disadvantage on attacks & saves, 4) HP max halved, 5) speed 0, 6) death. Removed one level per Long Rest.',
    seeAlso: ['Long Rest'],
    category: 'combat',
  },
  {
    term: 'Feat',
    definition: 'A special ability or perk chosen instead of an ASI at levels 4, 8, 12, 16, 19. Each feat has its own prerequisites.',
    seeAlso: ['ASI'],
    category: 'progression',
  },
  {
    term: 'Hit Die',
    definition: 'A die (d6/d8/d10/d12 based on class) used during a Short Rest to recover HP. You have one per level. Long Rest restores half.',
    seeAlso: ['Short Rest', 'Long Rest'],
    category: 'stats',
  },
  {
    term: 'HP (Hit Points)',
    definition: 'Your health pool. At 0 you fall unconscious and begin making death saves. Restored by rests, healing spells, and potions.',
    seeAlso: ['Death Save', 'Hit Die'],
    category: 'stats',
  },
  {
    term: 'Initiative',
    definition: 'A d20 + DEX modifier rolled at the start of combat. Determines turn order for the entire fight.',
    seeAlso: ['Stat'],
    category: 'combat',
  },
  {
    term: 'Known Spell',
    definition: 'A spell permanently learned (bard, sorcerer, warlock, ranger). Cannot be changed except on level-up.',
    seeAlso: ['Prepared Spell'],
    category: 'magic',
  },
  {
    term: 'Long Rest',
    definition: '8 hours of rest. Restores all HP, half of Hit Dice, all spell slots (except Warlock pact slots which refresh on Short Rest), and reduces exhaustion by 1. 24-hour cooldown.',
    seeAlso: ['Short Rest', 'Exhaustion'],
    category: 'general',
  },
  {
    term: 'Modifier',
    definition: 'A bonus or penalty derived from an ability score: (score − 10) / 2, rounded down. Applied to d20 rolls tied to that stat.',
    seeAlso: ['Stat', 'Proficiency'],
    category: 'stats',
  },
  {
    term: 'Prepared Spell',
    definition: 'A spell your class allows you to swap each day (cleric, druid, paladin, wizard). You choose a subset from your known list after a Long Rest.',
    seeAlso: ['Known Spell', 'Spell Slot'],
    category: 'magic',
  },
  {
    term: 'Proficiency',
    definition: 'A bonus you add to rolls you are trained in. Scales with level: +2 at L1, +3 at L5, +4 at L9, +5 at L13, +6 at L17.',
    seeAlso: ['Stat', 'Modifier'],
    category: 'progression',
  },
  {
    term: 'Reaction',
    definition: 'A special action taken in response to a trigger (e.g. Attack of Opportunity, Shield spell). You get one per round.',
    seeAlso: ['Action', 'Bonus Action'],
    category: 'combat',
  },
  {
    term: 'Ritual',
    definition: 'A spell castable without a slot by adding 10 minutes to its casting time. Only some spells have the ritual tag.',
    category: 'magic',
  },
  {
    term: 'Saving Throw',
    definition: 'A d20 + stat modifier (+ proficiency if trained) rolled to resist a spell, trap, or effect. Each save is tied to one ability score.',
    seeAlso: ['DC (Difficulty Class)', 'Stat'],
    category: 'combat',
  },
  {
    term: 'Short Rest',
    definition: '1 hour of rest. Lets you spend Hit Dice to recover HP and refreshes some class features (Fighter Second Wind, Warlock pact slots).',
    seeAlso: ['Long Rest', 'Hit Die'],
    category: 'general',
  },
  {
    term: 'Spell Slot',
    definition: 'A resource consumed when casting a leveled spell. Slots are tiered L1–L9 and restored on a Long Rest. A higher-level slot can always power a lower-level spell.',
    seeAlso: ['Long Rest'],
    category: 'magic',
  },
  {
    term: 'Stat',
    definition: 'One of six ability scores: STR, DEX, CON, INT, WIS, CHA. Ranges 1–20 (typical 8–20 for PCs). Determines modifiers.',
    seeAlso: ['Modifier'],
    category: 'stats',
  },
  {
    term: 'Temp HP',
    definition: 'Temporary hit points — a buffer absorbed before your real HP. Do not stack; only the highest applies.',
    category: 'stats',
  },
  {
    term: 'XP (Experience Points)',
    definition: 'Earned for overcoming challenges (combat, skill checks, exploration). Filling the XP bar levels you up.',
    seeAlso: ['CR (Challenge Rating)'],
    category: 'progression',
  },
];
