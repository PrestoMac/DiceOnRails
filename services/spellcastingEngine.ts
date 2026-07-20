import { Character, SpellDefinition, ResourcePool, SaveStat, DamageType } from '../types';
import { getClassDef, getMod, getProficiencyBonus, getSpellSaveDc, getSpellAttackBonus } from './classEngine';
import { rollDice } from './diceEngine';
import { parseDiceFormula } from '../utils/dice';
import { cryptoRoll } from '../utils/random';
import { SPELLS_BY_ID } from '../utils/spells';
import { getConditionEffects, getExhaustionPenalty } from './conditionEngine';

function findSpellSlot(character: Character, level: number) {
  return (character.resources ?? []).find(r => r.id === `spell-slot-${level}`);
}

function getAbilityMod(character: Character, ability: SaveStat): number {
  return getMod(character.stats[ability]);
}

function rollDiceWithDetails(count: number, sides: number): { total: number; rolls: number[] } {
  const rolls: number[] = [];
  let total = 0;
  for (let i = 0; i < count; i++) {
    const r = cryptoRoll(sides);
    rolls.push(r);
    total += r;
  }
  return { total, rolls };
}

function parseDice(dice: string): { count: number; sides: number; flatBonus: number; addAbilityMod: boolean } {
  const addAbilityMod = dice.toLowerCase().includes('spellcasting') || dice.toLowerCase().includes('ability');
  const sanitized = dice.replace(/\s+/g, '').replace(/([+-])(?!\d).*$/, '');
  const m = sanitized.match(/^\d+d\d+/);
  if (!m) return { count: 0, sides: 0, flatBonus: 0, addAbilityMod };
  const parsed = parseDiceFormula(sanitized);
  return { count: parsed.count, sides: parsed.sides, flatBonus: parsed.bonus, addAbilityMod };
}

/** Finds an available spell slot resource for the given level, returning undefined if none remain. */
export function getSpellSlot(character: Character, level: 1|2|3|4|5|6|7|8|9): ResourcePool | undefined {
  const r = findSpellSlot(character, level);
  return r && r.current > 0 ? r : undefined;
}

/** Checks whether a character has at least one spell slot of the given level remaining. */
export function hasSpellSlot(character: Character, level: 1|2|3|4|5|6|7|8|9): boolean {
  return (findSpellSlot(character, level)?.current ?? 0) > 0;
}

/** Consumes one spell slot of the given level from the character's resources, returning success status. */
export function consumeSpellSlot(character: Character, level: 1|2|3|4|5|6|7|8|9): boolean {
  const r = findSpellSlot(character, level);
  if (!r || r.current <= 0) return false;
  r.current -= 1;
  return true;
}

/** Returns the number of cantrips a character of the given class and level can know. */
export function getCantripsKnown(character: Character, level: number): number {
  const classDef = getClassDef(character.class);
  if (!classDef?.spellcasting) return 0;
  const arr = classDef.spellcasting.cantripsKnown;
  return arr[Math.min(level - 1, arr.length - 1)] || 0;
}

/** Returns the number of spells a known-style caster can know at the given level. */
export function getSpellsKnown(character: Character, level: number): number {
  const classDef = getClassDef(character.class);
  if (!classDef?.spellcasting || !classDef.spellcasting.spellsKnown) return 0;
  const arr = classDef.spellcasting.spellsKnown;
  return arr[Math.min(level - 1, arr.length - 1)] || 0;
}

/** Returns the maximum number of spells a prepared-style caster can prepare at the given level. */
export function getMaxPrepared(character: Character, level: number): number {
  const classDef = getClassDef(character.class);
  if (!classDef?.spellcasting || classDef.spellcasting.prepMode !== 'prepared') return 0;
  return Math.max(1, level + getAbilityMod(character, classDef.spellcasting.ability));
}

