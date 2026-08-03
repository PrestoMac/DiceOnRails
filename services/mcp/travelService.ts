import { Character, GameState, MCPResponse, InventoryItem, Enemy, LocationSignificance, QuestDifficulty } from '../../types';
import { cryptoRoll } from '../../utils/random';
import { fail } from './_shared';
import { SKILLS_LIST } from '../../constants';
import { isDebugMode } from '../../utils/debug';
import { getMod, getClassDef, recoverResources as classEngineRecoverResources } from '../classEngine';
import { computeXp, awardXpToParty, formatXpAwardLine } from '../xpEngine';
import { getConditionEffects, applyCondition, tickConditionsByTime, tickConditionsByRounds, hasCondition, getExhaustionPenalty, executeConditionOnRemove } from '../conditionEngine';
import { getTimePeriod, AMBIENT_LINES } from '../../utils/timeUtils';
import { applyEffects, getEffects, SkillCheckContext, RestContext } from '../effectDispatcher';
import { SPELLS_BY_ID } from '../../utils/spells';
import { breakConcentration as engineBreakConcentration, checkConcentrationExpiry } from '../spellcastingEngine';
import { ensureGameStateFields } from './stateService';
import { ensureAllCharacterFields } from '../characterUtils';
import { resolveAdvantage } from '../../utils/combatUtils';
import {
  rerollDamageValueIfApplicable,
  getOffHandAbilityModifier,
} from '../featsService';

export const EXHAUSTION_THRESHOLDS = [16, 18, 20, 22, 24, 26, 28, 30, 32, 34];
export function levelForHours(h: number): number {
  for (let i = 0; i < EXHAUSTION_THRESHOLDS.length; i++) {
    if (h < EXHAUSTION_THRESHOLDS[i]) return i;
  }
  return EXHAUSTION_THRESHOLDS.length;
}

export const MAX_SAFE_EXHAUSTION = 2;
export const MAX_MOVE_TO_LEG_MINUTES = 240;

export interface TimeAdvanceValidation { ok: boolean; message: string; }

export function validateTravelTimeAdvance(
  toolName: string,
  timePassed: number,
): TimeAdvanceValidation {
  const minutes = Math.max(0, timePassed);
  if (toolName === 'move_to' && minutes > MAX_MOVE_TO_LEG_MINUTES) {
    return {
      ok: false,
      message: `This journey leg is ${minutes} minutes — longer than the ${MAX_MOVE_TO_LEG_MINUTES}-minute (4h) maximum for a single move. Break the journey into shorter legs (one move_to per leg) and insert long_rest stops along the way.`,
    };
  }
  return { ok: true, message: '' };
}

/** Dependencies required by the TravelService. */
export interface TravelDeps {
  getTarget: (id?: string) => Character | undefined;
  adjust_currency: (gp?: number, sp?: number, cp?: number, targetId?: string) => Promise<MCPResponse>;
  update_inventory: (item_name: string, action: 'add' | 'remove' | 'edit', quantity?: number, new_name?: string, targetId?: string, type?: InventoryItem['type'], rarity?: InventoryItem['rarity'], description?: string, stats?: InventoryItem['stats'], equipped?: boolean, cost_gp?: number, cost_sp?: number, cost_cp?: number, autoDeductMarketPrice?: boolean, craft?: boolean) => Promise<MCPResponse>;
  log_lore: (title: string, content: string, category: string) => Promise<MCPResponse>;
  upsert_quest: (title: string, description: string, status: 'active' | 'completed' | 'failed', difficulty?: QuestDifficulty, reputationChanges?: Array<{ faction: string; delta: number }>) => Promise<MCPResponse>;
}

/** Service interface for movement, narration, rests, dice rolling, and skill checks. */
export interface TravelService {
  move_to(location_name: string, description?: string, targetId?: string, skillCheck?: Record<string, unknown>, significance?: LocationSignificance): Promise<MCPResponse>;
  narrate_turn(narration: string, timePassed?: number, xp?: number, roleplay?: 'dialogue' | 'creative'): Promise<MCPResponse>;
  setAtmosphere(url: string): void;
  setStartingLocation(location: { name: string; description: string; introHook?: string; atmosphereUrl?: string }): void;
  cacheLocationImage(name: string, url: string): void;
  getCachedLocationImage(name: string): string | undefined;
  roll_dice(sides: number, count?: number, modifier?: number, target_ac?: number, target_name?: string, roll_label?: string, isDamageRoll?: boolean, isOffHand?: boolean, weaponName?: string, attackerId?: string): Promise<MCPResponse>;
  check_skill(skill_name: string, difficulty: number, targetId?: string, onSuccess?: Record<string, unknown>): Promise<MCPResponse>;
  long_rest(narration?: string, autoAdvanceTime?: boolean): Promise<MCPResponse>;
  short_rest(targetId?: string, narration?: string, autoAdvanceTime?: boolean): Promise<MCPResponse>;
  arcane_recovery(characterId: string, selections: Array<{ level: number; count: number }>): Promise<MCPResponse>;
  natural_recovery(characterId: string, selections: Array<{ level: number; count: number }>): Promise<MCPResponse>;
}

