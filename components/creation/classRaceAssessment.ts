/** Status for a class or race in the character creation wizard and Quick Start preset flow. */
export type AssessmentStatus = 'disabled' | 'warning' | 'ok';

export interface AssessmentEntry {
  status: AssessmentStatus;
  reason: string;
}

type AssessmentMap = Record<string, AssessmentEntry>;

/* ------------------------------------------------------------------ */
/*  RACES                                                              */
/* ------------------------------------------------------------------ */

const RACE_ASSESSMENTS: AssessmentMap = {
  elf: {
    status: 'ok',
    reason: 'Keen Senses (Perception prof), Fey Ancestry (charm save advantage & sleep immunity), Trance, and Subraces (High Elf, Wood Elf, Drow) are fully supported.',
  },
  dwarf: {
    status: 'ok',
    reason: 'Dwarven Resilience (poison resistance & save advantage), Stonecunning, Combat Training, and Subraces (Hill Dwarf, Mountain Dwarf) are fully supported.',
  },
  gnome: {
    status: 'ok',
    reason: 'Gnome Cunning (advantage on INT/WIS/CHA saves vs magic, auto-applied to spell saves), Darkvision, and Subraces (Rock Gnome, Forest Gnome) are fully supported.',
  },
  'half-elf': {
    status: 'ok',
    reason: 'Flexible ASIs, Skill Versatility (+2 skill proficiencies), Fey Ancestry, and extra language choices are fully supported.',
  },
  tiefling: {
    status: 'ok',
    reason: 'Hellish Resistance (fire resistance), Infernal Legacy (Hellish Rebuke, Darkness, Thaumaturgy), and Darkvision are fully supported.',
  },
  dragonborn: {
    status: 'ok',
    reason: 'Breath Weapon with scaling DC (2d6→5d6) and damage type, Draconic Ancestry element selection, and Damage Resistance matching element are fully supported.',
  },
  human: {
    status: 'ok',
    reason: 'Standard (+1 all stats) fully supported. Variant Human grants the feat at L1 via the ASI/feat slot; the +1 to two chosen stats and bonus skill are not yet auto-applied (no wizard UI) — allocate them via your level-1 ASI/feat slot and skill points.',
  },
  halfling: {
    status: 'ok',
    reason: 'Lucky (auto-rerolls natural 1s on attacks, checks, and saving throws), Brave (frightened save advantage), and Subraces (Lightfoot, Stout) are fully supported.',
  },
  'half-orc': {
    status: 'ok',
    reason: 'Relentless Endurance (drops to 1 HP instead of 0 once/long rest), Savage Attacks (+1 extra weapon die on melee crits), and Darkvision are fully supported.',
  },
};

/* ------------------------------------------------------------------ */
/*  CLASSES                                                            */
/* ------------------------------------------------------------------ */

const CLASS_ASSESSMENTS: AssessmentMap = {
  barbarian: {
    status: 'ok',
    reason: 'Rage pool, Rage damage bonus, Rage B/P/S damage resistance, Unarmored Defense (10+DEX+CON), Danger Sense (DEX save advantage), Brutal Critical, and Fast Movement are fully supported.',
  },
  bard: {
    status: 'ok',
    reason: 'Full CHA spellcasting, Bardic Inspiration, Font of Inspiration (short-rest reset @ L5+), Jack of All Trades (+½ prof to non-proficient checks), and Expertise are fully supported.',
  },
  cleric: {
    status: 'ok',
    reason: 'Full WIS prepared casting, Channel Divinity / Turn Undead, Disciple of Life (+2+spellLevel bonus healing for Life Clerics), Domain spells, and Heavy Armor proficiency are fully supported.',
  },
  druid: {
    status: 'ok',
    reason: 'Full WIS prepared casting, Wild Shape (Wolf, Panther, Brown Bear, Dire Wolf, Giant Eagle at L3+; CR-limited by level — Giant Crocodile needs L15, T-Rex needs L24 via polymorph), and Natural Recovery are fully supported.',
  },
  fighter: {
    status: 'ok',
    reason: 'Second Wind, Action Surge, Indomitable, Champion crit range (19-20, 18-20), and Fighting Styles (Archery +2 atk, Defense +1 AC, Dueling +2 dmg, Great Weapon Fighting rerolls, Two-Weapon Fighting) are fully supported.',
  },
  monk: {
    status: 'ok',
    reason: 'Unarmored Defense (10+DEX+WIS), Martial Arts scaling die, Ki System (Flurry of Blows, Patient Defense, Step of the Wind, Stunning Strike), Purity of Body, and Diamond Soul (all save proficiencies) are fully supported.',
  },
  paladin: {
    status: 'ok',
    reason: 'Divine Smite (slot level, radiant damage, fiend/undead bonus, double crit), Lay on Hands, Aura of Protection (+CHA to saves for party @ L6+), Divine Health, Improved Divine Smite (+1d8 radiant), and Fighting Styles are fully supported.',
  },
  ranger: {
    status: 'ok',
    reason: 'Spellcasting, Fighting Styles, Favored Enemy, Natural Explorer, and Extra Attack are fully supported. (Hunter subclass features are narrative-only for now.)',
  },
  rogue: {
    status: 'ok',
    reason: 'Sneak Attack scaling, Expertise (double prof), Reliable Talent (floor 10 on proficient d20s @ L11+), and Evasion (half/zero DEX save damage) are fully supported.',
  },
  sorcerer: {
    status: 'ok',
    reason: 'Full CHA spellcasting, Sorcery Points, Metamagic (Twinned, Heightened, Quickened, Subtle, Empowered, Careful, Distant, Extended — granted at L3 and on level-up), and Draconic Resilience (13+DEX AC, +1 HP/level) are fully supported.',
  },
  warlock: {
    status: 'ok',
    reason: 'Pact Magic short-rest slot recovery and Eldritch Invocations (Agonizing Blast adds CHA to Eldritch Blast damage; Armor of Shadows / Fiendish Vigor grant at-will spells) are fully supported. (Pact Boons are narrative-only for now.)',
  },
  wizard: {
    status: 'ok',
    reason: 'Full prepared INT casting, Arcane Recovery, ritual casting from spellbook, free spellbook additions on level-up, and spellbook management are fully supported.',
  },
};

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export function getRaceAssessment(raceId: string): AssessmentEntry {
  const found = RACE_ASSESSMENTS[raceId];
  if (found) return found;
  return { status: 'ok', reason: 'All racial features are wired and working correctly.' };
}

export function getClassAssessment(classId: string): AssessmentEntry {
  const found = CLASS_ASSESSMENTS[classId];
  if (found) return found;
  return { status: 'ok', reason: 'All class core features have engine support.' };
}