/** Validates whether a character can learn a specific spell (correct class, level-appropriate cantrip/spell count). */
export function canLearnSpell(character: Character, spellId: string): { ok: boolean; reason?: string } {
  const spell = SPELLS_BY_ID[spellId.toLowerCase()];
  if (!spell) return { ok: false, reason: 'Unknown spell.' };
  const classDef = getClassDef(character.class);
  if (!classDef?.spellcasting) return { ok: false, reason: `${classDef?.name || 'This class'} cannot cast spells.` };
  if (!spell.classes.includes(character.class)) {
    return { ok: false, reason: `${classDef.name} cannot learn ${spell.name}.` };
  }
  if (spell.level === 0) {
    const cap = getCantripsKnown(character, character.level);
    const currentCantrips = (character.knownSpells ?? []).filter(sid => (SPELLS_BY_ID[sid]?.level ?? 1) === 0).length;
    if (currentCantrips >= cap) {
      return { ok: false, reason: `You already know ${cap} cantrips (max for L${character.level} ${classDef?.name || 'class'}).` };
    }
    return { ok: true };
  }
  if (classDef.spellcasting.prepMode === 'known') {
    const cap = getSpellsKnown(character, character.level);
    const currentKnown = (character.knownSpells ?? []).filter(sid => (SPELLS_BY_ID[sid]?.level ?? 1) !== 0).length;
    if (currentKnown >= cap) {
      return { ok: false, reason: `You already know ${cap} spells (max for L${character.level} ${classDef.name}).` };
    }
  }
  return { ok: true };
}

/** Adds a spell to a character's known spell list if valid, returning success status. */
export function learnSpell(character: Character, spellId: string): boolean {
  const check = canLearnSpell(character, spellId);
  if (!check.ok) return false;
  const spell = SPELLS_BY_ID[spellId.toLowerCase()];
  character.knownSpells ??= [];
  if (!character.knownSpells.includes(spell!.id)) character.knownSpells.push(spell!.id);
  return true;
}

/** Prepares a spell for a prepared-style caster, respecting the preparation cap, and returns success with optional reason. */
export function prepareSpell(character: Character, spellId: string): { ok: boolean; reason?: string } {
  const classDef = getClassDef(character.class);
  if (!classDef?.spellcasting || classDef.spellcasting.prepMode !== 'prepared') {
    return { ok: false, reason: `${classDef?.name || 'This class'} does not prepare spells.` };
  }
  const spell = SPELLS_BY_ID[spellId.toLowerCase()];
  if (!spell) return { ok: false, reason: 'Unknown spell.' };
  if (!spell.classes.includes(character.class)) {
    return { ok: false, reason: `${classDef.name} cannot prepare ${spell.name}.` };
  }
  if (spell.level === 0) return { ok: true };
  character.preparedSpells ??= [];
  if (character.preparedSpells.includes(spell.id)) return { ok: true };
  const max = getMaxPrepared(character, character.level);
  const currentPrepared = character.preparedSpells.filter(s => (SPELLS_BY_ID[s]?.level ?? 1) !== 0).length;
  if (currentPrepared >= max) {
    return { ok: false, reason: `You can prepare at most ${max} spells at this level (you have ${currentPrepared}).` };
  }
  character.preparedSpells.push(spell.id);
  return { ok: true };
}

/** Removes a spell from a character's prepared list, returning success status. */
export function unprepareSpell(character: Character, spellId: string): boolean {
  const idx = character.preparedSpells.indexOf(spellId);
  if (idx === -1) return false;
  character.preparedSpells.splice(idx, 1);
  return true;
}

/** Detailed result of a cast spell operation, including attack rolls, saves, damage, healing, concentration changes, and narration hints. */
export interface CastResult {
  success: boolean;
  reason?: string;
  attackRoll?: { d20: number; total: number; isCrit: boolean; isFumble: boolean };
  saveRoll?: { stat: SaveStat; dc: number; halfOnSuccess: boolean };
  damage?: { total: number; type: string; perTarget?: { targetId: string; damage: number }[] };
  damageRollDetails?: string;
  healing?: number;
  cantripScalingDamage?: number;
  autoHitDamage?: number;
  concentrationStarted?: boolean;
  concentrationEnded?: boolean;
  narrationHint?: string;
  perBeam?: Array<{
    attackRoll: { d20: number; total: number; isCrit: boolean; isFumble: boolean };
    damage: number;
    isHit: boolean;
  }>;
  affectedTargets?: Array<{ targetId: string; hpCost: number }>;
  hasEffect?: boolean;  
}

