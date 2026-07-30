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
  elf: {
    status: 'warning',
    reason: 'Keen Senses (Perception proficiency) is not auto-applied during character creation. Fey Ancestry charm-save advantage requires LLM cooperation (only fires when save is explicitly tagged as charm). Sleep immunity works. No subraces available.',
  },
  dwarf: {
    status: 'warning',
    reason: 'Dwarven Resilience (poison resistance + save advantage) works. Stonecunning History proficiency granted but expertise not enforced. Dwarven Combat Training weapon proficiencies NOT granted. No subraces available.',
  },
  gnome: {
    status: 'warning',
    reason: 'Gnome Cunning (INT/WIS/CHA save advantage vs magic) only works for spell saves, not all magic effects. Darkvision works. No subraces available.',
  },
  'half-elf': {
    status: 'warning',
    reason: 'Skill Versatility (+2 skill proficiencies) is not auto-applied during creation. Extra language choice not resolved. Flexible ASI system and Fey Ancestry work correctly.',
  },
  tiefling: {
    status: 'warning',
    reason: 'Hellish Resistance (fire resistance) works. Hellish Rebuke resource handler works (3d10 fire damage). Thaumaturgy cantrip and Darkness spell NOT implemented. Infernal Legacy not level-gated.',
  },
};

const RACE_OK_REASONS: Record<string, string> = {
  human: 'All racial features (+1 all stats, speed 30, medium size) are fully wired. Variant Human (feat at L1) not available.',
  halfling: 'Lucky (reroll 1s on attacks/checks) fully wired via reroll-ones reducer. Brave (frightened save advantage) wired. Halfling Nimbleness not implemented. No subraces available.',
  dragonborn: 'Breath Weapon fully wired with scaling DC (2d6→5d6) and damage type. Damage resistance from draconic ancestry works. Chromatic vs Metallic distinction not available.',
  'half-orc': 'Relentless Endurance fully wired (sets HP to 1 when at 0, once per long rest). Savage Attacks (crit bonus die) wired but uses d20 instead of weapon damage die (known bug). Menacing (Intimidation proficiency) not implemented.',
};

/* ------------------------------------------------------------------ */
/*  CLASSES                                                            */
/* ------------------------------------------------------------------ */

const CLASS_ASSESSMENTS: AssessmentMap = {
  druid: {
    status: 'disabled',
    reason: 'Druid is temporarily disabled — Wild Shape has no functioning resource handler (pool exists but cannot be spent mechanically). The polymorph_creature tool exists but is completely disconnected from the resource pool — no charge consumption, no CR limit validation. Two disjoint systems that never interact.',
  },
  monk: {
    status: 'disabled',
    reason: 'Monk is temporarily disabled — the Ki resource system has no engine handler in the use_resource switch. Flurry of Blows, Patient Defense, and Step of the Wind cannot function mechanically. Stunning Strike works but most ki abilities are prompt-only.',
  },
  ranger: {
    status: 'disabled',
    reason: 'Ranger is temporarily disabled — Favored Enemy and Natural Explorer choices are not persisted on the character. All subclass features (Hunter\'s Prey, Defensive Tactics, Multiattack) are narrative-only. Functions as a generic half-caster martial with no Ranger identity.',
  },
  warlock: {
    status: 'disabled',
    reason: 'Warlock is temporarily disabled — Eldritch Invocations system is NOT implemented at all (no Agonizing Blast, Repelling Blast, etc.). Pact Boon (Chain/Blade/Tome) not implemented. Mystic Arcanum (L6-9 spells) not implemented. Pact Magic short-rest recovery works but class has no identity without Invocations.',
  },
  barbarian: {
    status: 'warning',
    reason: 'Rage resource pool and activation work. Unarmored Defense (10+DEX+CON) works. Danger Sense (DEX save advantage) works. BUT Rage resistance to B/P/S damage is NOT mechanically enforced, and Rage damage bonus is not applied by the attack pipeline. Reckless Attack advantage/disadvantage is prompt-only.',
  },
  bard: {
    status: 'warning',
    reason: 'Full CHA spellcasting with ritual support works. Bardic Inspiration pool tracked and die scales correctly (d6→d12). BUT Bardic Inspiration has no mechanical die application — target must apply manually. Jack of All Trades, Song of Rest, and Expertise not mechanically enforced.',
  },
  cleric: {
    status: 'warning',
    reason: 'Full WIS prepared spellcasting with ritual support works. Channel Divinity: Turn Undead works. Life Domain heavy armor proficiency works. BUT domain spells are NOT auto-added to prepared list. Destroy Undead, Divine Strike, and Divine Intervention not implemented.',
  },
  fighter: {
    status: 'warning',
    reason: 'Second Wind works mechanically. Action Surge and Indomitable pools tracked correctly. Champion crit range expansion (19-20, 18-20) works. BUT Fighting Style bonuses (Archery +2, Dueling +2, Defense +1 AC) are NOT enforced. Extra Attack not mechanically enforced.',
  },
  paladin: {
    status: 'warning',
    reason: 'Lay on Hands works. Divine Smite fully implemented (consumes slot, adds radiant damage). Improved Divine Smite (L11) works. Half-casting works. BUT Aura of Protection (CHA to saves) not implemented. Aura of Courage not implemented. Oath spells not granted.',
  },
  rogue: {
    status: 'warning',
    reason: 'Sneak Attack dice calculate and scale correctly (1d6→10d6). BUT Sneak Attack conditions (advantage, ally adjacency, finesse/ranged weapon) are NOT checked — relies on LLM honesty. Expertise, Cunning Action, Uncanny Dodge, and Evasion not mechanically enforced.',
  },
  sorcerer: {
    status: 'warning',
    reason: 'Full CHA spellcasting works. Metamagic fully implemented (Twinned, Heightened, Quickened, Subtle, Empowered, Careful, Distant, Extended) with correct point costs. Draconic Resilience (AC 13+DEX, +1 HP/level) works. BUT Elemental Affinity, Dragon Wings, and Draconic Presence not implemented.',
  },
};

const CLASS_OK_REASONS: Record<string, string> = {
  wizard: 'Full prepared INT casting, Arcane Recovery (with dedicated modal), ritual casting from spellbook, and spellbook management all work. The most complete caster in the engine. Spell Mastery (L18) and Signature Spells (L20) not implemented.',
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
