import { cryptoRoll } from '../utils/random';
import { SKILLS_LIST, type SkillDefinition } from '../constants';
import type { RollData } from '../types';
import { getMod, getProficiencyBonus } from './classEngine';
import { parseDiceFormula } from '../utils/dice';
import type { Character } from '../types';

type StatKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export function rollDice(count: number, sides: number): number {
  let total = 0;
  for (let i = 0; i < count; i++) total += cryptoRoll(sides);
  return total;
}

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

export function calculateModifier(statValue: number): number {
  return getMod(statValue);
}

export function rollAttackRoll(params: {
  attackerLevel: number;
  attackerStats: { str: number; dex: number };
  weaponProperties: string[];
  weaponName: string;
  targetAc: number;
  isOffHand: boolean;
  hasAlertFeat?: boolean;
}): RollData {
  const { attackerLevel, attackerStats, weaponProperties, targetAc, isOffHand } = params;

  const strMod = calculateModifier(attackerStats.str);
  const dexMod = calculateModifier(attackerStats.dex);
  const profBonus = getProficiencyBonus({ level: attackerLevel } as any);

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

  let total = roll + abilityMod + profBonus;

  const hit = isCritical || (!isFumble && total >= targetAc);

  return { type: 'attack', dieFace: 'd20', dieRoll: roll, modifier: abilityMod + profBonus, total, isCritical, isFumble, hit };
}

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
    hasGreatWeaponFighting, hasTwoWeaponFighting, hasDualWielder,
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
  let profBonus = skillProficiency > 0 ? getProficiencyBonus({ level: characterLevel } as any) : 0;
  if (hasResilient && resilientStat === statKey) {
    profBonus += getProficiencyBonus({ level: characterLevel } as any);
  }
  let shieldBonus = 0;
  if (hasShieldMaster && shieldEquipped && statKey === 'dex') {
    shieldBonus = 2;
  }
  const roll = cryptoRoll(20);
  const total = roll + statMod + profBonus + shieldBonus;

  return { type: 'skill', dieFace: 'd20', dieRoll: roll, modifier: statMod + profBonus + shieldBonus, total, dc: difficulty, success: total >= difficulty, label: skillName, skillRank: skillProficiency };
}

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

  const profLevel = { level: characterLevel } as any;
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

export function rollDeathSave(): RollData {
  const roll = cryptoRoll(20);

  if (roll === 20) {
    return { type: 'death_save', dieFace: 'd20', dieRoll: roll, modifier: 0, total: roll, success: true, isCritical: true, isFumble: false, label: 'Death Save' };
  }
  if (roll >= 10) {
    return { type: 'death_save', dieFace: 'd20', dieRoll: roll, modifier: 0, total: roll, success: true, isCritical: false, isFumble: false, label: 'Death Save' };
  }
  return { type: 'death_save', dieFace: 'd20', dieRoll: roll, modifier: 0, total: roll, success: false, isCritical: false, isFumble: roll === 1, label: 'Death Save' };
}

const VALID_STATS: StatKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

function resolveStat(raw: string): StatKey {
  const lower = raw.toLowerCase().trim();
  return VALID_STATS.find(s => lower.includes(s) || s.includes(lower)) || 'dex';
}

export type { SkillCheckResult };
export { getProficiencyBonus };