/** Creates a new TravelService instance operating on the given GameState. */
export function createTravelService(state: GameState, deps: TravelDeps): TravelService {
  function clearNonMinuteConditions(char: Character): string[] {
    if (!char.conditions || char.conditions.length === 0) return [];
    const toRemove = char.conditions.filter(c => c.durationUnit !== 'minute');
    for (const cond of toRemove) {
      executeConditionOnRemove(char, cond);
    }
    char.conditions = char.conditions.filter(c => c.durationUnit === 'minute');
    return toRemove.map(c => c.id);
  }

  async function executeOnSuccessConsequences(onSuccess: Record<string, unknown>, targetId?: string): Promise<string[]> {
    const logs: string[] = [];
    if (onSuccess.awardCurrency) {
      const cr = await deps.adjust_currency(
        onSuccess.awardCurrency.gp || 0, onSuccess.awardCurrency.sp || 0,
        onSuccess.awardCurrency.cp || 0, targetId);
      if (cr.success) logs.push(cr.message);
    }
    if (onSuccess.logLore) {
      const lr = await deps.log_lore(
        onSuccess.logLore.title, onSuccess.logLore.content,
        onSuccess.logLore.category);
      if (lr.success) logs.push(lr.message);
    }
    if (onSuccess.upsertQuest) {
      const qr = await deps.upsert_quest(
        onSuccess.upsertQuest.title, onSuccess.upsertQuest.description || '',
        onSuccess.upsertQuest.status,
        onSuccess.upsertQuest.difficulty as QuestDifficulty | undefined);
      if (qr.success) logs.push(qr.message);
    }
    if (onSuccess.updateInventory) {
      const ir = await deps.update_inventory(
        onSuccess.updateInventory.item_name, 'add',
        onSuccess.updateInventory.quantity || 1,
        undefined, targetId, undefined, undefined, undefined, undefined, undefined);
      if (ir.success) logs.push(ir.message);
    }
    return logs;
  }

  return {
    setAtmosphere(url: string) {
      state.currentAtmosphereUrl = url;
    },

    setStartingLocation(location: { name: string; description: string; introHook?: string; atmosphereUrl?: string }) {
      state.startingLocation = { name: location.name, description: location.description, introHook: location.introHook || '' };
      state.worldDescription = location.description;
      if (location.atmosphereUrl) {
        state.currentAtmosphereUrl = location.atmosphereUrl;
        if (!state.locationImages) state.locationImages = {};
        state.locationImages[location.name] = location.atmosphereUrl;
      }
    },

    cacheLocationImage(name: string, url: string) {
      if (!state.locationImages) state.locationImages = {};
      state.locationImages[name] = url;
    },

    getCachedLocationImage(name: string): string | undefined {
      return state.locationImages?.[name];
    },

    async roll_dice(sides, count = 1, modifier = 0, target_ac, target_name, roll_label, isDamageRoll, isOffHand, weaponName, attackerId) {
      const attacker = attackerId ? deps.getTarget(attackerId) : null;
      let safeModifier = Number(modifier) || 0;
      if (attacker && sides === 20 && !isDamageRoll && safeModifier === 0 && weaponName) {
        const cleanWpn = weaponName.toLowerCase().trim().replace(/\s+/g, '-');
        const isSpell = SPELLS_BY_ID[cleanWpn] || SPELLS_BY_ID[weaponName.toLowerCase().trim()];
        if (isSpell) {
          safeModifier = getSpellAttackBonus(attacker);
        }
      }
      const results: number[] = [];
      const rerolledIndices: number[] = [];

      for (let i = 0; i < count; i++) {
        let v = cryptoRoll(sides);
        if (attacker && isDamageRoll && sides !== 20) {
          const weapon = weaponName
            ? attacker.inventory.find(it => it.name.toLowerCase() === weaponName.toLowerCase()) || null
            : null;
          const rerolled = rerollDamageValueIfApplicable(attacker, weapon, !!isOffHand, sides, v);
          if (rerolled !== v) {
            rerolledIndices.push(i);
            v = rerolled;
          }
        }
        results.push(v);
      }

      const rawTotal = results.reduce((a, b) => a + b, 0);
      let offHandBonus = 0;
      if (attacker && isDamageRoll && isOffHand) {
        offHandBonus = getOffHandAbilityModifier(attacker);
      }
      let total = rawTotal + safeModifier + offHandBonus;

      if (sides === 20 && count === 1 && !isDamageRoll) {
        const targetObj = target_name
          ? state.party.find((c: Character) => c.id === target_name || c.name.toLowerCase() === target_name.toLowerCase()) ||
            state.combat?.enemies.find((e: Enemy) => e.id === target_name || e.name.toLowerCase() === target_name.toLowerCase())
          : undefined;
        let hasAdvantage = false, hasDisadvantage = false;
        if (attacker) {
          const ae = getConditionEffects(attacker);
          if (ae.advantageOnAttacks) hasAdvantage = true;
          if (ae.disadvantageOnAttacks) hasDisadvantage = true;
        }
        if (targetObj) {
          const te = getConditionEffects(targetObj);
          if (te.attacksAgainstHaveAdvantage) hasAdvantage = true;
        }
        const secondRoll = cryptoRoll(20);
        const resolved = resolveAdvantage(results[0], secondRoll, hasAdvantage, hasDisadvantage);
        if (resolved.hadAdvantage || resolved.hadDisadvantage) {
          results[0] = advResult.roll;
          const newRawTotal = results.reduce((a: number, b: number) => a + b, 0);
          const ohb = attacker && isOffHand ? getOffHandAbilityModifier(attacker) : 0;
          total = newRawTotal + safeModifier + ohb;
          state.lastDiceRoll = { sides, count, modifier: safeModifier + ohb, results, total };
        }
      }

      state.lastDiceRoll = { sides, count, modifier: safeModifier + offHandBonus, results, total };

      const labelText = roll_label ? ` [${roll_label}]` : '';
      const modStr = (safeModifier + offHandBonus) !== 0
        ? (safeModifier + offHandBonus > 0 ? '+' + (safeModifier + offHandBonus) : (safeModifier + offHandBonus))
        : '';
      let message = `Rolled ${count}d${sides}${modStr} for a total of ${total}${labelText}.`;
      if (offHandBonus && isDamageRoll) {
        message += ` (Off-hand includes +${offHandBonus} from Two-Weapon Fighting.)`;
      }
      if (rerolledIndices.length > 0) {
        message += ` (GWF rerolled die${rerolledIndices.length > 1 ? 's' : ''}: ${rerolledIndices.map(i => results[i]).join(', ')})`;
      }
      let isHit: boolean | undefined = undefined;
      let isCritical: boolean = false;
      let isFumble: boolean = false;

      if (sides === 20 && count === 1) {
        const firstRoll = results[0];
        isCritical = firstRoll === 20;
        isFumble = firstRoll === 1;

        if (target_ac !== undefined && target_ac > 0) {
          isHit = isCritical || total >= target_ac;
          if (isFumble) {
            isHit = false;
          }

          const tName = target_name || 'the target';
          const labelDesc = roll_label ? ` using ${roll_label}` : '';
          if (isCritical) {
            message = `CRITICAL HIT on ${tName}${labelDesc}! Natural 20! (Damage dice doubled.)`;
          } else if (isFumble) {
            message = `Critical MISS on ${tName}${labelDesc}. Natural 1!`;
          } else if (isHit) {
            message = `Attack HIT ${tName}${labelDesc}! Total ${total} vs AC ${target_ac} (${count}d${sides} Roll: ${results[0]} + Mod: ${safeModifier}).`;
          } else {
            message = `Attack MISSED ${tName}${labelDesc}. Total ${total} vs AC ${target_ac} (${count}d${sides} Roll: ${results[0]} + Mod: ${safeModifier}).`;
          }
        }
      }

      return {
        success: true,
        data: {
          sides, count, modifier: safeModifier + offHandBonus, results, total,
          target_ac, target_name, success: isHit, roll_label,
          isCritical, isFumble, isDamageRoll, isOffHand, offHandBonus,
          rerolledIndices
        },
        message
      };
    },

    async check_skill(skill_name, difficulty, targetId, onSuccess) {
      const target = deps.getTarget(targetId);
      if (!target) return fail("Target character not found. Please specify a valid target.");

      const statMap: Record<string, keyof typeof target.stats> = {
        'athletics': 'str',
        'acrobatics': 'dex', 'stealth': 'dex', 'sleight of hand': 'dex',
        'arcana': 'int', 'history': 'int', 'investigation': 'int', 'nature': 'int', 'religion': 'int',
        'animal handling': 'wis', 'insight': 'wis', 'medicine': 'wis', 'perception': 'wis', 'survival': 'wis',
        'deception': 'cha', 'intimidation': 'cha', 'performance': 'cha', 'persuasion': 'cha'
      };

      const statKeys: Record<string, keyof typeof target.stats> = {
        'str': 'str', 'strength': 'str',
        'dex': 'dex', 'dexterity': 'dex',
        'con': 'con', 'constitution': 'con',
        'int': 'int', 'intelligence': 'int',
        'wis': 'wis', 'wisdom': 'wis',
        'cha': 'cha', 'charisma': 'cha'
      };

      const cleanSkill = skill_name.toLowerCase().trim()
        .replace(/\s*(?:check|roll|save|saving\s+throw)$/i, '')
        .trim();

      let matchedSkill: string | undefined = undefined;
      let statKey: keyof typeof target.stats = 'str';

      if (statKeys[cleanSkill]) {
        statKey = statKeys[cleanSkill];
      } else {
        if (statMap[cleanSkill]) {
          matchedSkill = cleanSkill;
          statKey = statMap[cleanSkill];
        } else {
          const foundKey = Object.keys(statMap).find(k => cleanSkill.includes(k) || k.includes(cleanSkill));
          if (foundKey) {
            matchedSkill = foundKey;
            statKey = statMap[foundKey];
          } else {
            statKey = 'str';
          }
        }
      }

      const statValue = (target.stats as Record<string, number>)[statKey] || 10;
      const modifier = getMod(statValue);

      const skillRank = matchedSkill ? (target.skills?.[matchedSkill] || 0) : 0;

      const roll = cryptoRoll(20);
      const skillCtx: SkillCheckContext = {
        _hook: 'onSkillCheck',
        roll,
        skillName: matchedSkill || cleanSkill,
        character: target,
        skillBonus: 0,
      };
      const afterSkill = applyEffects(target, 'onSkillCheck', skillCtx);
      const finalRoll = afterSkill.roll;
      const total = finalRoll + modifier + skillRank + afterSkill.skillBonus - getExhaustionPenalty(target);
      const success = total >= difficulty;

      let xpGained = 0;
      let xpMsg = "";

      if (success) {
        const amount = computeXp('skill', { dc: difficulty, nat20: finalRoll === 20 });
        xpGained = amount;
        const xpResult = awardXpToParty(state, amount);
        xpMsg = ' ' + formatXpAwardLine('skill', xpResult);
        if (finalRoll === 20) xpMsg += ' [Nat 20: XP doubled!]';
      }

      if (success && onSuccess) {
        const consequenceLogs = await executeOnSuccessConsequences(onSuccess, targetId);
        if (consequenceLogs.length > 0) xpMsg += ' ' + consequenceLogs.join(' ');
      }

      const labelName = matchedSkill
        ? (SKILLS_LIST.find(s => s.name === matchedSkill)?.label || matchedSkill)
        : (statKey.toUpperCase() + ' Check');

      return {
        success: true,
        data: { roll: finalRoll, modifier, skillRank, total, difficulty, success, character: target.name, skillName: labelName, xpGained },
        message: `${target.name} ${labelName}: ${success ? 'SUCCESS' : 'FAILURE'} (Total ${total} vs DC ${difficulty}) [Roll: ${finalRoll}, Stat Mod: ${modifier >= 0 ? '+' : ''}${modifier}, Skill Rank: +${skillRank}].${xpMsg}`
      };
    },

    async move_to(location_name, description, targetId, skillCheck, significance) {
      if (targetId) {
        const target = state.party.find(c => c.id === targetId);
        if (target) {
          target.location = location_name;
          state.sessionLogs.push(`${target.name} moved to ${location_name}.`);
        }
      } else {
        state.party.forEach(c => c.location = location_name);
        state.sessionLogs.push(`Party moved to ${location_name}.`);
      }
      if (description) {
        state.worldDescription = description;
      }
      let logMsg = targetId ? `${state.party.find(c => c.id === targetId)?.name || 'Someone'} travelled to ${location_name}.` : `The party travelled to ${location_name}.`;

      if (skillCheck) {
        const skillResult = await this.check_skill(
          skillCheck.skill_name, skillCheck.difficulty, targetId);
        if (skillResult.data?.success && skillCheck.onSuccess) {
          const consequenceLogs = await executeOnSuccessConsequences(skillCheck.onSuccess, targetId);
          if (consequenceLogs.length > 0) skillResult.message += ' ' + consequenceLogs.join(' ');
        }
        logMsg += '\n' + skillResult.message;
      }

      let xpAwarded = 0;
      if (!Array.isArray(state.visitedLocations)) state.visitedLocations = [];
      const locationKey = location_name.toLowerCase().trim();
      const isFirstVisit = !state.visitedLocations.includes(locationKey);
      if (isFirstVisit) {
        state.visitedLocations.push(locationKey);
        const amount = computeXp('explore', { significance });
        xpAwarded = amount;
        const xpResult = awardXpToParty(state, amount);
        logMsg += ' ' + formatXpAwardLine('explore', xpResult);
      }

      return { success: true, data: { newLocation: location_name, xpAwarded, firstVisit: isFirstVisit }, message: logMsg };
    },

    async narrate_turn(narration, timePassed = 0, xp, roleplay) {
      const logs: string[] = [];
      const safeTimePassed = (typeof timePassed === 'number' && !isNaN(timePassed)) ? Math.max(0, timePassed) : 0;

      if (isDebugMode) {
        console.log(`[travelService] narrate_turn called: timePassed=${safeTimePassed}, current gameTime=${state.gameTime ?? 0}`);
      }

      if (safeTimePassed > 0) {
        ensureGameStateFields(state);
        const oldTime = state.gameTime as number;
        state.gameTime = (state.gameTime as number) + safeTimePassed;

        if (isDebugMode) {
          console.log(`[travelService] gameTime advanced: ${oldTime} → ${state.gameTime}`);
        }

        const lastRest = (state.lastLongRestTime != null && state.lastLongRestTime >= 0)
          ? state.lastLongRestTime
          : (state.gameTime ?? 0);
        const baseHours = Math.floor(Math.max(0, ((state.gameTime ?? 0) - lastRest - 480)) / 60);
        const hoursAwake = Math.max(0, baseHours);


        if (hoursAwake >= 12 && hoursAwake < 16 && !state._tiredWarningFired) {
          logs.push("The party is growing road-weary. They should look for a place to make camp soon.");
          state._tiredWarningFired = true;
        }

        for (const char of state.party) {
          const charOffset = char.racialTraits?.includes('trance') ? lastRest - 240 : lastRest;
          const charHours = Math.max(0, Math.floor(Math.max(0, ((state.gameTime ?? 0) - charOffset - 480)) / 60));

          for (let i = 0; i < MAX_SAFE_EXHAUSTION; i++) {
            const level = i + 1;
            const threshold = EXHAUSTION_THRESHOLDS[i];
            if (charHours >= threshold && !hasCondition(char, `exhaustion-${level}`)) {
              applyCondition(char, {
                id: `exhaustion-${level}`,
                source: 'fatigue',
                duration: -1,
                durationUnit: 'permanent',
                onRemove: undefined
              });
              logs.push(`${char.name} gains exhaustion level ${level} (${charHours}h without rest).`);

              if (level === 10) {
                char.hp.current = 0;
                if (!char.deathSaves) {
                  char.deathSaves = { successes: 0, failures: 0, isStable: false };
                }
                applyCondition(char, { id: 'unconscious', source: 'exhaustion', duration: -1, durationUnit: 'permanent' });
                logs.push(`${char.name} collapses from exhaustion — dead.`);
              }
            }
          }
          if (charHours >= EXHAUSTION_THRESHOLDS[MAX_SAFE_EXHAUSTION]) {
            logs.push(`${char.name} has reached the maximum safe travel-fatigue (exhaustion ${MAX_SAFE_EXHAUSTION}) and must long_rest before traveling further.`);
          }
        }

        const oldPeriod = getTimePeriod(oldTime);
        const newPeriod = getTimePeriod(state.gameTime as number);
        if (oldPeriod !== newPeriod && AMBIENT_LINES[newPeriod]) {
          logs.push(AMBIENT_LINES[newPeriod]);
        }

        for (const char of state.party) {
          const expired = tickConditionsByTime(char, safeTimePassed);

          if (!state.combat?.isActive) {
            const roundsElapsed = Math.floor(safeTimePassed * 10);
            if (roundsElapsed > 0) {
              expired.push(...tickConditionsByRounds(char, roundsElapsed));
            }
          }

          if (char.concentrationSpellId) {
            const sid = char.concentrationSpellId;
            const startTime = char.runtime?.concentrationStartTime ?? 0;
            const ended = checkConcentrationExpiry(char, (state.gameTime as number) - startTime);
            if (ended) {
              if (state.combat?.activeDoTs) {
                state.combat.activeDoTs = state.combat.activeDoTs.filter(
                  dot => !(dot.casterId === char.id && dot.spellId === sid)
                );
              }
              expired.push(`concentration (${ended})`);
            }
          }

          if (char.runtime?.transformationState?.duration != null) {
            char.runtime.transformationState.duration -= safeTimePassed;
            if (char.runtime.transformationState.duration <= 0) {
              const orig = char.runtime.transformationState.originalForm;
              if (orig) {
                char.stats = orig.stats;
                char.hp.current = orig.hp.current;
                char.hp.max = orig.hp.max;
              }
              char.runtime.transformationState = undefined;
              expired.push('transformation');
            }
          }


          if (char.raging && !state.combat?.isActive && safeTimePassed > 0) {
            char.raging = false;
            if (getEffects(char, 'frenzy-exhaustion').length > 0) {
              applyCondition(char, { id: 'exhaustion-1', source: 'frenzy', duration: -1, durationUnit: 'permanent' });
              logs.push(`${char.name} gains exhaustion level 1 from Frenzy.`);
            }
          }

          if (expired.length > 0) {
            logs.push(`${char.name}'s ${expired.join(', ')} wore off.`);
            if (isDebugMode) console.log(`[travelService] ${char.name} effects expired:`, expired);
          }
        }

        if (state.combat?.enemies) {
          for (const enemy of state.combat.enemies) {
            const expired = tickConditionsByTime(enemy, safeTimePassed);

            if (!state.combat.isActive) {
              const roundsElapsed = Math.floor(safeTimePassed * 10);
              if (roundsElapsed > 0) {
                expired.push(...tickConditionsByRounds(enemy, roundsElapsed));
              }
            }

            if (enemy.summonDurationRemaining != null) {
              enemy.summonDurationRemaining -= safeTimePassed;
              if (enemy.summonDurationRemaining <= 0) {
                enemy.isDead = true;
                enemy.summonExpired = true;
                logs.push(`${enemy.name} vanishes — its summoning duration expired.`);
              }
            }

            if (expired.length > 0) {
              logs.push(`${enemy.name}'s ${expired.join(', ')} wore off.`);
            }
          }
          state.combat.enemies = state.combat.enemies.filter(e => !e.summonExpired);
        }
      }

      let xpAwarded = 0;
      let rawAmount: number | undefined;
      if (typeof xp === 'number' && xp > 0) {
        rawAmount = xp;
      } else if (typeof xp !== 'number') {
        if (roleplay === 'dialogue') {
          rawAmount = 1;
        } else if (roleplay === 'creative') {
          rawAmount = 5;
        } else if (!state.combat?.isActive && narration && narration.trim().length > 0) {
          rawAmount = 1;
        }
      }
      if (rawAmount !== undefined) {
        const amount = computeXp('roleplay', { amount: rawAmount });
        xpAwarded = amount;
        const xpResult = awardXpToParty(state, amount);
        logs.push(formatXpAwardLine('roleplay', xpResult));
      }

      const suffix = logs.length > 0 ? '\n' + logs.join('\n') : '';
      return {
        success: true,
        data: { narration, timePassed: safeTimePassed, gameTime: state.gameTime, logs, xpAwarded },
        message: narration + suffix
      };
    },

    async long_rest(narration, autoAdvanceTime) {
      const messages: string[] = [];
      const healResults: Array<{ name: string; class?: string; level: number; hpRestored: number; hpMax: number; hitDieSize: number; hitDicePrev: number; hitDiceNew: number; hitDiceMax: number }> = [];
      ensureAllCharacterFields(state.party);
      ensureGameStateFields(state);
      const elapsed = (state.gameTime as number) - (state.lastLongRestTime ?? -960);
      if (elapsed < 960) {
        const remaining = 960 - elapsed;
        return fail(`Only ${Math.floor(elapsed / 60)}h since your last rest. You need ${Math.ceil(remaining / 60)}h more.`);
      }


      for (const char of state.party) {
        if (char.raging) {
          char.raging = false;
          if (getEffects(char, 'frenzy-exhaustion').length > 0) {
            applyCondition(char, { id: 'exhaustion-1', source: 'frenzy', duration: -1, durationUnit: 'permanent' });
            messages.push(`${char.name} gains exhaustion level 1 from Frenzy.`);
          }
        }
      }


      state._tiredWarningFired = false;

      for (const char of state.party) {
        if (char.concentrationSpellId) {
          engineBreakConcentration(char, char.hp.current <= 0 ? 'incapacitated' : 'voluntary');
          if (state.combat?.activeDoTs) {
            state.combat.activeDoTs = state.combat.activeDoTs.filter(dot => dot.casterId !== char.id);
          }
        }
      }

      for (const char of state.party) {
        if (char.hp.current <= 0) {
          messages.push(`${char.name} is unconscious and cannot benefit from the rest.`);
          continue;
        }
        // Exhaustion clear moved here — only for conscious characters
        if (char.conditions) char.conditions = char.conditions.filter(c => !c.id.startsWith('exhaustion-'));
        const prevHp = char.hp.current;
        const hpRestored = char.hp.max - prevHp;
        char.hp.current = char.hp.max;
        clearNonMinuteConditions(char);
        char.tempHp = 0;
        const recovered = Math.max(1, Math.floor(char.level / 2));
        const prevHd = char.hitDice.current;
        char.hitDice.current = Math.min(char.hitDice.max, char.hitDice.current + recovered);
        const classDef = getClassDef(char.class);
        const hitDieSize = classDef?.hitDie || 8;
        healResults.push({
          name: char.name,
          class: char.class,
          level: char.level,
          hpRestored,
          hpMax: char.hp.max,
          hitDieSize,
          hitDicePrev: prevHd,
          hitDiceNew: char.hitDice.current,
          hitDiceMax: char.hitDice.max,
        });
        classEngineRecoverResources(char, 'long');
        const restCtx: RestContext = { _hook: 'onLongRest', character: char };
        applyEffects(char, 'onLongRest', restCtx);
        // 2024 rule: each caster can replace one cantrip after a long rest, and prepared casters can re-prepare spells.
        if (classDef?.spellcasting) {
          char.cantripSwapAvailable = true;
          char.shortRestSpellSwapAvailable = true;
          char.longRestPrepAvailable = true;
        }

        for (const slot of char.resources) {
          if (slot.id.startsWith('spell-slot-')) slot.current = slot.max;
        }
        messages.push(
          `${char.name} rests. HP: ${prevHp} → ${char.hp.max}/${char.hp.max}. Hit Dice recovered: ${prevHd} → ${char.hitDice.current}/${char.hitDice.max}.`
        );
      }
      state.lastLongRestTime = state.gameTime;

      if (narration || autoAdvanceTime) {
        const timePassed = 480;
        const narrateResult = await this.narrate_turn(
          narration || `${state.party.map(c => c.name).join(', ')} complete a long rest.`,
          timePassed
        );
        // IMPORTANT: the narration prose must NOT be appended to `message` — the tool result
        // becomes a visible [System:long_rest] chat log, which would duplicate the narration
        // bubble. Narration lives ONLY in data.narration (the agent loop routes it to
        // inlineNarration). Time-advancement logs (exhaustion, condition expiry, etc.) and the
        // per-character heal details ARE surfaced here. Mirrors maybeFinalizeTurn.
        const narrData = narrateResult.data as { logs?: unknown } | undefined;
        const timeLogs = Array.isArray(narrData?.logs) ? narrData.logs as string[] : [];
        const baseMessage = messages.join('\n');
        return {
          success: true,
          data: { longRest: true, ...narrateResult.data },
          message: timeLogs.length > 0 ? baseMessage + '\n' + timeLogs.join('\n') : baseMessage
        };
      }

      return {
        success: true,
        data: { party: state.party, healResults },
        message: messages.join('\n')
      };
    },

    async arcane_recovery(characterId, selections) {
      const char = state.party.find(c => c.id === characterId);
      if (!char) return fail('Character not found.');
      if (char.class !== 'wizard') return fail('Only wizards can use Arcane Recovery.');

      let arPool = char.resources?.find(r => r.id === 'arcane-recovery');
      if (!arPool) {
        if (!char.resources) char.resources = [];
        char.resources.push({ id: 'arcane-recovery', name: 'Arcane Recovery', current: 1, max: 1, resetOn: 'long', source: 'class', sourceId: 'wizard' });
        arPool = char.resources[char.resources.length - 1];
      }
      if (arPool.current <= 0) return fail('Arcane Recovery already used today. Finish a long rest to regain it.');

      const maxLevels = Math.ceil(char.level / 2);
      const totalRequested = selections.reduce((sum, s) => sum + s.level * s.count, 0);
      if (totalRequested > maxLevels) return fail(`Cannot recover ${totalRequested} levels of spell slots. Maximum is ${maxLevels} (half your wizard level, rounded up).`);

      const recovered: Array<{ level: number; count: number }> = [];
      for (const sel of selections) {
        if (sel.level < 1 || sel.level > 5) return fail(`Arcane Recovery cannot target level ${sel.level} slots. Only levels 1–5 are eligible.`);
        if (sel.count < 1) continue;
        const slot = char.resources?.find(r => r.id === `spell-slot-${sel.level}`);
        if (!slot) return fail(`No level ${sel.level} spell slot resource found on ${char.name}.`);
        const actual = Math.min(sel.count, slot.max - slot.current);
        if (actual > 0) {
          slot.current += actual;
          recovered.push({ level: sel.level, count: actual });
        }
      }
      if (recovered.length === 0) return fail('No spell slots to recover — all selected slots are already at maximum.');

      arPool.current = 0;
      const detail = recovered.map(r => `${r.count} level-${r.level} slot${r.count > 1 ? 's' : ''}`).join(', ');
      return { success: true, data: { recovered }, message: `${char.name} uses Arcane Recovery to restore ${detail} (${maxLevels} levels max).` };
    },

    async natural_recovery(characterId, selections) {
      const char = state.party.find(c => c.id === characterId);
      if (!char) return fail('Character not found.');
      if (char.class !== 'druid') return fail('Only Druids can use Natural Recovery.');

      let nrPool = char.resources?.find(r => r.id === 'natural-recovery');
      if (!nrPool) {
        if (!char.resources) char.resources = [];
        char.resources.push({ id: 'natural-recovery', name: 'Natural Recovery', current: 1, max: 1, resetOn: 'long', source: 'class', sourceId: 'druid' });
        nrPool = char.resources[char.resources.length - 1];
      }
      if (nrPool.current <= 0) return fail('Natural Recovery already used. Finish a long rest to regain it.');

      const maxLevels = Math.ceil(char.level / 2);
      const totalRequested = selections.reduce((sum, s) => sum + s.level * s.count, 0);
      if (totalRequested > maxLevels) return fail(`Cannot recover ${totalRequested} levels of spell slots. Maximum is ${maxLevels} (half your druid level, rounded up).`);

      // Validate ALL selections BEFORE mutating anything — an invalid later selection
      // must not leave earlier slots partially recovered.
      for (const sel of selections) {
        if (sel.count < 1) continue;
        if (sel.level < 1 || sel.level > 5) return fail(`Natural Recovery cannot target level ${sel.level} slots. Only levels 1-5 are eligible.`);
        const slot = char.resources?.find(r => r.id === `spell-slot-${sel.level}`);
        if (!slot) return fail(`No level ${sel.level} spell slot resource found on ${char.name}.`);
      }

      const recovered: Array<{ level: number; count: number }> = [];
      for (const sel of selections) {
        if (sel.count < 1) continue;
        const slot = char.resources?.find(r => r.id === `spell-slot-${sel.level}`);
        if (!slot) continue;
        const actual = Math.min(sel.count, slot.max - slot.current);
        if (actual > 0) {
          slot.current += actual;
          recovered.push({ level: sel.level, count: actual });
        }
      }
      if (recovered.length === 0) return fail('No spell slots to recover — all selected slots are already at maximum.');

      nrPool.current = 0;
      const detail = recovered.map(r => `${r.count} level-${r.level} slot${r.count > 1 ? 's' : ''}`).join(', ');
      return { success: true, data: { recovered }, message: `${char.name} uses Natural Recovery to restore ${detail} (${maxLevels} levels max).` };
    },

    async short_rest(targetId, narration, autoAdvanceTime) {
      ensureAllCharacterFields(state.party);
      for (const char of state.party) {
        classEngineRecoverResources(char, 'short');
        const shortCtx: RestContext = { _hook: 'onShortRest', character: char };
        applyEffects(char, 'onShortRest', shortCtx);
        const classDef = getClassDef(char.class);
        if (classDef?.spellcasting) {
          char.shortRestSpellSwapAvailable = true;
        }
        for (const slot of char.resources) {
          if (slot.id.startsWith('spell-slot-') && slot.resetOn === 'short') slot.current = slot.max;
        }
        clearNonMinuteConditions(char);
      }

      const resultMsg = 'Short rest completed. Short-rest resources recovered.';

      if (narration || autoAdvanceTime) {
        const timePassed = 60;
        const narrateResult = await this.narrate_turn(
          narration || `${state.party.map(c => c.name).join(', ')} take a short rest.`,
          timePassed
        );
        // IMPORTANT: the narration prose must NOT be appended to `message` — the tool result
        // becomes a visible [System:short_rest] chat log, which would duplicate the narration
        // bubble. Narration lives ONLY in data.narration. Time-advancement logs ARE surfaced
        // here. Mirrors maybeFinalizeTurn.
        const narrData = narrateResult.data as { logs?: unknown } | undefined;
        const timeLogs = Array.isArray(narrData?.logs) ? narrData.logs as string[] : [];
        return {
          success: true,
          data: { shortRest: true, ...narrateResult.data },
          message: timeLogs.length > 0 ? resultMsg + '\n' + timeLogs.join('\n') : resultMsg
        };
      }

      return { success: true, data: {}, message: resultMsg };
    },
  };
}
