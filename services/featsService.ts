import { Character, InventoryItem } from '../types';
import {
  FEATS_CATALOG,
  FeatDefinition,
  getFeatById
} from '../utils/feats';
import { getMod } from '../utils/dice';
import { calculateMaxHp, getProficiencyBonus as ceProficiencyBonus } from './classEngine';
import { ASI_LEVELS } from '../constants';
export { ASI_LEVELS };

/** Checks whether the given character level is an ASI/feat level (1, 4, 8, 12, 16, 19). */
export function isAsiLevel(level: number): boolean {
  return ASI_LEVELS.includes(level);
}

/** Retrieves the feat definition for a given feat ID if the character possesses that feat. */
export function getFeat(char: Character, id: string): FeatDefinition | undefined {
  if (!char.feats?.includes(id)) return undefined;
  return getFeatById(id);
}

/** Checks whether a character has a specific feat by ID. */
export function hasFeat(char: Character, id: string): boolean {
  return char.feats?.includes(id) ?? false;
}

/** Returns the full list of feat definitions for all feats the character possesses. */
export function getAllFeats(char: Character): FeatDefinition[] {
  if (!char.feats) return [];
  return char.feats
    .map(id => getFeatById(id))
    .filter((f): f is FeatDefinition => Boolean(f));
}

/** Validates whether a character meets the prerequisites for a given feat (level, stats, armor profs, other feats). */
export function validateFeatPrereqs(
  char: Character,
  featId: string
): { ok: boolean; reason?: string } {
  const feat = getFeatById(featId);
  if (!feat) return { ok: false, reason: `Unknown feat: ${featId}` };

  if (char.feats?.includes(featId)) {
    return { ok: false, reason: 'Feat already taken.' };
  }

  const prereqs = feat.prerequisites;
  if (!prereqs) return { ok: true };

  if (prereqs.level !== undefined && char.level < prereqs.level) {
    return { ok: false, reason: `Requires character level ${prereqs.level}.` };
  }

  if (prereqs.stat) {
    for (const [stat, min] of Object.entries(prereqs.stat)) {
      const current = (char.stats as Record<string, number>)[stat] as number;
      if (current < (min as number)) {
        return { ok: false, reason: `Requires ${stat.toUpperCase()} ${min} or higher (you have ${current}).` };
      }
    }
  }

  if (prereqs.armorProf) {
    for (const prof of prereqs.armorProf) {
      if (!hasArmorProficiency(char, prof)) {
        const label = prof.charAt(0).toUpperCase() + prof.slice(1);
        return { ok: false, reason: `Requires ${label} Armor proficiency.` };
      }
    }
  }

  if (prereqs.otherFeats) {
    for (const reqId of prereqs.otherFeats) {
      if (!hasFeat(char, reqId)) {
        const reqFeat = getFeatById(reqId);
        return { ok: false, reason: `Requires ${reqFeat?.name ?? reqId}.` };
      }
    }
  }

  return { ok: true };
}

/** Checks whether a character has a given armor proficiency granted by feats (Lightly/Moderately/Heavily Armored, Shield Master). Does NOT check class proficiencies — use classEngine.canEquipArmor for that. */
export function hasArmorProficiency(char: Character, prof: 'light' | 'medium' | 'heavy' | 'shield'): boolean {
  if (char.feats?.includes('lightly-armored') && (prof === 'light')) return true;
  if (char.feats?.includes('moderately-armored') && (prof === 'light' || prof === 'medium' || prof === 'shield')) return true;
  if (char.feats?.includes('heavily-armored') && (prof === 'light' || prof === 'medium' || prof === 'heavy' || prof === 'shield')) return true;
  if (hasFeat(char, 'shield-master') && prof === 'shield') return true;
  return false;
}

/** Determines the armor type currently equipped by a character, or 'none' if unarmored. */
export function getEquippedArmorType(char: Character): 'light' | 'medium' | 'heavy' | 'none' {
  const equippedArmor = char.inventory.find(i => i.equipped && i.type === 'armor');
  if (!equippedArmor) return 'none';
  const formula = equippedArmor.stats?.acFormula || '';
  if (formula.includes('+ DEX')) {
    if (formula.startsWith('11')) return 'light';
    if (formula.startsWith('12') || formula.startsWith('13')) return 'medium';
  }
  if (formula.startsWith('16') || formula.startsWith('17') || formula.startsWith('18')) return 'heavy';

  const name = equippedArmor.name.toLowerCase();
  if (name.includes('plate') || name.includes('chain mail')) return 'heavy';
  if (name.includes('chain shirt') || name.includes('hide')) return 'medium';
  return 'light';
}

/** Checks whether a character has a shield equipped in their inventory. */
export function hasShieldEquipped(char: Character): boolean {
  return char.inventory.some(i => i.equipped && i.type === 'shield');
}

/** Returns the off-hand ability modifier for two-weapon fighting if the character has the Two-Weapon Fighting feat. */
export function getOffHandAbilityModifier(char: Character): number {
  if (!hasFeat(char, 'two-weapon-fighting')) return 0;
  return getMod(char.stats.str);
}

