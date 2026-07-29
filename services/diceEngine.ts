import { cryptoRoll } from '../utils/random';
import { SKILLS_LIST } from '../constants';
import type { RollData, Character, CombatState } from '../types';
import { getMod, getProficiencyBonus } from './classEngine';
import { parseDiceFormula } from '../utils/dice';
import { getExhaustionPenalty } from './conditionEngine';
import { ensureDeathSaves, updateCombatantDeathStatus } from './characterUtils';

type StatKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

/** Rolls a number of dice with the given sides and returns the sum total. */
export function rollDice(count: number, sides: number): number {
  let total = 0;
  for (let i = 0; i < count; i++) total += cryptoRoll(sides);
  return total;
}

/** Rolls dice with advantage if the flag is set, returning the higher of two separate rolls. */
export function rollDiceWithAdvantage(
  count: number,
  sides: number,
  advantage: boolean
): number {
  const first = rollDice(count, sides);
  if (!advantage) return first;
  const second = rollDice(count, sides);
  return Math.max(first, second);
}

/** Returns the ability modifier for a given stat value (delegates to classEngine.getMod). */
export function calculateModifier(statValue: number): number {
  return getMod(statValue);
}

/** Rolls an attack roll for a weapon attack, calculating the total versus target AC and determining hit/critical/fumble. */
export function rollAttackRoll(params: {
  attackerLevel: number;
  attackerStats: { str: number; dex: number };
  weaponProperties: string[];
  weaponName: string;
  targetAc: number;
  isOffHand: boolean;
  hasAlertFeat?: boolean;
}): RollData {
  const { attackerLevel, attackerStats, weaponProperties, targetAc } = params;

  const strMod = calculateModifier(attackerStats.str);
  const dexMod = calculateModifier(attackerStats.dex);
  const profBonus = getProficiencyBonus({ level: attackerLevel } as unknown as Character);

  const isRanged = weaponProperties.includes('ranged')
    || params.weaponName.toLowerCase().includes('bow')
    || params.weaponName.toLowerCase().includes('crossbow')
    || params.weaponName.toLowerCase().includes('javelin')
    || params.weaponName.toLowerCase().includes('dart')
    || params.weaponName.toLowerCase().includes('sling');
  const abilityMod = isRanged ? dexMod : strMod;

  const roll = cryptoRoll(20);
  const isCritical = roll === 20;
  const isFumble = roll === 1;

  const total = roll + abilityMod + profBonus;

  const hit = isCritical || (!isFumble && total >= targetAc);

  return { type: 'attack', dieFace: 'd20', dieRoll: roll, modifier: abilityMod + profBonus, total, isCritical, isFumble, hit };
}

/** Rolls damage dice for a weapon, including critical doubling, Great Weapon Fighting rerolls, and off-hand modifier handling. */
export function rollDamage(params: {
  weaponDamageDice: string;
  weaponDamageType: string;
  modifier: number;
  isCritical: boolean;
  isOffHand: boolean;
  hasGreatWeaponFighting?: boolean;
  hasTwoWeaponFighting?: boolean;
  hasDualWielder?: boolean;
}): RollData {
  const {
    weaponDamageDice, modifier, isCritical, isOffHand,
    hasGreatWeaponFighting, hasTwoWeaponFighting,
  } = params;

  const match = weaponDamageDice.match(/^(\d+)d(\d+)/);
  if (!match) return { type: 'damage', dieFace: weaponDamageDice, dieRoll: 0, modifier, total: modifier, isCritical, results: [] };

  const parsed = parseDiceFormula(weaponDamageDice);
  const diceCount = isCritical ? parsed.count * 2 : parsed.count;
  const dieSides = parsed.sides;
  const flatBonus = parsed.bonus;

  const results: number[] = [];
  for (let i = 0; i < diceCount; i++) {
    let value = cryptoRoll(dieSides);
    if (hasGreatWeaponFighting && !isOffHand && value <= 2) {
      value = cryptoRoll(dieSides);
    }
    results.push(value);
  }

  let total = results.reduce((a, b) => a + b, 0) + flatBonus;
  if (isOffHand) {
    if (hasTwoWeaponFighting) total += modifier;
  } else {
    total += modifier;
  }

  return { type: 'damage', dieFace: `d${dieSides}`, dieRoll: results[0] ?? 0, modifier, total, isCritical, results, dieCount: diceCount };
}

/** Result of a skill check including the raw roll, total, DC, and success flag. */
export interface SkillCheckResult {
  roll: number;
  total: number;
  dc: number;
  success: boolean;
  skillName: string;
}

const STAT_MAP: Record<string, StatKey> = {};
for (const skill of SKILLS_LIST) {
  STAT_MAP[skill.name] = skill.stat;
}

/** Rolls a skill check for a character, determining the relevant stat modifier and applying proficiency, Resilient, and Shield Master bonuses. */
export function rollSkillCheck(params: {
  characterStats: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  characterLevel: number;
  skillName: string;
  skillProficiency: number;
  difficulty: number;
  hasResilient?: boolean;
  resilientStat?: StatKey;
  hasShieldMaster?: boolean;
  shieldEquipped?: boolean;
}): RollData {
  const {
    characterStats, characterLevel, skillName, skillProficiency, difficulty,
    hasResilient, resilientStat, hasShieldMaster, shieldEquipped,
  } = params;

  const normalizedSkill = skillName.toLowerCase().trim()
    .replace(/\s*(?:check|roll|save|saving\s+throw)$/i, '')
    .trim();

  let statKey: StatKey = 'str';
  if (STAT_MAP[normalizedSkill]) {
    statKey = STAT_MAP[normalizedSkill];
  } else {
    for (const skill of SKILLS_LIST) {
      if (normalizedSkill.includes(skill.name) || skill.name.includes(normalizedSkill)) {
        statKey = skill.stat;
        break;
      }
    }
  }

  const statValue = characterStats[statKey] || 10;
  const statMod = calculateModifier(statValue);
  let profBonus = skillProficiency > 0 ? getProficiencyBonus({ level: characterLevel } as unknown as Character) : 0;
  if (hasResilient && resilientStat === statKey) {
    profBonus += getProficiencyBonus({ level: characterLevel } as unknown as Character);
  }
  let shieldBonus = 0;
  if (hasShieldMaster && shieldEquipped && statKey === 'dex') {
    shieldBonus = 2;
  }
  const roll = cryptoRoll(20);
  const total = roll + statMod + profBonus + shieldBonus;

  return { type: 'skill', dieFace: 'd20', dieRoll: roll, modifier: statMod + profBonus + shieldBonus, total, dc: difficulty, success: total >= difficulty, label: skillName, skillRank: skillProficiency };
}

