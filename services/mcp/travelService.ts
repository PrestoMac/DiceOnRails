import { Character, Enemy, GameState, MCPResponse } from '../../types';
import { cryptoRoll } from '../../utils/random';
import { fail, generateId } from './_shared';
import { SKILLS_LIST } from '../../constants';
import { isDebugMode } from '../../utils/debug';
import { getMod, getProficiencyBonus, getClassDef, recoverResources as classEngineRecoverResources } from '../classEngine';
import { awardExperience } from '../progressionService';
import { getConditionEffects, isIncapacitated, isUnconscious, applyCondition, removeCondition, tickConditions, tickConditionsByTime, tickConditionsByRounds, hasCondition, rollSaveAgainstCondition, getExhaustionPenalty } from '../conditionEngine';
import { rollDice } from '../diceEngine';
import { parseDiceFormula } from '../../utils/dice';
import { getTimePeriod, formatGameTime, AMBIENT_LINES } from '../../utils/timeUtils';
import { SPELLS_BY_ID, parseDuration } from '../../utils/spells';
import { breakConcentration as engineBreakConcentration } from '../spellcastingEngine';
import { ensureGameStateFields } from './stateService';
import {
  rerollDamageValueIfApplicable,
  getOffHandAbilityModifier,
  getResilientSaveBonus,
  getShieldMasterSaveBonus,
  hasFeat,
} from '../featsService';

interface Route {
  id: string; destination: string; distanceMiles: number;
  terrain: 'road' | 'forest' | 'mountain' | 'swamp' | 'desert' | 'city';
  encounterTable: Array<{ name: string; weight: number }>; description: string;
}

const EXHAUSTION_THRESHOLDS = [16, 18, 20, 22, 24, 26, 28, 30, 32, 34];
function levelForHours(h: number): number {
  for (let i = 0; i < EXHAUSTION_THRESHOLDS.length; i++) {
    if (h < EXHAUSTION_THRESHOLDS[i]) return i;
  }
  return EXHAUSTION_THRESHOLDS.length;
}

const ROUTES: Record<string, Route> = {
  'high-road': { id: 'high-road', destination: 'Waterdeep', distanceMiles: 120, terrain: 'road', encounterTable: [{ name: 'bandit', weight: 3 }, { name: 'merchant', weight: 4 }, { name: 'traveling-knight', weight: 2 }], description: 'A well-traveled trade road running along the Sword Coast.' },
  'neverwinter-woods-trail': { id: 'neverwinter-woods-trail', destination: 'Neverwinter', distanceMiles: 50, terrain: 'forest', encounterTable: [{ name: 'wolf', weight: 4 }, { name: 'bandit', weight: 2 }, { name: 'treant', weight: 1 }], description: 'A winding path through the ancient Neverwinter Woods.' }
};

function getRoute(id: string): Route | undefined { return ROUTES[id.toLowerCase()]; }

export interface TravelDeps {
  getTarget: (id?: string) => Character | undefined;
  adjust_currency: (gp?: number, sp?: number, cp?: number, targetId?: string) => Promise<MCPResponse>;
  update_inventory: (item_name: string, action: 'add' | 'remove' | 'edit', quantity?: number, new_name?: string, targetId?: string, type?: any, rarity?: any, description?: string, stats?: any, equipped?: boolean, cost_gp?: number, cost_sp?: number, cost_cp?: number, autoDeductMarketPrice?: boolean, craft?: boolean) => Promise<MCPResponse>;
  log_lore: (title: string, content: string, category: string) => Promise<MCPResponse>;
  upsert_quest: (title: string, description: string, status: 'active' | 'completed' | 'failed', reputationChanges?: Array<{ faction: string; delta: number }>) => Promise<MCPResponse>;
}

export interface TravelService {
  move_to(location_name: string, description?: string, targetId?: string, skillCheck?: any, route?: string, pace?: string): Promise<MCPResponse>;
  narrate_turn(narration: string, timePassed?: number): Promise<MCPResponse>;
  setAtmosphere(url: string): void;
  setStartingLocation(location: { name: string; description: string; atmosphereUrl?: string }): void;
  cacheLocationImage(name: string, url: string): void;
  getCachedLocationImage(name: string): string | undefined;
  roll_dice(sides: number, count?: number, modifier?: number, target_ac?: number, target_name?: string, roll_label?: string, isDamageRoll?: boolean, isOffHand?: boolean, weaponName?: string, attackerId?: string): Promise<MCPResponse>;
  check_skill(skill_name: string, difficulty: number, targetId?: string, onSuccess?: any): Promise<MCPResponse>;
  long_rest(narration?: string, autoAdvanceTime?: boolean): Promise<MCPResponse>;
  short_rest(targetId?: string, narration?: string, autoAdvanceTime?: boolean): Promise<MCPResponse>;
}

