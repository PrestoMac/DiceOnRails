import { Character, InventoryItem } from '../types';
import {
  FEATS_CATALOG,
  FeatDefinition,
  getFeatById
} from '../utils/feats';
import { calculateMaxHp } from './progressionService';
import { getMod, getProficiencyBonus as ceProficiencyBonus } from './classEngine';
import { ASI_LEVELS } from '../constants';
export { ASI_LEVELS };

export function isAsiLevel(level: number): boolean {
  return ASI_LEVELS.includes(level);
}

export function getFeat(char: Character, id: string): FeatDefinition | undefined {
  if (!char.feats?.includes(id)) return undefined;
  return getFeatById(id);
}

export function hasFeat(char: Character, id: string): boolean {
  return char.feats?.includes(id) ?? false;
}

export function getAllFeats(char: Character): FeatDefinition[] {
  if (!char.feats) return [];
  return char.feats
    .map(id => getFeatById(id))
    .filter((f): f is FeatDefinition => Boolean(f));
}

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
      const current = (char.stats as any)[stat] as number;
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

export function hasArmorProficiency(char: Character, prof: 'light' | 'medium' | 'heavy' | 'shield'): boolean {
  if (char.feats?.includes('lightly-armored') && (prof === 'light')) return true;
  if (char.feats?.includes('moderately-armored') && (prof === 'light' || prof === 'medium' || prof === 'shield')) return true;
  if (char.feats?.includes('heavily-armored') && (prof === 'light' || prof === 'medium' || prof === 'heavy' || prof === 'shield')) return true;
  if (hasFeat(char, 'shield-master') && prof === 'shield') return true;
  return false;
}

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

export function hasShieldEquipped(char: Character): boolean {
  return char.inventory.some(i => i.equipped && i.type === 'shield');
}

export function getOffHandAbilityModifier(char: Character): number {
  if (!hasFeat(char, 'two-weapon-fighting')) return 0;
  return getMod(char.stats.str);
}

export function shouldRerollDamageDie(char: Character, weapon: InventoryItem | null, isOffHand: boolean): boolean {
  if (!hasFeat(char, 'great-weapon-fighting') || isOffHand || !weapon) return false;
  const props = weapon.stats?.properties || [];
  if (props.includes('versatile') || props.includes('heavy')) return true;
  const name = weapon.name.toLowerCase();
  return name.includes('greatsword') || name.includes('greataxe') || name.includes('maul');
}

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
  const crypto = typeof globalThis !== 'undefined' && (globalThis as any).crypto;
  if (crypto?.getRandomValues) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return (arr[0] % sides) + 1;
  }
  return Math.floor(Math.random() * sides) + 1;
}

export function getHeavyArmorMasterReduction(char: Character, damageType?: string): number {
  if (!hasFeat(char, 'heavy-armor-master')) return 0;
  if (getEquippedArmorType(char) !== 'heavy') return 0;
  const type = (damageType || '').toLowerCase();
  return (type.includes('bludgeoning') || type.includes('piercing') || type.includes('slashing')) ? 3 : 0;
}

export function getAlertInitiativeBonus(char: Character): number {
  return hasFeat(char, 'alert') ? 5 : 0;
}

export function getMobileSpeedBonus(char: Character): number {
  return hasFeat(char, 'mobile') ? 10 : 0;
}

export function getAthleteSpeedBonus(char: Character): number {
  return hasFeat(char, 'athlete') ? 10 : 0;
}

export function getSpeedBonus(char: Character): number {
  return getMobileSpeedBonus(char) + getAthleteSpeedBonus(char);
}

export function getResilientSaveBonus(char: Character, stat: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'): number {
  if (!hasFeat(char, 'resilient')) return 0;
  const choice = getResilientStat(char) || 'con';
  return choice === stat ? ceProficiencyBonus(char) : 0;
}

export function getShieldMasterSaveBonus(char: Character, stat: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'): number {
  return (hasFeat(char, 'shield-master') && stat === 'dex' && hasShieldEquipped(char)) ? 2 : 0;
}

export function getDeathSaveBonus(char: Character): number {
  if (hasFeat(char, 'durable')) return 1;
  if (hasFeat(char, 'resilient') && getFeat(char, 'resilient')?.effectPayload?.saveStat === 'con') return 1;
  return 0;
}

export function getToughHpBonus(char: Character): number {
  return hasFeat(char, 'tough') ? char.level * 2 : 0;
}

export function getMaxHp(char: Character): number {
  return calculateMaxHp(char);
}

export function getDualWielderAcBonus(char: Character): number {
  if (!hasFeat(char, 'dual-wielder')) return 0;
  return char.inventory.filter(i => i.equipped && i.type === 'weapon').length >= 2 ? 1 : 0;
}

export function getObservantPassiveBonus(char: Character, skill: 'perception' | 'investigation'): number {
  return hasFeat(char, 'observant') ? 5 : 0;
}

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

export function getFeatChoice(char: Character, featId: string, key: string): any {
  return char.featChoices?.[featId]?.[key];
}

export function getResilientStat(char: Character): 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha' | undefined {
  return char.featChoices?.['resilient']?.saveStat;
}

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