/** Executes a full spell cast: validates known/prepared state, consumes spell slot, handles concentration, rolls attack/save/damage/healing, and applies scaling. */
export function castSpell(
  character: Character,
  spellId: string,
  slotLevel: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9,
  targets: { id: string; ac?: number; saveBonus?: number }[] = [],
  combat?: { enemies: { id: string; hp: { current: number; max: number }; name?: string }[]; party?: { id: string; hp: { current: number; max: number }; name?: string }[] }
): CastResult {
  const spell = SPELLS_BY_ID[spellId.toLowerCase()];
  if (!spell) return { success: false, reason: 'Unknown spell.' };
  const classDef = getClassDef(character.class);
  if (!classDef?.spellcasting) return { success: false, reason: `${classDef?.name || 'This class'} cannot cast spells.` };

  if (spell.level === 0) {
    const known = character.knownSpells ?? [];
    const prepared = character.preparedSpells ?? [];
    if (!known.includes(spell.id) && !prepared.includes(spell.id)) {
      return { success: false, reason: `${spell.name} is not in your known/prepared spell list.` };
    }
  } else {
    if (slotLevel < spell.level) {
      return { success: false, reason: `${spell.name} requires at least a level ${spell.level} slot.` };
    }
    if (!hasSpellSlot(character, slotLevel as 1|2|3|4|5|6|7|8|9)) {
      return { success: false, reason: `No level ${slotLevel} spell slot remaining.` };
    }
    const known = character.knownSpells ?? [];
    const prepared = character.preparedSpells ?? [];
    if (classDef.spellcasting.prepMode === 'known' && !known.includes(spell.id)) {
      return { success: false, reason: `You haven't learned ${spell.name}.` };
    }
    if (classDef.spellcasting.prepMode === 'prepared' && !prepared.includes(spell.id)) {
      return { success: false, reason: `${spell.name} is not prepared.` };
    }
    consumeSpellSlot(character, slotLevel as 1|2|3|4|5|6|7|8|9);
  }

  let concentrationStarted = false;
  let concentrationEnded = false;
  if (spell.requiresConcentration) {
    if (character.concentrationSpellId && character.concentrationSpellId !== spell.id) {
      concentrationStarted = true;
      breakConcentration(character, 'voluntary');
      concentrationEnded = true;
    }
    character.concentrationSpellId = spell.id;
  }

  const result: CastResult = { success: true, concentrationStarted, concentrationEnded };
  let wasCrit = false;

  if (spell.attackRoll && targets.length > 0) {
    let beamCount = 1;
    if (spell.id === 'eldritch-blast') {
      if (character.level >= 17) beamCount = 4;
      else if (character.level >= 11) beamCount = 3;
      else if (character.level >= 5) beamCount = 2;
    } else if (spell.dartCount) {
      beamCount = spell.dartCount;
    }

    let totalDamage = 0;
    const perBeam: { attackRoll: { d20: number; total: number; isCrit: boolean; isFumble: boolean }; damage: number; isHit: boolean }[] = [];

    const casterFx = getConditionEffects(character);
    
    const primaryTargetId = targets[0]?.id;

    for (let beam = 0; beam < beamCount; beam++) {
      
      let roll1 = cryptoRoll(20);
      let roll2 = cryptoRoll(20);

      const casterHasDisadv = casterFx.disadvantageOnAttacks || casterFx.isBlinded;
      
      const targetGrantsAdvantage = (targets[0] as any)?._attacksAgainstHaveAdvantage === true;

      let d20: number;
      if (casterHasDisadv && !targetGrantsAdvantage) {
        d20 = Math.min(roll1, roll2); 
      } else if (targetGrantsAdvantage && !casterHasDisadv) {
        d20 = Math.max(roll1, roll2); 
      } else {
        d20 = roll1; 
      }

      const atkTotal = d20 + getSpellAttackBonus(character) - getExhaustionPenalty(character);
      const isCrit = d20 === 20;
      const isFumble = d20 === 1;
      const isHit = !isFumble && (isCrit || atkTotal >= (targets[0]?.ac || 0));

      let beamDamage = 0;
      if (spell.damage && isHit) {
        const { count, sides, flatBonus, addAbilityMod } = parseDice(spell.damage.dice);
        const { total: diceDamage, rolls } = rollDiceWithDetails(count, sides);
        let finalDiceDamage = diceDamage;
        if (isCrit) finalDiceDamage *= 2;
        const abilityMod = addAbilityMod ? getAbilityMod(character, classDef.spellcasting.ability) : 0;
        beamDamage = finalDiceDamage + flatBonus + abilityMod;

        const baseFormula = `${count}d${sides}`;
        const rollsStr = rolls.join('+');
        const critMult = isCrit ? ' * 2' : '';
        const flatStr = flatBonus ? ` + ${flatBonus}` : '';
        const abilityStr = abilityMod ? ` + ${abilityMod} [mod]` : '';
        const detail = `${baseFormula} [${rollsStr}]${critMult}${flatStr}${abilityStr}`;
        if (result.damageRollDetails) {
          result.damageRollDetails += `, ${detail}`;
        } else {
          result.damageRollDetails = `base: ${detail}`;
        }
      }
      totalDamage += beamDamage;
      if (isCrit) wasCrit = true;
      perBeam.push({ attackRoll: { d20, total: atkTotal, isCrit, isFumble }, damage: beamDamage, isHit });
    }

    const bestBeam = perBeam.reduce((best, b) => b.attackRoll.total > best.attackRoll.total ? b : best);
    result.attackRoll = { d20: bestBeam.attackRoll.d20, total: bestBeam.attackRoll.total, isCrit: bestBeam.attackRoll.isCrit, isFumble: bestBeam.attackRoll.isFumble };
    if (perBeam.length > 1) {
      result.perBeam = perBeam;
    }
    result.damage = { total: totalDamage, type: spell.damage?.type || 'force' };
  } else if (spell.save && targets.length > 0) {
    const dc = getSpellSaveDc(character);
    result.saveRoll = { stat: spell.save.stat, dc, halfOnSuccess: spell.save.onSuccess === 'half' };

    if (spell.damage) {
      const { count, sides, flatBonus, addAbilityMod } = parseDice(spell.damage.dice);
      const abilityMod = addAbilityMod ? getAbilityMod(character, classDef.spellcasting.ability) : 0;
      const perTarget = targets.map((t, idx) => {
        const { total: diceDamage, rolls } = rollDiceWithDetails(count, sides);
        const totalDmg = diceDamage + flatBonus + abilityMod;
        if (idx === 0) {
          const baseFormula = `${count}d${sides}`;
          const rollsStr = rolls.join('+');
          const flatStr = flatBonus ? ` + ${flatBonus}` : '';
          const abilityStr = abilityMod ? ` + ${abilityMod} [mod]` : '';
          result.damageRollDetails = `base: ${baseFormula} [${rollsStr}]${flatStr}${abilityStr}`;
        }
        return {
          targetId: t.id,
          damage: totalDmg,
        };
      });
      const total = perTarget.reduce((s, t) => s + t.damage, 0);
      result.damage = { total, type: spell.damage.type, perTarget };

      if (spell.secondaryDamage && Array.isArray(spell.secondaryDamage)) {
        for (const sec of spell.secondaryDamage) {
          const secDice = parseDice(sec.dice);
          for (const pt of perTarget) {
            const secDmg = rollDice(secDice.count, secDice.sides) + (secDice.flatBonus || 0);
            pt.damage += secDmg;
            result.damage.total += secDmg;
          }
        }
      }
    }
  } else if (spell.healing) {
    const { count, sides, flatBonus, addAbilityMod } = parseDice(spell.healing);
    const abilityMod = addAbilityMod ? getAbilityMod(character, classDef.spellcasting.ability) : 0;
    result.healing = rollDice(count, sides) + abilityMod + flatBonus;
  } else if (spell.autoHit && spell.damage && targets.length > 0) {
    const { count, sides, flatBonus } = parseDice(spell.damage.dice);
    const darts = spell.dartCount || 1;
    let damage = 0;
    for (let d = 0; d < darts; d++) {
      damage += rollDice(count, sides) + flatBonus;
    }
    result.autoHitDamage = damage;
    result.damage = { total: damage, type: spell.damage.type };
  } else if (spell.hpPoolDice && spell.hpPoolCondition && targets.length > 0) {
    const { count, sides, flatBonus } = parseDice(spell.hpPoolDice);
    let pool = rollDice(count, sides) + flatBonus;
    const rollTotal = pool;

    const NPC_FALLBACK_HP = 5;

    const resolvedTargets = targets.map(t => {
      const enemy = combat?.enemies.find(e => e.id === t.id);
      const player = combat?.party?.find(p => p.id === t.id);
      const entity = enemy || player;
      return {
        id: t.id,
        hp: entity?.hp?.current ?? NPC_FALLBACK_HP,
        name: entity?.name || t.id,
        isUnknown: !entity,  
      };
    })
    .filter(t => t.hp > 0)
    .sort((a, b) => a.hp - b.hp);

    const affected: Array<{ targetId: string; hpCost: number }> = [];

    for (const target of resolvedTargets) {
      if (pool <= 0) break;
      if (target.hp <= pool) {
        pool -= target.hp;
        affected.push({ targetId: target.id, hpCost: target.hp });
      }
    }

    if (affected.length > 0) {
      result.affectedTargets = affected;
      result.hasEffect = true;
    }

    result.narrationHint = affected.length > 0
      ? `Rolled ${spell.hpPoolDice} = ${rollTotal} HP pool. Affected: ${affected.map(t => t.targetId).join(', ')}.`
      : `Rolled ${spell.hpPoolDice} = ${rollTotal} HP pool. No creatures affected.`;
  }

  if (spell.scaling && slotLevel > spell.level && (spell.damage || spell.healing)) {
    
    const applicableTiers = spell.scaling.filter(s => slotLevel >= s.atSlotLevel);
    const bestScale = applicableTiers[applicableTiers.length - 1];
    if (bestScale) {
      if (bestScale.damageDice) {
        const { count, sides } = parseDice(bestScale.damageDice);
        if (result.damage) result.damage.total += rollDice(count, sides);
      } else if (bestScale.bonusDice) {
        const { count, sides } = parseDice(bestScale.bonusDice);
        let bonus = rollDice(count, sides);
        if (wasCrit) bonus *= 2;
        if (result.damage) result.damage.total += bonus;
      }
      if (spell.healing && bestScale.bonusDice) {
        const { count, sides } = parseDice(bestScale.bonusDice);
        result.healing = (result.healing ?? 0) + rollDice(count, sides);
      }
    }
  }

  if (spell.level === 0 && spell.damage) {
    const charLevel = character.level;
    let scalingDice = 0;
    if (charLevel >= 17) scalingDice = 3;
    else if (charLevel >= 11) scalingDice = 2;
    else if (charLevel >= 5) scalingDice = 1;
    if (scalingDice > 0) {
      const base = parseDice(spell.damage.dice);
      const bonus = base.count * scalingDice;
      const { total: scalingDmg, rolls: scalingRolls } = rollDiceWithDetails(bonus, base.sides);
      if (result.damage) {
        result.damage.total += scalingDmg;
        const scaleDetail = `scaling: ${bonus}d${base.sides} [${scalingRolls.join('+')}]`;
        if (result.damageRollDetails) {
          result.damageRollDetails += ` + ${scaleDetail}`;
        } else {
          result.damageRollDetails = scaleDetail;
        }
      }
      result.cantripScalingDamage = bonus;
    }
  }

  if (!result.narrationHint) {
    if (result.attackRoll) {
      const mod = result.attackRoll.total - result.attackRoll.d20;
      const rollDetails = ` (d20: ${result.attackRoll.d20} + ${mod})`;
      const dmgDetails = result.damageRollDetails ? ` (${result.damageRollDetails})` : '';
      result.narrationHint = result.attackRoll.isCrit
        ? `Critical hit! Rolled ${result.attackRoll.total} to hit${rollDetails}. ${result.damage?.total || 0} ${result.damage?.type || ''} damage${dmgDetails}.`
        : result.attackRoll.isFumble
        ? `Critical miss! Rolled ${result.attackRoll.total} to hit${rollDetails}.`
        : `Rolled ${result.attackRoll.total} to hit${rollDetails}. ${result.damage?.total || 0} ${result.damage?.type || ''} damage${dmgDetails}.`;
    } else if (result.saveRoll) {
      const dmgDetails = result.damageRollDetails ? ` (${result.damageRollDetails})` : '';
      result.narrationHint = `DC ${result.saveRoll.dc} ${result.saveRoll.stat.toUpperCase()} save. ${result.damage?.total || 0} ${result.damage?.type || ''} damage${dmgDetails}.`;
    } else if (result.healing) {
      result.narrationHint = `Healed for ${result.healing} HP.`;
    } else if (result.autoHitDamage) {
      result.narrationHint = `Auto-hit. ${result.damage?.total || 0} ${result.damage?.type || ''} damage.`;
    }
  }

  return result;
}