export function createTravelService(state: GameState, deps: TravelDeps): TravelService {
  function ensureCharacterFields(): void {
    for (const char of state.party) {
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
      if (!char.conditionsImmunities && (char.racialTraits || []).includes('fey-ancestry')) {
        char.conditionsImmunities = ['unconscious'];
      }
    }
  }

  function clearNonMinuteConditions(char: Character): string[] {
    if (!char.conditions || char.conditions.length === 0) return [];
    const toRemove = char.conditions.filter(c => c.durationUnit !== 'minute');
    for (const cond of toRemove) {
      if (cond.onRemove) {
        if (typeof cond.onRemove === 'function') cond.onRemove(char);
        else if (cond.onRemove.kind === 'acBonus')
          char.acBonus = Math.max(0, (char.acBonus || 0) - cond.onRemove.value);
      }
    }
    char.conditions = char.conditions.filter(c => c.durationUnit === 'minute');
    return toRemove.map(c => c.id);
  }

  async function executeOnSuccessConsequences(onSuccess: any, targetId?: string): Promise<string[]> {
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
        onSuccess.upsertQuest.status);
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

    setStartingLocation(location: { name: string; description: string; atmosphereUrl?: string }) {
      state.startingLocation = { name: location.name, description: location.description };
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
      let rerolledIndices: number[] = [];

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
          ? state.party.find((c: any) => c.id === target_name || c.name.toLowerCase() === target_name.toLowerCase()) ||
            state.combat?.enemies.find((e: any) => e.id === target_name || e.name.toLowerCase() === target_name.toLowerCase())
          : undefined;
        const advResult = (() => {
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
          if (hasAdvantage && hasDisadvantage) { hasAdvantage = false; hasDisadvantage = false; }
          let roll = results[0];
          if (hasAdvantage || hasDisadvantage) {
            const secondRoll = cryptoRoll(20);
            roll = hasAdvantage ? Math.max(roll, secondRoll) : Math.min(roll, secondRoll);
          }
          return { roll, hasAdvantage, hasDisadvantage };
        })();
        if (advResult.hasAdvantage || advResult.hasDisadvantage) {
          results[0] = advResult.roll;
          const newRawTotal = results.reduce((a: number, b: number) => a + b, 0);
          const ohb = attacker && isOffHand ? getOffHandAbilityModifier(attacker) : 0;
          total = newRawTotal + safeModifier + ohb;
          state.lastDiceRoll = { sides, count, modifier: safeModifier + ohb, results, total };
        }
      }

      state.lastDiceRoll = { sides, count, modifier: safeModifier + offHandBonus, results, total };

      let labelText = roll_label ? ` [${roll_label}]` : '';
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

      let cleanSkill = skill_name.toLowerCase().trim()
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

      const statValue = (target.stats as any)[statKey] || 10;
      const modifier = getMod(statValue);

      const skillRank = matchedSkill ? (target.skills?.[matchedSkill] || 0) : 0;

      const roll = cryptoRoll(20);
      const total = roll + modifier + skillRank - getExhaustionPenalty(target);
      const success = total >= difficulty;

      let xpGained = 0;
      let nat20Bonus = false;
      let xpMsg = "";

      if (success) {
        let baseXP = 5;
        if (difficulty >= 25) baseXP = 150;
        else if (difficulty >= 20) baseXP = 75;
        else if (difficulty >= 15) baseXP = 35;
        else if (difficulty >= 10) baseXP = 15;

        xpGained = baseXP;

        if (roll === 20) {
          xpGained += 25;
          nat20Bonus = true;
        }

        const partySize = state.party.length;
        let finalXp = xpGained;
        let soloBuffApplied = false;
        if (partySize === 1) {
          finalXp = Math.round(xpGained * 1.25);
          soloBuffApplied = true;
        }

        const progResult = awardExperience(target, finalXp);
        const idx = state.party.findIndex(c => c.id === target.id);
        if (idx > -1) {
          state.party[idx] = progResult.character;
        }

        xpMsg = ` Gained ${finalXp} XP${soloBuffApplied ? ' (includes +25% Solo Buff)' : ''}${nat20Bonus ? ' [Nat 20 Bonus included]' : ''}!`;
        if (progResult.leveledUp && progResult.levelUpSummary) {
          xpMsg += ` LEVEL UP! Now level ${progResult.levelUpSummary.newLevel}!`;
          state.sessionLogs.push(`${progResult.character.name} reached level ${progResult.levelUpSummary.newLevel}!`);
        }

        xpGained = finalXp;
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
        data: { roll, modifier, skillRank, total, difficulty, success, character: target.name, xpGained },
        message: `${target.name} ${labelName}: ${success ? 'SUCCESS' : 'FAILURE'} (Total ${total} vs DC ${difficulty}) [Roll: ${roll}, Stat Mod: ${modifier >= 0 ? '+' : ''}${modifier}, Skill Rank: +${skillRank}].${xpMsg}`
      };
    },

    async move_to(location_name, description, targetId, skillCheck, route, pace) {
      if (route) {
        const routeDef = getRoute(route);
        if (!routeDef) return fail(`Unknown route: "${route}".`);

        const paceSpeed = pace === 'fast' ? 4 : pace === 'slow' ? 2 : 3;
        const terrainMod = routeDef.terrain === 'road' ? 1 : routeDef.terrain === 'forest' ? 0.75 : 0.5;
        const mph = paceSpeed * terrainMod;
        const travelMinutes = Math.round((routeDef.distanceMiles / mph) * 60);

        const logs: string[] = [];
        logs.push(`Departing for ${routeDef.destination} via ${route}.`);
        logs.push(`Distance: ${routeDef.distanceMiles} miles. Estimated travel time: ${Math.floor(travelMinutes / 60)}h ${travelMinutes % 60}m.`);

        const watches = Math.max(1, Math.floor(travelMinutes / 240));
        const encounters: string[] = [];
        for (let w = 0; w < watches; w++) {
          if (cryptoRoll(20) >= 17) {
            const totalWeight = routeDef.encounterTable.reduce((s, e) => s + e.weight, 0);
            let roll = cryptoRoll(totalWeight);
            for (const entry of routeDef.encounterTable) {
              roll -= entry.weight;
              if (roll <= 0) { encounters.push(entry.name); break; }
            }
          }
        }

        if (encounters.length > 0) logs.push(`Encounters during travel: ${encounters.join(', ')}`);

        
        const travelLastRestVal = (state.lastLongRestTime != null && state.lastLongRestTime >= 0)
          ? state.lastLongRestTime
          : (state.gameTime ?? 0);
        const currentTravelHours = Math.floor(Math.max(0, ((state.gameTime ?? 0) - travelLastRestVal - 480)) / 60);
        const projectedGameTime = (state.gameTime ?? 0) + travelMinutes;
        const projectedTravelHours = Math.floor(Math.max(0, (projectedGameTime - travelLastRestVal - 480)) / 60);
        const currentTravelLevel = levelForHours(currentTravelHours);
        const projectedTravelLevel = levelForHours(projectedTravelHours);
        if (projectedTravelLevel - currentTravelLevel > 2) {
          return fail(`This ${travelMinutes}-minute route would push exhaustion from level ${currentTravelLevel} to level ${projectedTravelLevel} (${projectedTravelHours}h awake). Choose a closer destination or rest first.`);
        }
        if (currentTravelHours < 12 && projectedTravelHours >= 12 && projectedTravelLevel - currentTravelLevel <= 2) {
          logs.push("This route will leave the party road-weary. Consider resting first.");
        }

        const narrateResult = await this.narrate_turn(
          `The party travels along ${route}. ${routeDef.description}`,
          travelMinutes
        );

        state.party.forEach(c => c.location = routeDef.destination);

        return {
          success: true,
          data: { newLocation: routeDef.destination, travelMinutes, encounters, timeResult: narrateResult.data },
          message: logs.join('\n') + '\n' + narrateResult.message
        };
      }

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

      return { success: true, data: { newLocation: location_name }, message: logMsg };
    },

    async narrate_turn(narration, timePassed = 0) {
      const logs: string[] = [];
      const safeTimePassed = (typeof timePassed === 'number' && !isNaN(timePassed)) ? Math.max(0, timePassed) : 0;

      if (isDebugMode) {
        console.log(`[travelService] narrate_turn called: timePassed=${safeTimePassed}, current gameTime=${state.gameTime ?? 0}`);
      }

      if (safeTimePassed > 0) {
        ensureGameStateFields(state);
        const oldTime = state.gameTime!;
        state.gameTime! += safeTimePassed;

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

          for (let i = 0; i < EXHAUSTION_THRESHOLDS.length; i++) {
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
        }

        const oldPeriod = getTimePeriod(oldTime);
        const newPeriod = getTimePeriod(state.gameTime!);
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
            const spell = SPELLS_BY_ID[char.concentrationSpellId];
            const startTime = char.runtime?.concentrationStartTime ?? 0;
            const effectiveDuration = char.runtime?.concentrationEffectiveDuration ?? (() => {
              const parsed = spell?.parsedDuration ?? (spell ? parseDuration(spell.duration) : undefined);
              return parsed?.unit === 'minute' ? parsed.value : undefined;
            })();
            if (effectiveDuration != null && effectiveDuration <= (state.gameTime! - startTime)) {
              engineBreakConcentration(char, 'voluntary');
              if (state.combat?.activeDoTs) {
                state.combat.activeDoTs = state.combat.activeDoTs.filter(
                  dot => !(dot.casterId === char.id && dot.spellId === char.concentrationSpellId)
                );
              }
              expired.push(`concentration (${spell!.name})`);
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
            if (char.subclassId === 'berserker') {
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

      const suffix = logs.length > 0 ? '\n' + logs.join('\n') : '';
      return {
        success: true,
        data: { narration, timePassed: safeTimePassed, gameTime: state.gameTime, logs },
        message: narration + suffix
      };
    },

    async long_rest(narration, autoAdvanceTime) {
      const messages: string[] = [];
      const healResults: any[] = [];
      ensureCharacterFields();
      ensureGameStateFields(state);
      const elapsed = state.gameTime! - (state.lastLongRestTime ?? -960);
      if (elapsed < 960) {
        const remaining = 960 - elapsed;
        return fail(`Only ${Math.floor(elapsed / 60)}h since your last rest. You need ${Math.ceil(remaining / 60)}h more.`);
      }
      
      for (const char of state.party) {
        if (char.conditions) char.conditions = char.conditions.filter(c => !c.id.startsWith('exhaustion-'));
      }

      
      for (const char of state.party) {
        if (char.raging) {
          char.raging = false;
          if (char.subclassId === 'berserker') {
            applyCondition(char, { id: 'exhaustion-1', source: 'frenzy', duration: -1, durationUnit: 'permanent' });
            messages.push(`${char.name} gains exhaustion level 1 from Frenzy.`);
          }
        }
      }

      
      state._tiredWarningFired = false;

      for (const char of state.party) {
        if (char.hp.current <= 0) {
          messages.push(`${char.name} is unconscious and cannot benefit from the rest.`);
          continue;
        }
        const prevHp = char.hp.current;
        const hpRestored = char.hp.max - prevHp;
        char.hp.current = char.hp.max;
        char.concentrationSpellId = undefined;
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
        return {
          success: true,
          data: { longRest: true, ...narrateResult.data },
          message: messages.join('\n') + '\n' + narrateResult.message
        };
      }

      return {
        success: true,
        data: { party: state.party, healResults },
        message: messages.join('\n')
      };
    },

    async short_rest(targetId, narration, autoAdvanceTime) {
      ensureCharacterFields();
      for (const char of state.party) {
        classEngineRecoverResources(char, 'short');
        for (const slot of char.resources) {
          if (slot.id.startsWith('spell-slot-') && slot.resetOn === 'short') slot.current = slot.max;
        }
        clearNonMinuteConditions(char);
      }
      let resultMsg = 'Short rest completed. Short-rest resources recovered.';

      if (narration || autoAdvanceTime) {
        const timePassed = 60;
        const narrateResult = await this.narrate_turn(
          narration || `${state.party.map(c => c.name).join(', ')} take a short rest.`,
          timePassed
        );
        return {
          success: true,
          data: { shortRest: true, ...narrateResult.data },
          message: resultMsg + '\n' + narrateResult.message
        };
      }

      return { success: true, data: {}, message: resultMsg };
    },
  };
}