/** Determines whether a damage die should be rerolled under the Great Weapon Fighting feat based on weapon type. */
export function shouldRerollDamageDie(char: Character, weapon: InventoryItem | null, isOffHand: boolean): boolean {
  if (!hasFeat(char, 'great-weapon-fighting') || isOffHand || !weapon) return false;
  const props = weapon.stats?.properties || [];
  if (props.includes('versatile') || props.includes('heavy')) return true;
  const name = weapon.name.toLowerCase();
  return name.includes('greatsword') || name.includes('greataxe') || name.includes('maul');
}

/** Rerolls a damage die if the Great Weapon Fighting condition is met, but only for dice with sides 6, 8, 10, or 12. */
export function rerollDamageValueIfApplicable(
  char: Character,
  weapon: InventoryItem | null,
  isOffHand: boolean,
  dieSides: number,
  value: number
): number {
  if (dieSides !== 6 && dieSides !== 8 && dieSides !== 10 && dieSides !== 12) return value;
  if (value > 2) return value;
  if (!shouldRerollDamageDie(char, weapon, isOffHand)) return value;
  return cryptoRoll(dieSides);
}

function cryptoRoll(sides: number): number {
  const crypto = typeof globalThis !== 'undefined' && (globalThis as unknown as { crypto: Crypto }).crypto;
  if (crypto?.getRandomValues) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return (arr[0] % sides) + 1;
  }
  return Math.floor(Math.random() * sides) + 1;
}

/** Returns the damage reduction from Heavy Armor Master (3 for bludgeoning/piercing/slashing while wearing heavy armor). */
export function getHeavyArmorMasterReduction(char: Character, damageType?: string): number {
  if (!hasFeat(char, 'heavy-armor-master')) return 0;
  if (getEquippedArmorType(char) !== 'heavy') return 0;
  const type = (damageType || '').toLowerCase();
  return (type.includes('bludgeoning') || type.includes('piercing') || type.includes('slashing')) ? 3 : 0;
}

/** Returns the initiative bonus from the Alert feat (+5). */
export function getAlertInitiativeBonus(char: Character): number {
  return hasFeat(char, 'alert') ? 5 : 0;
}

/** Returns the speed bonus from the Mobile feat (+10). */
export function getMobileSpeedBonus(char: Character): number {
  return hasFeat(char, 'mobile') ? 10 : 0;
}

/** Returns the speed bonus from the Athlete feat (+10). */
export function getAthleteSpeedBonus(char: Character): number {
  return hasFeat(char, 'athlete') ? 10 : 0;
}

/** Returns the combined speed bonus from Mobile and Athlete feats. */
export function getSpeedBonus(char: Character): number {
  return getMobileSpeedBonus(char) + getAthleteSpeedBonus(char);
}

/** Returns the saving throw bonus from the Resilient feat for a specific stat (equal to proficiency bonus if the chosen stat matches). */
export function getResilientSaveBonus(char: Character, stat: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'): number {
  if (!hasFeat(char, 'resilient')) return 0;
  const choice = getResilientStat(char) || 'con';
  return choice === stat ? ceProficiencyBonus(char) : 0;
}

/** Returns the saving throw bonus from the Shield Master feat for DEX saves while a shield is equipped. */
export function getShieldMasterSaveBonus(char: Character, stat: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'): number {
  return (hasFeat(char, 'shield-master') && stat === 'dex' && hasShieldEquipped(char)) ? 2 : 0;
}

/** Returns the death save bonus (+1) from the Durable or Resilient (CON) feats. */
export function getDeathSaveBonus(char: Character): number {
  if (hasFeat(char, 'durable')) return 1;
  if (hasFeat(char, 'resilient') && getFeat(char, 'resilient')?.effectPayload?.saveStat === 'con') return 1;
  return 0;
}

/** Returns the bonus HP from the Tough feat (character level * 2). */
export function getToughHpBonus(char: Character): number {
  return hasFeat(char, 'tough') ? char.level * 2 : 0;
}

/** Calculates and returns the character's maximum HP using the progression service. */
export function getMaxHp(char: Character): number {
  return calculateMaxHp(char);
}

/** Returns the AC bonus (+1) from the Dual Wielder feat if two weapons are equipped. */
export function getDualWielderAcBonus(char: Character): number {
  if (!hasFeat(char, 'dual-wielder')) return 0;
  return char.inventory.filter(i => i.equipped && i.type === 'weapon').length >= 2 ? 1 : 0;
}

/** Returns the passive perception/investigation bonus from the Observant feat (+5). */
export function getObservantPassiveBonus(char: Character, _skill: 'perception' | 'investigation'): number {
  return hasFeat(char, 'observant') ? 5 : 0;
}