/** Rolls a saving throw for a character, including proficiency bonus if the stat is proficient or the Resilient feat applies. */
export function rollSavingThrow(params: {
  characterStats: Record<string, number>;
  characterLevel: number;
  stat: string;
  dc: number;
  proficientInStat?: boolean;
  hasResilient?: boolean;
  resilientStat?: StatKey;
  hasShieldMaster?: boolean;
  shieldEquipped?: boolean;
}): RollData {
  const {
    characterStats, characterLevel, stat, dc,
    proficientInStat, hasResilient, resilientStat, hasShieldMaster, shieldEquipped,
  } = params;

  const mappedStat = resolveStat(stat);
  const statValue = characterStats[mappedStat] || 10;
  const baseMod = calculateModifier(statValue);

  const profLevel = { level: characterLevel } as unknown as Character;
  let profBonus = 0;
  if (proficientInStat) {
    profBonus = getProficiencyBonus(profLevel);
  } else if (hasResilient && resilientStat === mappedStat) {
    profBonus = getProficiencyBonus(profLevel);
  }

  let shieldMasterBonus = 0;
  if (hasShieldMaster && mappedStat === 'dex' && shieldEquipped) {
    shieldMasterBonus = 2;
  }

  const totalMod = baseMod + profBonus + shieldMasterBonus;
  const roll = cryptoRoll(20);
  const total = roll + totalMod;

  return { type: 'save', dieFace: 'd20', dieRoll: roll, modifier: totalMod, total, dc, success: total >= dc, stat: mappedStat.toUpperCase(), label: mappedStat.toUpperCase() };
}

/** Simple death save roll returning RollData for UI display. */
export function rollDeathSaveRoll(): RollData {
  const roll = cryptoRoll(20);
  if (roll === 20) {
    return { type: 'death_save', dieFace: 'd20', dieRoll: roll, modifier: 0, total: roll, success: true, isCritical: true, isFumble: false, label: 'Death Save' };
  }
  if (roll >= 10) {
    return { type: 'death_save', dieFace: 'd20', dieRoll: roll, modifier: 0, total: roll, success: true, isCritical: false, isFumble: false, label: 'Death Save' };
  }
  return { type: 'death_save', dieFace: 'd20', dieRoll: roll, modifier: 0, total: roll, success: false, isCritical: false, isFumble: roll === 1, label: 'Death Save' };
}

export function rollDeathSave(ch: Character, cs?: CombatState): {
  message: string; roll: number; total: number; successes: number;
  failures: number; isStable: boolean; revived: boolean; died: boolean; rollSuccess: boolean;
} {
  ensureDeathSaves(ch);
  const s = ch.deathSaves as NonNullable<typeof ch.deathSaves>;
  if (s.isStable) {
    return { message: `${ch.name} is stable.`, roll: 0, total: 0, successes: s.successes, failures: s.failures, isStable: true, revived: false, died: false, rollSuccess: false };
  }
  const rawRoll = cryptoRoll(20);
  const total = rawRoll - getExhaustionPenalty(ch);
  if (rawRoll === 20) {
    ch.hp.current = 1;
    ch.deathSaves = { successes: 0, failures: 0, isStable: false };
    if (cs) updateCombatantDeathStatus(cs, ch.id, false);
    return { message: `${ch.name} rolls DEATH SAVE: **Natural 20!** Revived with 1 HP!`, roll: rawRoll, total, successes: 0, failures: 0, isStable: false, revived: true, died: false, rollSuccess: true };
  }
  if (total >= 10) {
    s.successes++;
    if (s.successes >= 3) s.isStable = true;
    return { message: `${ch.name} rolls DEATH SAVE: **${rawRoll}** — ${s.successes >= 3 ? '3 successes! Stabilized.' : `Success (${s.successes}/3)`}`, roll: rawRoll, total, successes: s.successes, failures: s.failures, isStable: s.isStable, revived: false, died: false, rollSuccess: true };
  }
  s.failures++;
  const dead = s.failures >= 3;
  if (dead && cs) updateCombatantDeathStatus(cs, ch.id, true);
  return { message: `${ch.name} rolls DEATH SAVE: **${rawRoll}** — ${dead ? `3 failures! **${ch.name} has died.**` : `Failure (${s.failures}/3)`}`, roll: rawRoll, total, successes: s.successes, failures: s.failures, isStable: false, revived: false, died: dead, rollSuccess: false };
}

const VALID_STATS: StatKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

/** Resolves a raw stat input string to one of the six standard stat keys. */
function resolveStat(raw: string): StatKey {
  const lower = raw.toLowerCase().trim();
  return VALID_STATS.find(s => lower.includes(s) || s.includes(lower)) || 'dex';
}

export type { SkillCheckResult };
export { getProficiencyBonus };