/** Result of a concentration break attempt, including whether concentration was broken and the associated CON save details. */
export interface ConcentrationBreakResult {
  broken: boolean;
  roll?: number;
  d20Roll?: number;
  modifier?: number;
  dc?: number;
  success?: boolean;
}

/** Attempts to break a character's concentration, handling damaged (CON save), voluntary, and incapacitated reasons, and cleaning up tied conditions. */
export function breakConcentration(character: Character, reason: 'damaged' | 'voluntary' | 'incapacitated', damage = 0): ConcentrationBreakResult {
  if (!character.concentrationSpellId) return { broken: false };
  const spellId = character.concentrationSpellId;
  if (reason === 'damaged') {
    const dc = Math.max(10, Math.floor(damage / 2));
    const modifier = getAbilityMod(character, 'con') + getProficiencyBonus(character);
    const d20Roll = cryptoRoll(20);
    const roll = d20Roll + modifier - getExhaustionPenalty(character);
    const success = roll >= dc;
    if (success) return { broken: false, roll, d20Roll, modifier, dc, success: true };
    character.concentrationSpellId = undefined;
    
    if (character.conditions && character.conditions.length > 0) {
      const toRemove = character.conditions.filter(c => c.source === spellId);
      for (const cond of toRemove) {
        const idx = character.conditions.indexOf(cond);
        if (idx !== -1) {
          if (cond.onRemove) {
            if (typeof cond.onRemove === 'function') {
              cond.onRemove(character);
            } else if (cond.onRemove.kind === 'acBonus') {
              character.acBonus = Math.max(0, (character.acBonus || 0) - cond.onRemove.value);
            }
          }
          character.conditions.splice(idx, 1);
        }
      }
    }
    return { broken: true, roll, d20Roll, modifier, dc, success: false };
  }
  character.concentrationSpellId = undefined;
  
  if (character.conditions && character.conditions.length > 0) {
    const toRemove = character.conditions.filter(c => c.source === spellId);
    for (const cond of toRemove) {
      const idx = character.conditions.indexOf(cond);
      if (idx !== -1) {
        if (cond.onRemove) {
          if (typeof cond.onRemove === 'function') {
            cond.onRemove(character);
          } else if (cond.onRemove.kind === 'acBonus') {
            character.acBonus = Math.max(0, (character.acBonus || 0) - cond.onRemove.value);
          }
        }
        character.conditions.splice(idx, 1);
      }
    }
  }
  return { broken: true };
}
