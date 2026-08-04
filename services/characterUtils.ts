import { Character, CombatState } from '../types';
import { getInvocationCount } from '../data/invocations';

export function ensureDeathSaves(c: Character): void {
  if (!c.deathSaves) c.deathSaves = { successes: 0, failures: 0, isStable: false };
}

export function updateCombatantDeathStatus(cs: CombatState, id: string, isDead: boolean): CombatState {
  const e = cs.initiative.find(x => x.id === id); if (e) e.isDead = isDead;
  if (isDead) { const en = cs.enemies.find(x => x.id === id); if (en) en.isDead = true; }
  return cs;
}

export function ensureCharacterFields(char: Character): void {
  char.hitDice ??= { current: char.level, max: char.level };
  char.feats ??= [];
  char.featSelections ??= [];
  char.featChoices ??= {};
  char.pendingFeatChoice ??= false;
  if (char.class) char.class = char.class.toLowerCase();
  if (char.race) char.race = char.race.toLowerCase();
  char.resources ??= [];
  char.knownSpells ??= [];
  char.preparedSpells ??= [];
  char.racialTraits ??= [];
  char.unlockedSubclassFeatures ??= [];
  char.pendingSubclassFeature ??= false;
  char.pendingSpellSwap ??= false;
  char.cantripSwapAvailable ??= false;
  char.shortRestSpellSwapAvailable ??= false;
  char.longRestPrepAvailable ??= true;

  // Background & persona (SRD 5.1 narrative fields). Initialized so the UI/LLM
  // never crashes on `.length`/`.trim()` against undefined; empty = "unset".
  char.alignment ??= '';
  char.background ??= '';
  char.personalityTraits ??= [];
  char.ideals ??= [];
  char.bonds ??= [];
  char.flaws ??= [];
  char.appearance ??= '';
  char.portraitUrl ??= '';
  char.fightingStyle ??= '';
  char.fightingStyleTwo ??= '';
  char.expertiseSkills ??= [];
  // Migrate old saves: sync expertiseSkills from skill ranks >= 2.
  if (char.skills) {
    const expertiseSet = new Set(char.expertiseSkills);
    for (const [skill, rank] of Object.entries(char.skills)) {
      if (typeof rank === 'number' && rank >= 2) expertiseSet.add(skill);
    }
    char.expertiseSkills = Array.from(expertiseSet);
  }
  char.invocations ??= [];
  char.pendingInvocations ??= 0;
  // Self-heal: clamp pendingInvocations to the valid delta for warlocks so an
  // inflated value from an older save (pre-fix delta math) can't hard-lock the
  // LevelUpModal's exact-match requirement.
  if (char.class === 'warlock' && char.level >= 2) {
    const maxPending = Math.max(0, getInvocationCount(char.level) - (char.invocations ?? []).length);
    if (char.pendingInvocations > maxPending) char.pendingInvocations = maxPending;
  } else if (char.class !== 'warlock') {
    char.pendingInvocations = 0;
  }
  char.armorProfs ??= [];
  char.subraceId ??= '';
  char.notes ??= '';
  char.gmNotes ??= '';
  char.pendingWizardSpells ??= 0;
  char.recklessAttacking ??= false;
  if (!char.conditionsImmunities && (char.racialTraits || []).includes('fey-ancestry')) {
    // Fey Ancestry: magic can't put elf/half-elf to sleep. (Charm-save advantage
    // is applied via the isCharm flag on the make_save spellContext path.)
    char.conditionsImmunities = ['sleep'];
  }
}

export function ensureAllCharacterFields(party: Character[]): void {
  for (const char of party) ensureCharacterFields(char);
}