/** Applies an Ability Score Improvement allocation to a character, validating the total is exactly 2 points and stats do not exceed 20. */
export function applyAsiChoice(
  char: Character,
  allocations: Partial<Record<keyof Character['stats'], number>>,
  level: number
): { character: Character; errors: string[] } {
  const total = Object.values(allocations).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0);
  if (total !== 2) {
    return { character: char, errors: [`ASI allocation must total 2, got ${total}.`] };
  }

  const { stats, errors } = applyStatBonuses(char.stats, allocations);

  if (errors.length > 0) return { character: char, errors };

  const updated: Character = {
    ...char,
    stats,
    pendingFeatChoice: false,
    featSelections: [
      ...(char.featSelections || []),
      { level, type: 'asi', statAllocations: allocations }
    ]
  };

  return { character: recalcHp(char, updated), errors: [] };
}

/** Applies a feat choice to a character, including optional ASI bonuses, save stat choice, and skill choices (for Skilled feat). */
export function applyFeatChoice(
  char: Character,
  featId: string,
  level: number,
  options?: {
    asiBonuses?: Partial<Record<keyof Character['stats'], number>>;
    saveStatChoice?: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
    skillChoices?: string[];
  }
): { character: Character; errors: string[] } {
  const validation = validateFeatPrereqs(char, featId);
  if (!validation.ok) {
    return { character: char, errors: [validation.reason || 'Prerequisite not met.'] };
  }

  const updated: Character = {
    ...char,
    feats: [...(char.feats || [])]
  };

  if (options?.saveStatChoice) {
    updated.featChoices = {
      ...(char.featChoices || {}),
      [featId]: { ...(char.featChoices?.[featId] || {}), saveStat: options.saveStatChoice }
    };
  }

  if (options?.asiBonuses && Object.keys(options.asiBonuses).length > 0) {
    const { stats, errors } = applyStatBonuses(updated.stats, options.asiBonuses);
    if (errors.length === 0) updated.stats = stats;
  }

  if (options?.skillChoices && options.skillChoices.length > 0 && featId === 'skilled') {
    const newSkills = { ...(updated.skills || {}) };
    for (const skill of options.skillChoices) {
      newSkills[skill] = (newSkills[skill] || 0) + 1;
    }
    updated.skills = newSkills;
  }

  updated.feats = [...updated.feats, featId];
  updated.pendingFeatChoice = false;
  updated.featSelections = [
    ...(updated.featSelections || []),
    {
      level,
      type: 'feat',
      featId,
      statAllocations: options?.asiBonuses
    }
  ];

  return { character: recalcHp(char, updated), errors: [] };
}

/** Retrieves a specific choice value from a character's feat choices for a given feat and key. */
export function getFeatChoice(char: Character, featId: string, key: string): unknown {
  return char.featChoices?.[featId]?.[key];
}

/** Returns the chosen save stat from the Resilient feat, or undefined if not set. */
export function getResilientStat(char: Character): 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha' | undefined {
  return char.featChoices?.['resilient']?.saveStat;
}

/** Filters the full feat catalog to show only feats the character does not already have, optionally matching a search string. */
export function filterAvailableFeats(char: Character, search?: string): FeatDefinition[] {
  const searchLower = (search || '').toLowerCase().trim();
  return FEATS_CATALOG.filter(feat => {
    if (char.feats?.includes(feat.id)) return false;
    if (searchLower) {
      const haystack = `${feat.name} ${feat.shortName} ${feat.description} ${feat.mechanicalEffect}`.toLowerCase();
      if (!haystack.includes(searchLower)) return false;
    }
    return true;
  });
}

/** Ensures a character has all feat-related fields (feats, featSelections, featChoices, pendingFeatChoice) initialized with defaults. */
export function ensureCharacterFeatFields(char: Character): Character {
  return {
    ...char,
    feats: char.feats || [],
    featSelections: char.featSelections || [],
    featChoices: char.featChoices || {},
    pendingFeatChoice: char.pendingFeatChoice ?? false
  };
}

export { ceProficiencyBonus as getProficiencyBonus, FEATS_CATALOG };

/** Applies stat bonuses to base stats, capping each at 20 and collecting errors for over-limit attempts. */
function applyStatBonuses(
  baseStats: Character['stats'],
  bonuses: Partial<Record<keyof Character['stats'], number>>
): { stats: Character['stats']; errors: string[] } {
  const errors: string[] = [];
  const newStats = { ...baseStats };
  for (const [stat, v] of Object.entries(bonuses)) {
    if (typeof v === 'number' && v > 0) {
      const key = stat as keyof Character['stats'];
      const proposed = newStats[key] + v;
      if (proposed > 20) {
        errors.push(`${stat.toUpperCase()} cannot exceed 20 (would be ${proposed}).`);
        continue;
      }
      newStats[key] = proposed;
    }
  }
  return { stats: newStats, errors };
}

/** Recalculates HP after stat changes: keeps the absolute current HP value and adds any max-HP gain from the CON modifier bump (clamped to the new max). Current HP is NOT preserved proportionally. */
function recalcHp(oldChar: Character, updated: Character): Character {
  const oldMaxHp = oldChar.hp.max;
  const newMaxHp = getMaxHp(updated);
  const hpDiff = newMaxHp - oldMaxHp;
  updated.hp = {
    current: Math.min(newMaxHp, oldChar.hp.current + Math.max(0, hpDiff)),
    max: newMaxHp
  };
  return updated;
}

export { getProficiencyBonus };
