/** Status for a class or race in the character creation wizard. */
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
  halfling: {
    status: 'disabled',
    reason: 'Halfling is temporarily disabled — Lucky (reroll 1s) and Brave (frightened advantage) have no engine support. Both signature racial traits are non-functional.',
  },
  tiefling: {
    status: 'disabled',
    reason: 'Tiefling is temporarily disabled — Hellish Resistance (fire) does not apply, and Infernal Legacy spells (thaumaturgy, hellish rebuke, darkness) are not mechanically castable at the engine level.',
  },
  gnome: {
    status: 'warning',
    reason: 'Gnome Cunning (INT/WIS/CHA save advantage vs magic) has no engine support — saves do not auto-apply advantage. Core chassis (+2 INT, darkvision 60) works correctly.',
  },
  elf: {
    status: 'warning',
    reason: 'Keen Senses (Perception proficiency) is not auto-applied during character creation. +1 INT is a High-Elf subrace bonus baked into base Elf. Fey Ancestry (charm/sleep immunity) works.',
  },
  'half-elf': {
    status: 'warning',
    reason: 'Skill Versatility (+2 skill proficiencies) is not auto-applied during creation. Extra language choice not granted. Flexible ASI and Fey Ancestry work correctly.',
  },
};

const RACE_OK_REASONS: Record<string, string> = {
  human: 'All racial features (+1 all stats, speed 30, medium) are fully wired and working correctly.',
  dwarf: 'Dwarven Resilience (poison save advantage and damage resistance) is fully wired. Darkvision 60. Subrace variants not available.',
  dragonborn: 'Breath Weapon is fully wired with scaling DC and damage dice. Draconic ancestry system works. Damage resistance is narrative-only.',
  'half-orc': 'Savage Attacks (crit bonus die) is wired. Relentless Endurance pool exists. Darkvision 60 works.',
};

/* ------------------------------------------------------------------ */
/*  CLASSES                                                            */
/* ------------------------------------------------------------------ */

const CLASS_ASSESSMENTS: AssessmentMap = {
  monk: {
    status: 'disabled',
    reason: 'Monk is temporarily disabled — the Ki resource system has no engine handler. Flurry of Blows, Stunning Strike, Patient Defense, and Step of the Wind cannot function mechanically.',
  },
  druid: {
    status: 'disabled',
    reason: 'Druid is temporarily disabled — Wild Shape has no functioning resource handler (pool exists but cannot be spent), and the shapeshifting tool does not consume charges. Two disjoint systems.',
  },
  barbarian: {
    status: 'disabled',
    reason: 'Barbarian is temporarily disabled — Rage damage bonus and B/P/S resistance are not applied by the engine. The Rage framework exists but delivers none of its mechanical benefits.',
  },
  bard: {
    status: 'warning',
    reason: 'Bardic Inspiration has no mechanical die — cannot be given or rolled. Magical Secrets (L10/14/18) are not implemented. Full CHA casting with ritual support works.',
  },
  cleric: {
    status: 'warning',
    reason: 'Domain spells are not auto-granted. Channel Divinity pool exists but cannot be spent. Destroy Undead only supports CR 1/2. Full WIS casting and Life Domain armor proficiency work.',
  },
  paladin: {
    status: 'warning',
    reason: 'Divine Smite has zero engine support — cannot expend spell slots for radiant damage on a hit. Oath spells are not granted. Lay on Hands and half-casting work.',
  },
  ranger: {
    status: 'warning',
    reason: 'Favored Enemy and Natural Explorer choices are not persisted on the character. All subclass features are narrative-only. Half-casting works as a martial caster.',
  },
  sorcerer: {
    status: 'warning',
    reason: 'Metamagic has no engine support — sorcery points exist but cannot be spent on any options. Draconic Resilience (+1 HP/level, AC 13+DEX) works. Full CHA casting works.',
  },
};

const CLASS_OK_REASONS: Record<string, string> = {
  wizard: 'Full prepared casting, Arcane Recovery (with dedicated modal), ritual casting, and spellbook management all work. The most complete caster in the engine.',
  warlock: 'Pact Magic fully works with short-rest recovery and max-slot-level casting. Mystic Arcanum (L6-9) is missing at high levels but core class functions well.',
  fighter: 'Second Wind and Great Weapon Fighting work mechanically. Action Surge pool is tracked. Indomitable pool tracked. A reliable martial class with solid engine support.',
  rogue: 'Sneak Attack dice calculate and scale correctly. Slippery Mind (WIS save proficiency at L15) is wired. A reliable skill-and-damage class.',
};

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export function getRaceAssessment(raceId: string): AssessmentEntry {
  const found = RACE_ASSESSMENTS[raceId];
  if (found) return found;
  const ok = RACE_OK_REASONS[raceId];
  if (ok) return { status: 'ok', reason: ok };
  return { status: 'ok', reason: 'All racial features are wired and working correctly.' };
}

export function getClassAssessment(classId: string): AssessmentEntry {
  const found = CLASS_ASSESSMENTS[classId];
  if (found) return found;
  const ok = CLASS_OK_REASONS[classId];
  if (ok) return { status: 'ok', reason: ok };
  return { status: 'ok', reason: 'All class core features have engine support.' };
}
