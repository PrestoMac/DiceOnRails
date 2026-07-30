import { Character, Enemy, EnemyAttack, GameState, InitiativeEntry, MCPResponse } from '../../types';
import { cryptoRoll } from '../../utils/random';
import { fail, fuzzyMatchEntity, generateId, ErrorCodes } from './_shared';
import { lookupMonster } from '../../utils/monsters';
import { getMod, getProficiencyBonus, calculateAc, getClassDef } from '../classEngine';
import { getConditionEffects, isIncapacitated, isUnconscious, removeCondition, tickConditions, tickConditionsByTime, rollSaveAgainstCondition, getExhaustionPenalty } from '../conditionEngine';
import {
  getAlertInitiativeBonus,
  getResilientSaveBonus,
  getShieldMasterSaveBonus,
} from '../featsService';
import { rollDice, rollDeathSave } from '../diceEngine';
import { parseDiceFormula } from '../../utils/dice';
import { resolveAdvantage } from '../../utils/combatUtils';
import { getEffects, applyEffects, SaveRollContext, AttackRollContext, AttackDamageContext } from '../effectDispatcher';
import { breakConcentration as engineBreakConcentration, checkConcentrationExpiry } from '../spellcastingEngine';
import { initBattleMap, autoPlaceParty, autoPlaceEnemies, placeToken, findFreeCell } from '../gridService';

/** Dependencies required by the CombatService. */
export interface CombatDeps {
  getTarget: (id?: string) => Character | undefined;
  inflict_damage: (amount: number, targetId?: string, damageType?: string, options?: { skipTargetDerivedReductions?: boolean }) => Promise<MCPResponse>;
}

/** Service interface for managing combat encounters, initiative, attacks, and saves. */
export interface CombatService {
  add_enemy(name: string, ac?: number, hp?: number, attacks?: EnemyAttack[], cr?: number, xp?: number, size?: string, type?: string, damageResistances?: string[], damageImmunities?: string[], damageVulnerabilities?: string[]): Promise<MCPResponse>;
  start_combat(targetId?: string, enemies?: Array<{ name: string; ac?: number; hp?: number; cr?: number; xp?: number; size?: string; type?: string; }>): Promise<MCPResponse>;
  next_turn(autoResolveEnemies?: boolean): Promise<MCPResponse>;
  end_combat(): Promise<MCPResponse>;
  enemy_attack(enemyId: string, targetId?: string, attackIndex?: number): Promise<MCPResponse>;
  make_save(targetId: string, stat: string, dc: number, charmSave?: boolean): Promise<MCPResponse>;
  roll_death_save(targetId?: string): Promise<MCPResponse>;
  getCurrentTurnInfo(): { name: string; type: 'player' | 'enemy'; id: string } | null;
  updateInitiativeDeathStatus(id: string, isDead: boolean): void;
  selectEnemyTarget(): Character | undefined;
  resolveEnemyTurn(): Promise<MCPResponse>;
  checkCombatEndConditions(): { ended: boolean; reason?: string; victory?: boolean };
  resolveAllPendingEnemyTurns(): Promise<{ messages: string[]; combatEnded: boolean; victory?: boolean; attackResults: Record<string, unknown>[] }>;
  syncInitiativeConditions(): void;
  player_attack(attackerId: string, weaponName: string, targetId: string, isOffHand?: boolean, isSneakAttack?: boolean, sharpshooter?: boolean, greatWeaponMaster?: boolean, divineSmite?: { slotLevel: number }): Promise<MCPResponse>;
  resolveAdvantage(attacker?: Character | Enemy, target?: Character | Enemy, roll?: number): { roll: number; hasAdvantage: boolean; hasDisadvantage: boolean };
  initializeDeathSaves(character: Character): void;
}

/**
 * Builds deterministic, zero-hallucination narration prose summarising enemy
 * actions from their resolved attack results. Returns an empty string when no
 * attacks were resolved (so the caller/fallback can decide what to show).
 */
function buildEnemyActionNarration(attackResults: Record<string, unknown>[]): string {
  if (!attackResults || attackResults.length === 0) return '';
  const parts: string[] = [];
  for (const ar of attackResults) {
    const enemy = String(ar.enemy ?? 'An enemy');
    const target = String(ar.target ?? 'a hero');
    if (ar.isFumble === true) {
      parts.push(`${enemy} fumbles its attack against ${target}`);
    } else if (ar.isHit === true) {
      const crit = ar.isCritical === true ? ' with a critical blow' : '';
      const dmg = Number(ar.damage ?? 0);
      parts.push(`${enemy} strikes ${target}${crit}, dealing ${dmg} damage`);
    } else {
      parts.push(`${enemy} swings at ${target} and misses`);
    }
  }
  let text = parts.join('; ') + '.';
  text = text.charAt(0).toUpperCase() + text.slice(1);
  return text;
}

/**
 * Class-keyed combat action verbs. Each entry maps a class id to a function
 * that produces a class-flavored "do something to <enemy>" chip. Used by the
 * per-character mode so the Rogue sees Sneak Attack while the Cleric sees
 * divine channels for the same enemy.
 */
const CLASS_COMBAT_SUGGESTIONS: Record<string, (enemyName: string) => string> = {
  rogue:     (e) => `Sneak Attack the ${e}`,
  fighter:   (e) => `Strike down the ${e}`,
  barbarian: (e) => `Rage and crush the ${e}`,
  paladin:   (e) => `Smite the ${e}`,
  monk:      (e) => `Flurry of Blows on the ${e}`,
  ranger:    (e) => `Loose arrows at the ${e}`,
  wizard:    (e) => `Cast at the ${e}`,
  cleric:    (e) => `Channel divinity against the ${e}`,
  bard:      (e) => `Viciously Mock the ${e}`,
  druid:     (e) => `Call nature's wrath on the ${e}`,
  warlock:   (e) => `Eldritch Blast the ${e}`,
  sorcerer:  (e) => `Unleash magic at the ${e}`,
};

/** Classes that can self-heal with spells mid-combat. */
const COMBAT_SELF_HEALING_CLASSES = new Set(['cleric', 'druid', 'paladin', 'bard', 'ranger']);

/** Returns true if the character has at least one unused spell slot. */
function hasAvailableSpellSlot(c: Character): boolean {
  return (c.resources || []).some(r => r.id.startsWith('spell-slot-') && (r.current ?? 0) > 0);
}

/**
 * Builds contextual combat suggestions from the live party/enemy state.
 * Two modes:
 *   - Per-character (`characterId` supplied): class-aware chips scoped to that
 *     character's HP/resources/class. Each player in a multiplayer party sees
 *     class-flavored, unique chips.
 *   - Party-wide (`characterId` omitted): legacy heuristic — used by
 *     back-compat callers and engine-driven enemy turns (`next_turn`).
 *
 * Hardened: never returns an empty array while combat is active (fallbacks
 * fill any remaining slots) so the deterministic suggestion tier always has
 * content in either mode.
 */
export function buildCombatSuggestions(state: GameState, characterId?: string): string[] {
  if (!characterId) return buildCombatSuggestionsLegacy(state);
  const character = (state.party || []).find(c => c.id === characterId);
  if (!character) return buildCombatSuggestionsLegacy(state);

  const suggestions: string[] = [];
  const aliveEnemies = state.combat?.enemies.filter(e => !e.isDead) ?? [];
  const primaryEnemy = aliveEnemies[0]?.name ?? 'foe';
  const isWounded = character.hp.current > 0
    && character.hp.current < (character.hp.max || 1) * 0.5;

  // 1. Self-preservation: wounded -> heal (class-aware) or fall back.
  if (isWounded) {
    if (COMBAT_SELF_HEALING_CLASSES.has(character.class.toLowerCase())) {
      suggestions.push('Cast a healing spell on yourself');
    } else {
      suggestions.push('Drink a healing potion');
    }
  }

  // 2. Class-flavored strike at the primary enemy.
  const classVerb = CLASS_COMBAT_SUGGESTIONS[character.class.toLowerCase()];
  if (classVerb) {
    suggestions.push(classVerb(primaryEnemy));
  } else {
    suggestions.push(`Attack the ${primaryEnemy}`);
  }

  // 3. Spell-slot-aware cast suggestion (caster with slots remaining).
  if (hasAvailableSpellSlot(character)) {
    const cd = getClassDef(character.class);
    if (cd?.spellcasting) {
      suggestions.push(`Cast a spell at the ${primaryEnemy}`);
    }
  } else if ((character.knownSpells?.length ?? 0) + (character.preparedSpells?.length ?? 0) > 0) {
    // Caster out of slots -> cantrip.
    suggestions.push('Cast a cantrip');
  }

  // 4. Hardened fallbacks so combat suggestions are never empty.
  if (suggestions.length < 3) {
    if (aliveEnemies.length <= 1 && state.combat?.isActive) suggestions.push('End combat');
    if (suggestions.length < 3) suggestions.push('Use an item');
    if (suggestions.length < 3) suggestions.push('Reposition to safety');
  }
  return suggestions.slice(0, 3);
}

/**
 * Legacy party-wide combat generator. Used when no `characterId` is supplied
 * (engine-driven `next_turn`, back-compat callers, tests).
 */
function buildCombatSuggestionsLegacy(state: GameState): string[] {
  const suggestions: string[] = [];
  const aliveParty = state.party.filter(c => c.hp.current > 0);
  const wounded = aliveParty
    .filter(c => c.hp.current < c.hp.max * 0.5)
    .sort((a, b) => (a.hp.current / a.hp.max) - (b.hp.current / b.hp.max));
  if (wounded.length > 0) {
    suggestions.push(`Heal ${wounded[0].name}`);
  }
  const aliveEnemies = state.combat?.enemies.filter(e => !e.isDead) ?? [];
  if (aliveEnemies.length > 0) {
    suggestions.push(`Attack the ${aliveEnemies[0].name}`);
  }
  const caster = aliveParty.find(c => {
    const slots = c.resources?.filter(r => r.id.startsWith('spell-slot-'));
    return slots?.some(s => s.current > 0);
  });
  if (caster) {
    suggestions.push(`Cast a spell with ${caster.name}`);
  }
  // Hardened fallbacks so combat suggestions are never empty.
  if (suggestions.length < 3) {
    if (aliveEnemies.length <= 1 && state.combat?.isActive) suggestions.push('End combat');
    if (suggestions.length < 3) suggestions.push('Use an item');
    if (suggestions.length < 3) suggestions.push('Reposition to safety');
  }
  return suggestions.slice(0, 3);
}

/** Clears combat-only conditions (duration == null) from a target, preserving minute/permanent durations. Returns the ids removed. */
function clearEndOfCombatConditions(target: Character | Enemy): string[] {
  if (!target.conditions || target.conditions.length === 0) return [];
  const removed: string[] = [];
  target.conditions = target.conditions.filter(c => {
    if (c.duration == null || c.durationUnit === 'round') {
      if (c.durationUnit === 'round' || c.duration === null) {
        removed.push(c.id);
        return false;
      }
    }
    return true;
  });
  return removed;
}

// ---------------------------------------------------------------------------
// Enemy name de-duplication — Roman numeral suffixes (engine-side fix)
// ---------------------------------------------------------------------------

const ROMAN_VALUES: Record<string, number> = {
  I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10,
};
const ROMAN_BY_VALUE: string[] = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const ROMAN_SUFFIX_RE = /\s+(I{1,3}|IV|V|VI{0,3}|IX|X)$/;

function romanSuffix(n: number): string {
  return n <= 10 ? ROMAN_BY_VALUE[n - 1] : String(n);
}

/**
 * Returns a unique display name for a new enemy by appending a Roman-numeral
 * suffix (II, III, IV, …) when one or more existing enemies share the same
 * canonical base name. The first enemy keeps its bare name; subsequent
 * duplicates become "Goblin II", "Goblin III", etc. Falls back to Arabic
 * numerals beyond X. Pure engine-side fix — the LLM never needs to number
 * enemies itself.
 */
export function generateUniqueEnemyName(input: string, existing: Enemy[]): string {
  const trimmed = input.trim();
  const base = trimmed.replace(ROMAN_SUFFIX_RE, '').trim();
  const taken = new Set(existing.map(e => e.name));
  if (!taken.has(trimmed)) return trimmed;

  let maxN = 1;
  for (const e of existing) {
    if (e.name.replace(ROMAN_SUFFIX_RE, '').trim() !== base) continue;
    const m = e.name.match(ROMAN_SUFFIX_RE);
    const suffix = m?.[1];
    const n = suffix ? (ROMAN_VALUES[suffix] ?? 1) : 1;
    if (n > maxN) maxN = n;
  }
  let next = maxN + 1;
  while (taken.has(`${base} ${romanSuffix(next)}`)) next++;
  return `${base} ${romanSuffix(next)}`;
}

/** Creates a new CombatService instance operating on the given GameState. */
export function createCombatService(state: GameState, deps: CombatDeps): CombatService {
  function buildEnemyFromTemplate(name: string, overrides: {
    ac?: number; hp?: number; attacks?: EnemyAttack[]; cr?: number; xp?: number;
    size?: string; type?: string; damageResistances?: string[];
    damageImmunities?: string[]; damageVulnerabilities?: string[];
  }): Enemy {
    const template = lookupMonster(name.trim());
    const uniqueName = generateUniqueEnemyName(name.trim(), state.combat?.enemies ?? []);
    return {
      id: `enemy-${generateId()}`,
      name: uniqueName,
      ac: overrides.ac ?? template?.ac ?? 10,
      hp: { current: overrides.hp ?? template?.hp?.max ?? 1, max: overrides.hp ?? template?.hp?.max ?? 1 },
      attacks: overrides.attacks ?? template?.attacks ?? [{ name: 'Strike', toHit: 2, damageDice: '1d4', damageType: 'bludgeoning' }],
      cr: overrides.cr ?? template?.cr ?? 0,
      xp: overrides.xp ?? template?.xp ?? 10,
      size: overrides.size ?? template?.size ?? 'Medium',
      type: overrides.type ?? template?.type ?? 'humanoid',
      stats: template?.stats,
      isDead: false,
      damageResistances: overrides.damageResistances ?? template?.damageResistances,
      damageImmunities: overrides.damageImmunities ?? template?.damageImmunities,
      damageVulnerabilities: overrides.damageVulnerabilities ?? template?.damageVulnerabilities,
    };
  }

  function initializeDeathSaves(character: Character): void {
    if (!character.deathSaves) {
      character.deathSaves = { successes: 0, failures: 0, isStable: false };
    }
  }



  return {
    initializeDeathSaves,

    resolveAdvantage(attacker, target, roll = 10) {
      let hasAdvantage = false, hasDisadvantage = false;
      if (attacker) {
        const ae = getConditionEffects(attacker);
        if (ae.advantageOnAttacks) hasAdvantage = true;
        if (ae.disadvantageOnAttacks) hasDisadvantage = true;
      }
      if (target) {
        const te = getConditionEffects(target);
        if (te.attacksAgainstHaveAdvantage) hasAdvantage = true;
      }
      const secondRoll = cryptoRoll(20);
      const resolved = resolveAdvantage(roll, secondRoll, hasAdvantage, hasDisadvantage);
      return { roll: resolved.roll, hasAdvantage: resolved.hadAdvantage, hasDisadvantage: resolved.hadDisadvantage };
    },

    updateInitiativeDeathStatus(id: string, isDead: boolean): void {
      if (!state.combat?.isActive) return;
      const entry = state.combat.initiative.find(e => e.id === id);
      if (entry) {
        entry.isDead = isDead;
      }
      if (isDead) {
        const enemy = state.combat.enemies.find(e => e.id === id);
        if (enemy) enemy.isDead = true;
      }
    },

    syncInitiativeConditions() {
      if (!state.combat?.isActive) return;
      for (const entry of state.combat.initiative) {
        const combatant = entry.type === 'player'
          ? state.party.find(c => c.id === entry.id)
          : state.combat.enemies.find(e => e.id === entry.id);
        entry.activeConditions = combatant?.conditions?.map(c => c.id) ?? [];
      }
    },

    selectEnemyTarget(): Character | undefined {
      const alive = state.party.filter(c => c.hp.current > 0 && !(c.deathSaves?.isStable));
      if (alive.length === 0) return undefined;
      return alive.reduce((best, current) => {
        const bestPct = best.hp.current / best.hp.max;
        const currentPct = current.hp.current / current.hp.max;
        return currentPct < bestPct ? current : best;
      });
    },

    checkCombatEndConditions() {
      if (!state.combat?.isActive) {
        return { ended: false };
      }
      const combat = state.combat;
      const allEnemiesDead = combat.enemies.length > 0 && combat.enemies.every(e => e.isDead);
      if (allEnemiesDead) {
        combat.isActive = false;
        return { ended: true, reason: 'victory', victory: true };
      }
      const allPartyDead = state.party.every(c => {
        if (c.hp.current > 0) return false;
        if (c.deathSaves?.isStable) return false;
        return true;
      });
      if (allPartyDead && state.party.length > 0) {
        combat.isActive = false;
        return { ended: true, reason: 'total_party_kill', victory: false };
      }
      return { ended: false };
    },

    getCurrentTurnInfo() {
      if (!state.combat?.isActive) return null;
      const entry = state.combat.initiative[state.combat.turnIndex];
      if (!entry) return null;
      return { name: entry.name, type: entry.type, id: entry.id };
    },

    async add_enemy(name, ac, hp, attacks, cr, xp, size, type, damageResistances, damageImmunities, damageVulnerabilities) {
      const cleanName = name.trim();
      if (!cleanName) {
        return fail("Enemy name is required.");
      }
      const enemy = buildEnemyFromTemplate(cleanName, { ac, hp, attacks, cr, xp, size, type, damageResistances, damageImmunities, damageVulnerabilities });
      const template = lookupMonster(cleanName);
      const sourceInfo = template ? ` (auto-filled from SRD: ${template.name})` : ' (custom)';
      if (!state.combat) {
        state.combat = {
          isActive: false,
          round: 1,
          turnIndex: 0,
          initiative: [],
          enemies: []
        };
      }
      state.combat.enemies.push(enemy);

      if (state.combat.isActive) {
        const roll = cryptoRoll(20);
        const mod = enemy.stats ? getMod(enemy.stats.dex) : 0;
        const currentActorId = state.combat.initiative[state.combat.turnIndex]?.id;
        state.combat.initiative.push({
          id: enemy.id,
          name: enemy.name,
          initiative: roll + mod,
          type: 'enemy',
          isDead: false,
          hasActedThisTurn: false
        });
        state.combat.initiative.sort((a, b) => b.initiative - a.initiative);
        const newCurrentIdx = state.combat.initiative.findIndex(e => e.id === currentActorId);
        if (newCurrentIdx >= 0) state.combat.turnIndex = newCurrentIdx;

        if (state.battleMap) {
          const spawnPos = findFreeCell(state.battleMap, { x: Math.floor((state.battleMap.width * 2) / 3), y: Math.floor(state.battleMap.height / 2) });
          state.battleMap = placeToken(state.battleMap, {
            id: enemy.id,
            name: enemy.name,
            type: 'enemy',
            pos: spawnPos,
          });
        }
      }

      state.sessionLogs.push(`${enemy.name} joins the fray!${sourceInfo}`);
      return {
        success: true,
        data: { enemy },
        message: `${enemy.name} added to combat. AC: ${enemy.ac}, HP: ${enemy.hp.max}${sourceInfo}`
      };
    },

    async start_combat(targetId, enemies) {
      if (state.combat?.isActive) {
        return fail("Combat already active");
      }
      if (enemies && enemies.length > 0) {
        if (!state.combat) {
          state.combat = { isActive: false, round: 1, turnIndex: 0, initiative: [], enemies: [] };
        }
        for (const eDef of enemies) {
          const enemy = buildEnemyFromTemplate(eDef.name.trim(), {
            ac: eDef.ac, hp: eDef.hp, cr: eDef.cr, xp: eDef.xp, size: eDef.size, type: eDef.type,
          });
          state.combat.enemies.push(enemy);
          state.sessionLogs.push(`${enemy.name} joins the fray!`);
        }
      }

      if (state.party.length === 0) {
        return fail("No party members to fight.");
      }
      if (!state.combat || state.combat.enemies.length === 0) {
        return fail("No enemies added. Call add_enemy first.");
      }

      const initiative: InitiativeEntry[] = [];

      for (const char of state.party) {
        if (char.deathSaves?.isStable) continue;
        const roll = cryptoRoll(20);
        const mod = getMod(char.stats.dex) + getAlertInitiativeBonus(char);
        initiative.push({
          id: char.id,
          name: char.name,
          initiative: roll + mod,
          type: 'player',
          isDead: char.hp.current <= 0 && (char.deathSaves?.failures ?? 0) >= 3,
          hasActedThisTurn: false,
          rawRoll: roll,
          modifier: mod
        });
        state.lastDiceRoll = { sides: 20, count: 1, modifier: mod, results: [roll], total: roll + mod };
      }

      for (const enemy of state.combat.enemies) {
        if (enemy.isDead) continue;
        const roll = cryptoRoll(20);
        const mod = enemy.stats ? getMod(enemy.stats.dex) : 0;
        initiative.push({
          id: enemy.id,
          name: enemy.name,
          initiative: roll + mod,
          type: 'enemy',
          isDead: false,
          hasActedThisTurn: false,
          rawRoll: roll,
          modifier: mod
        });
      }

      initiative.sort((a, b) => b.initiative - a.initiative);

      state.combat.initiative = initiative;
      state.combat.isActive = true;
      state.combat.round = 1;
      state.combat.turnIndex = 0;

      // Auto-initialize VTT Battle Map every time combat starts
      if (!state.battleMap) {
        const label = state.party[0]?.location ?? 'Battle';
        let bmap = initBattleMap(20, 15, label);
        bmap = autoPlaceParty(bmap, state.party.map(c => ({ id: c.id, name: c.name })));
        bmap = autoPlaceEnemies(bmap, state.combat.enemies.filter(e => !e.isDead).map(e => ({ id: e.id, name: e.name })));
        state.battleMap = bmap;
      }

      for (const c of state.party) {
        if (c.concentrationSpellId && c.runtime && c.runtime.concentrationStartRound == null) {
          c.runtime.concentrationStartRound = state.combat.round;
        }
      }

      const firstActor = initiative[0];
      const initiativeStr = initiative.map(e =>
        `${e.type === 'player' ? '👤' : '👾'} ${e.name}: ${e.initiative}`
      ).join('\n');

      return {
        success: true,
        data: { combat: state.combat, currentTurn: firstActor?.name || 'Unknown' },
        message: `⚔️ COMBAT BEGINS! Round 1.\n\nInitiative Order:\n${initiativeStr}\n\n**${firstActor?.name} goes first!**`
      };
    },

    async next_turn(autoResolveEnemies = true) {
      if (!state.combat?.isActive) {
        return fail("No active combat.");
      }

      const combat = state.combat;
      const currentEntry = combat.initiative[combat.turnIndex];
      if (currentEntry) {
        currentEntry.hasActedThisTurn = true;

        const combatant = currentEntry.type === 'player'
          ? state.party.find(c => c.id === currentEntry.id)
          : combat.enemies.find(e => e.id === currentEntry.id);

        if (combatant?.conditions && combatant.conditions.length > 0) {
          const saveMessages: string[] = [];
          const conditionsToRemove: Array<{ id: string; source: string }> = [];

          for (const cond of [...combatant.conditions]) {
            if (cond.saveEnd && cond.saveDC) {
              const saveResult = rollSaveAgainstCondition(combatant, cond, cond.saveDC);
              if (saveResult.succeeded) {
                saveMessages.push(
                  `**${combatant.name}** rolled ${saveResult.total} (${saveResult.roll} + modifier) vs DC ${cond.saveDC} ${cond.saveEnd.toUpperCase()} save — **passed!** ${cond.id} ends.`
                );
                conditionsToRemove.push({ id: cond.id, source: cond.source });
              } else {
                saveMessages.push(
                  `**${combatant.name}** rolled ${saveResult.total} (${saveResult.roll} + modifier) vs DC ${cond.saveDC} ${cond.saveEnd.toUpperCase()} save — failed.`
                );
              }
            }
          }

          for (const { id, source } of conditionsToRemove) {
            removeCondition(combatant, id, source);
          }
          this.syncInitiativeConditions();

          if (saveMessages.length > 0) {
            currentEntry.saveMessages = saveMessages;
          }
        }
      }

      let nextIdx = -1;
      const total = combat.initiative.length;
      let checked = 0;
      let currentIdx = combat.turnIndex;

      while (checked < total) {
        currentIdx = (currentIdx + 1) % total;
        checked++;
        const entry = combat.initiative[currentIdx];
        if (!entry.isDead && !entry.hasActedThisTurn) {
          const skipCombatant = entry.type === 'player'
            ? state.party.find(c => c.id === entry.id)
            : combat.enemies.find(e => e.id === entry.id);
          if (skipCombatant && (isIncapacitated(skipCombatant) || isUnconscious(skipCombatant))) {
            if (entry.type === 'player') {
              const player = skipCombatant as Character;
              if (player.concentrationSpellId) engineBreakConcentration(player, 'incapacitated');
            } else {
              entry.hasActedThisTurn = true;
              continue;
            }
          }
          nextIdx = currentIdx;
          break;
        }
      }

      if (nextIdx === -1) {
        combat.round++;
        for (const entry of combat.initiative) {
          entry.hasActedThisTurn = false;
        }

        const expiryMessages: string[] = [];
        const ROUND_MINUTES = 0.1;
        for (const entry of combat.initiative) {
          if (entry.isDead) continue;
          const combatant = entry.type === 'player'
            ? state.party.find(c => c.id === entry.id)
            : combat.enemies.find(e => e.id === entry.id);
          if (combatant) {
            const roundExpired = tickConditions(combatant);
            const timeExpired = tickConditionsByTime(combatant, ROUND_MINUTES);
            const allExpired = [...roundExpired, ...timeExpired];
            for (const condId of allExpired) {
              expiryMessages.push(`**${combatant.name}**'s ${condId} condition wore off.`);
            }
            if (entry.type === 'player') {
              const player = combatant as Character;
              if (player.concentrationSpellId) {
                const sid = player.concentrationSpellId;
                const startRound = player.runtime?.concentrationStartRound;
                const elapsedMin = startRound != null ? (combat.round - startRound) / 10 : 0;
                const ended = checkConcentrationExpiry(player, elapsedMin);
                if (ended) {
                  if (combat.activeDoTs) {
                    combat.activeDoTs = combat.activeDoTs.filter(
                      dot => !(dot.casterId === combatant.id && dot.spellId === sid)
                    );
                  }
                  expiryMessages.push(`**${combatant.name}**'s concentration on ${ended} ended.`);
                }
              }
            }
          }
        }

        if (state.combat?.activeDoTs?.length) {
          for (const dot of state.combat.activeDoTs) {
            const caster = deps.getTarget(dot.casterId);
            const abilityMod = caster && dot.addsAbilityMod
              ? getMod(caster.stats[getClassDef(caster.class)?.spellcasting?.ability || 'int'])
              : 0;

            for (const targetId of dot.targetIds) {
              const target = state.combat.enemies.find(e =>
                e.id === targetId || e.name.toLowerCase() === targetId.toLowerCase()
              );
              if (!target || target.isDead) continue;

              if (!dot.damageFormula.match(/^\d+d\d+/)) continue;
              const parsed = parseDiceFormula(dot.damageFormula);
              const dmg = rollDice(parsed.count, parsed.sides) + abilityMod;

              let finalDamage = dmg;
              if (dot.saveStat && dot.saveDC) {
                const saveResult = await this.make_save(targetId, dot.saveStat, dot.saveDC);
                if (saveResult.success && saveResult.data?.success) {
                  finalDamage = Math.floor(dmg / 2);
                }
              }

              await deps.inflict_damage(finalDamage, targetId, dot.damageType);
              expiryMessages.push(`${target.name} takes ${finalDamage} ${dot.damageType} from ${dot.spellId}.`);
            }
          }
        }

        this.syncInitiativeConditions();
        combat.turnIndex = 0;

        const endCheck = this.checkCombatEndConditions();
        if (endCheck.ended) {
          combat.isActive = false;
          if (endCheck.victory) {
            return { success: true, data: { combat, combatEnded: true }, message: `🏆 Victory! All enemies defeated in ${combat.round} rounds!` };
          } else {
            return { success: true, data: { combat, combatEnded: true }, message: `💀 Total Party Kill. The party has fallen after ${combat.round} rounds.` };
          }
        }

        if (autoResolveEnemies && combat.initiative[0]?.type === 'enemy') {
          const result = await this.resolveAllPendingEnemyTurns();
          const expiryText = expiryMessages.length > 0 ? '\n\n' + expiryMessages.join('\n') : '';
          const narration = buildEnemyActionNarration(result.attackResults);
          const suggestions = buildCombatSuggestions(state);
          return {
            success: true,
            data: { combat: state.combat, newRound: true, narration, suggestions, ...result },
            message: `--- Round ${combat.round} ---\n**${combat.initiative[0].name} starts the round!**${expiryText}\n\n` + result.messages.join('\n')
          };
        }

        const newFirst = combat.initiative[0];
        const expiryText = expiryMessages.length > 0 ? '\n\n' + expiryMessages.join('\n') : '';
        return {
          success: true,
          data: { combat, newRound: true },
          message: `--- Round ${combat.round} ---\n**${newFirst?.name} starts the round!**${expiryText}`
        };
      }

      combat.turnIndex = nextIdx;

      const newCombatant = combat.initiative[nextIdx];
      if (newCombatant?.type === 'player') {
        const player = state.party.find(c => c.id === newCombatant.id);
        if (player) {
          player.reactionAvailable = true;
          player.reactionUsedThisTurn = false;
        }
      }

      if (autoResolveEnemies && combat.initiative[combat.turnIndex]?.type === 'enemy') {
        const result = await this.resolveAllPendingEnemyTurns();
        const narration = buildEnemyActionNarration(result.attackResults);
        const suggestions = buildCombatSuggestions(state);
        return {
          success: true,
          data: { combat: state.combat, narration, suggestions, ...result },
          message: result.messages.join('\n')
        };
      }

      const next = combat.initiative[nextIdx];
      const saveMsgs = currentEntry?.saveMessages;
      const saveText = saveMsgs && saveMsgs.length > 0 ? '\n\n' + saveMsgs.join('\n') : '';
      if (currentEntry) delete currentEntry.saveMessages;
      return {
        success: true,
        data: { combat },
        message: `**${next.name}'s turn.**${saveText}`
      };
    },

    async end_combat() {
      if (!state.combat) {
        return fail("No active combat to end.");
      }
      const rounds = state.combat.round;
      const cleared: string[] = [];
      for (const c of state.party) {
        cleared.push(...clearEndOfCombatConditions(c));
      }
      for (const e of state.combat.enemies) {
        cleared.push(...clearEndOfCombatConditions(e));
      }
      delete (state as { combat?: unknown }).combat;
      delete (state as { battleMap?: unknown }).battleMap;
      delete (state as { lastTokenMove?: unknown }).lastTokenMove;
      const clearedMsg = cleared.length ? ` Cleared: ${[...new Set(cleared)].join(', ')}.` : '';
      return {
        success: true,
        data: { cleared },
        message: `Combat ended after ${rounds} round(s). The battle is over!${clearedMsg}`
      };
    },

    async enemy_attack(enemyId, targetId, attackIndex = 0) {
      if (!state.combat?.isActive) {
        return fail("No active combat.");
      }

      const enemy = state.combat.enemies.find(e => fuzzyMatchEntity(e, enemyId));
      if (!enemy) {
        return fail(`Enemy ${enemyId} not found in combat.`, ErrorCodes.NOT_FOUND);
      }
      if (enemy.isDead) {
        return fail(`${enemy.name} is already defeated.`);
      }

      const initEntry = state.combat.initiative.find(e => e.id === enemy.id);
      if (initEntry) initEntry.hasActedThisTurn = true;

      const attack = enemy.attacks[attackIndex];
      if (!attack) {
        return fail(`Enemy ${enemy.name} doesn't have attack #${attackIndex + 1}.`);
      }

      let target: Character | undefined;
      if (targetId) {
        target = state.party.find(c => c.id === targetId || c.name.toLowerCase() === targetId.toLowerCase());
      } else {
        const alive = state.party.filter(c => c.hp.current > 0 && !(c.deathSaves?.isStable));
        if (alive.length === 0) {
          return fail("No valid targets available.");
        }
        target = alive[Math.floor(Math.random() * alive.length)];
      }

      if (!target) {
        return fail(`Target not found.`);
      }

      const armor = target.inventory.find(i => i.equipped && i.type === 'armor') || null;
      const targetAc = calculateAc(target, armor);

      let atkRoll = cryptoRoll(20);
      let hasAdvantage = false;
      let hasDisadvantage = false;
      {
        const ae = getConditionEffects(enemy);
        if (ae.advantageOnAttacks) hasAdvantage = true;
        if (ae.disadvantageOnAttacks) hasDisadvantage = true;
        const te = getConditionEffects(target);
        if (te.attacksAgainstHaveAdvantage) hasAdvantage = true;
      }
      const secondRoll = cryptoRoll(20);
      const resolved = resolveAdvantage(atkRoll, secondRoll, hasAdvantage, hasDisadvantage);
      atkRoll = resolved.roll;

      const roll = atkRoll;
      const attackRoll = roll + attack.toHit - getExhaustionPenalty(enemy);
      const isCrit = roll === 20;
      const isFumble = roll === 1;
      const isHit = isCrit || (!isFumble && attackRoll >= targetAc);

      if (isFumble) {
        return {
          success: true,
          data: { roll, attackRoll, targetAc, isHit: false, isFumble: true, enemy: enemy.name, target: target.name },
          message: `${enemy.name} attacks ${target.name} with ${attack.name}... **Critical Miss! (Natural 1)**`
        };
      }

      if (!isHit) {
        return {
          success: true,
          data: { roll, attackRoll, targetAc, isHit: false, enemy: enemy.name, target: target.name },
          message: `${enemy.name} attacks ${target.name} with ${attack.name}: **MISS** (Rolled ${attackRoll} vs AC ${targetAc})`
        };
      }

      if (!attack.damageDice.match(/^\d+d\d+/)) {
        return fail(`Invalid damage dice: ${attack.damageDice}`);
      }
      const parsed = parseDiceFormula(attack.damageDice);
      const diceCount = isCrit ? parsed.count * 2 : parsed.count;
      const diceSides = parsed.sides;
      const flatMod = parsed.bonus;

      const damageResults: number[] = [];
      for (let i = 0; i < diceCount; i++) damageResults.push(cryptoRoll(diceSides));
      const damageTotal = damageResults.reduce((a, b) => a + b, 0) + flatMod;

      await deps.inflict_damage(damageTotal, target.id, attack.damageType, { skipTargetDerivedReductions: true });

      const critStr = isCrit ? ' **CRITICAL HIT!**' : '';
      return {
        success: true,
        data: {
          roll, attackRoll, targetAc, isHit: true, isCritical: isCrit,
          damage: damageTotal, damageResults, damageDice: attack.damageDice,
          enemy: enemy.name, target: target.name
        },
        message: `${enemy.name} attacks ${target.name} with ${attack.name}: **HIT${critStr}**` +
          ` (Rolled ${attackRoll} vs AC ${targetAc}) dealing **${damageTotal}** ${attack.damageType} damage!` +
          ` ${target.name}: ${target.hp.current}/${target.hp.max} HP.`
      };
    },

    async make_save(targetId, stat, dc, charmSave = false) {
      const validStats = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
      const cleanStat = stat.toLowerCase().trim() as string;
      const mappedStat = validStats.find(s => cleanStat.includes(s) || s.includes(cleanStat)) || 'dex';

      const partyTarget = state.party.find(c =>
        c.id === targetId || c.name.toLowerCase() === targetId.toLowerCase()
      );

      const enemyTarget = !partyTarget
        ? state.combat?.enemies.find(e =>
            e.id === targetId || e.name.toLowerCase() === targetId.toLowerCase()
          )
        : undefined;

      if (!partyTarget && !enemyTarget) {
        return fail(`Target "${targetId}" not found.`);
      }

      if (partyTarget) {
        const statVal = (partyTarget.stats as Record<string, number>)[mappedStat] || 10;
        const mod = getMod(statVal);
        const resilientBonus = getResilientSaveBonus(partyTarget, mappedStat as 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha');
        const shieldMasterBonus = getShieldMasterSaveBonus(partyTarget, mappedStat as 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha');
        let totalMod = mod + resilientBonus + shieldMasterBonus;

        const saveCtx: SaveRollContext = {
          _hook: 'onSaveRoll',
          roll: 0,
          stat: mappedStat,
          character: partyTarget,
          hasAdvantage: false,
          extraModifier: 0,
          spellContext: charmSave ? { isMagical: true } : undefined,
        };
        const afterEffects = applyEffects(partyTarget, 'onSaveRoll', saveCtx);
        totalMod += afterEffects.extraModifier;

        let roll = cryptoRoll(20);
        let advantageNote = '';
        if (afterEffects.hasAdvantage) {
          const second = cryptoRoll(20);
          advantageNote = ` [Advantage: ${roll} vs ${second}]`;
          roll = Math.max(roll, second);
        }
        const total = roll + totalMod - getExhaustionPenalty(partyTarget);
        const success = total >= dc;
        const nat20 = roll === 20;
        const nat1 = roll === 1;

        const bonusParts: string[] = [];
        if (resilientBonus > 0) bonusParts.push(`Resilient +${resilientBonus}`);
        if (shieldMasterBonus > 0) bonusParts.push(`Shield Master +${shieldMasterBonus}`);

        return {
          success: true,
          data: {
            character: partyTarget.name,
            stat: mappedStat.toUpperCase(),
            roll, modifier: totalMod, total, dc, success, nat20, nat1,
            resilientBonus, shieldMasterBonus
          },
          message: `${partyTarget.name} ${mappedStat.toUpperCase()} save: ${success ? 'SUCCESS' : 'FAILURE'}` +
            ` (Rolled ${roll} + ${totalMod}${bonusParts.length ? ' [' + bonusParts.join(', ') + ']' : ''} = ${total} vs DC ${dc})${advantageNote}${nat20 ? ' [Natural 20!]' : ''}${nat1 ? ' [Natural 1!]' : ''}`
        };
      }

      if (enemyTarget) {
        const stats = enemyTarget.stats ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
        const statVal = (stats as Record<string, number>)[mappedStat] ?? 10;
        const mod = getMod(statVal);
        const roll = cryptoRoll(20);
        const total = roll + mod - getExhaustionPenalty(enemyTarget);
        const success = total >= dc;
        return {
          success: true,
          data: { character: enemyTarget.name, stat: mappedStat.toUpperCase(), roll, modifier: mod, total, dc, success },
          message: `${enemyTarget.name} ${mappedStat.toUpperCase()} save: ${success ? 'SUCCESS' : 'FAILURE'} (Rolled ${roll} + ${mod} = ${total} vs DC ${dc})`
        };
      }
      return fail('Unexpected save resolution error.');
    },

    async roll_death_save(targetId) {
      const target = deps.getTarget(targetId);
      if (!target) return fail("Target character not found.");
      if (target.hp.current > 0) return fail(`${target.name} is not dying.`);

      const combatState = state.combat?.isActive ? state.combat : undefined;
      const result = rollDeathSave(target, combatState);

      return { success: true, data: { deathSaves: target.deathSaves, roll: result.roll, rollSuccess: result.rollSuccess, revived: result.revived }, message: result.message };
    },

    async resolveEnemyTurn() {
      if (!state.combat?.isActive) {
        return fail("No active combat.");
      }

      const combat = state.combat;
      const currentEntry = combat.initiative[combat.turnIndex];

      if (!currentEntry || currentEntry.type !== 'enemy') {
        return fail("It is not an enemy's turn.");
      }

      if (currentEntry.isDead || currentEntry.hasActedThisTurn) {
        const advanceResult = await this.next_turn(false);
        return {
          success: true,
          data: { skipped: true, ...advanceResult.data },
          message: `${currentEntry.name} is ${currentEntry.isDead ? 'dead' : 'already acted'}. ${advanceResult.message}`
        };
      }

      const enemy = combat.enemies.find(e => e.id === currentEntry.id);
      if (!enemy || enemy.isDead) {
        currentEntry.hasActedThisTurn = true;
        const advanceResult = await this.next_turn(false);
        return {
          success: true,
          data: { skipped: true, ...advanceResult.data },
          message: `${currentEntry.name} is defeated. ${advanceResult.message}`
        };
      }

      // Defense-in-depth: an incapacitated/unconscious enemy (e.g. asleep via the
      // Sleep spell) cannot act. This mirrors next_turn's initiative skip-logic and
      // guards the parallel-batch race where a condition-applying tool (cast_spell)
      // and next_turn are dispatched concurrently, so next_turn's skip check may run
      // before the condition lands on the combatant.
      if (isIncapacitated(enemy) || isUnconscious(enemy)) {
        currentEntry.hasActedThisTurn = true;
        const advanceResult = await this.next_turn(false);
        const reason = isUnconscious(enemy) ? 'unconscious' : 'incapacitated';
        return {
          success: true,
          data: { skipped: true, ...advanceResult.data },
          message: `${enemy.name} is ${reason} and skips its turn. ${advanceResult.message}`
        };
      }

      const target = this.selectEnemyTarget();
      if (!target) {
        currentEntry.hasActedThisTurn = true;
        const advanceResult = await this.next_turn(false);
        return {
          success: true,
          data: { skipped: true, ...advanceResult.data },
          message: `No valid targets for ${enemy.name}. ${advanceResult.message}`
        };
      }

      const attackMessages: string[] = [];
      const attackResults: Record<string, unknown>[] = [];
      for (let i = 0; i < enemy.attacks.length; i++) {
        const atkResult = await this.enemy_attack(enemy.id, target.id, i);
        if (atkResult.success) {
          attackMessages.push(atkResult.message);
          attackResults.push(atkResult.data);
        }
      }

      currentEntry.hasActedThisTurn = true;
      const advanceResult = await this.next_turn(false);

      const combinedMessage = attackMessages.join('\n');
      return {
        success: true,
        data: { combat: state.combat, target: target.name, attacks: attackResults },
        message: `**${enemy.name}'s turn:**\n${combinedMessage}\n${advanceResult.message}`
      };
    },

    async resolveAllPendingEnemyTurns() {
      const messages: string[] = [];
      const attackResults: Record<string, unknown>[] = [];
      let combatEnded = false;
      let victory: boolean | undefined;

      let safety = 0;
      while (safety < 20) {
        const combat = state.combat;
        if (!combat?.isActive) {
          break;
        }

        const currentEntry = combat.initiative[combat.turnIndex];
        if (!currentEntry || currentEntry.type !== 'enemy') break;

        const endCheck = this.checkCombatEndConditions();
        if (endCheck.ended) {
          combatEnded = true;
          victory = endCheck.victory;
          combat.isActive = false;
          if (endCheck.victory) {
            messages.push(`🏆 Victory! All enemies defeated in ${combat.round} round(s)!`);
          } else {
            messages.push(`💀 Total Party Kill. The party has fallen after ${combat.round} round(s).`);
          }
          break;
        }

        const result = await this.resolveEnemyTurn();
        if (result.success) {
          messages.push(result.message);
          if (result.data?.attacks) {
            attackResults.push(...result.data.attacks);
          }
        } else {
          await this.next_turn();
          safety++;
          continue;
        }

        safety++;
      }

      return { messages, combatEnded, victory, attackResults };
    },

    async player_attack(attackerId, weaponName, targetId, isOffHand, isSneakAttack, sharpshooter, greatWeaponMaster, divineSmite) {
      const attacker = deps.getTarget(attackerId);
      if (!attacker) return fail(`Attacker "${attackerId}" not found.`, ErrorCodes.NOT_FOUND);

      const enemy = state.combat?.enemies.find(e => fuzzyMatchEntity(e, targetId));
      if (!enemy) return fail(`Target "${targetId}" not found in combat.`, ErrorCodes.NOT_FOUND);
      if (enemy.isDead) return fail(`${enemy.name} is already defeated.`);

      const weaponItem = attacker.inventory.find(i =>
        i.name.toLowerCase() === weaponName.toLowerCase()
      );
      const isUnarmed = !weaponItem && ['unarmed', 'fist', 'punch', 'kick'].some(s =>
        weaponName.toLowerCase().includes(s)
      );
      const isMonk = attacker.class?.toLowerCase() === 'monk';
      const isRanged = weaponItem?.stats?.properties?.includes('ranged')
        || ['bow', 'crossbow', 'javelin', 'dart', 'sling'].some(s => weaponName.toLowerCase().includes(s));

      const abilityMod = isRanged
        ? getMod(attacker.stats?.dex ?? 10)
        : getMod(attacker.stats?.str ?? 10);
      const profBonus = getProficiencyBonus(attacker as unknown as Character);
      let atkBonus = abilityMod + profBonus;
      if (sharpshooter || greatWeaponMaster) atkBonus -= 5;

      let roll = cryptoRoll(20);
      const advResult = this.resolveAdvantage(attacker, enemy, roll);
      roll = advResult.roll;

      const atkRollCtx: AttackRollContext = {
        _hook: 'onAttackRoll',
        roll,
        character: attacker,
        weaponName,
        targetId: enemy.id,
        isRanged,
      };
      const afterRoll = applyEffects(attacker, 'onAttackRoll', atkRollCtx);
      roll = afterRoll.roll;
      const hasExpandedCrit = !!(afterRoll as unknown as Record<string, unknown>)._critRangeExpanded;

      const attackRoll = roll + atkBonus - getExhaustionPenalty(attacker);
      const isCrit = roll === 20 || (hasExpandedCrit && roll >= 19);
      const isFumble = roll === 1;
      const enemyAc = typeof enemy.ac === 'number' ? enemy.ac : 10;
      const isHit = isCrit || (!isFumble && attackRoll >= enemyAc);

      const baseData = {
        roll, attackRoll, targetAc: enemyAc,
        isHit, hit: isHit,
        isCritical: isCrit, isFumble,
        enemy: enemy.name, target: enemy.name,
        targetId: enemy.id, targetName: enemy.name,
        attacker: attacker.name, attackerId: attacker.id,
      };

      if (isFumble) {
        return { success: true, data: { ...baseData, isHit: false, isCritical: false, isFumble: true }, message: `**Critical Miss!** (Nat 1) Your weapon slips as you attack ${enemy.name}.` };
      }
      if (!isHit) {
        return { success: true, data: { ...baseData, isHit: false }, message: `You attack ${enemy.name} with ${weaponName}: **MISS** (Rolled ${attackRoll} vs AC ${enemyAc}).` };
      }

      let damageDice: string;
      let dmgType: string;
      if (weaponItem?.stats?.damage) {
        damageDice = weaponItem.stats.damage;
        dmgType = weaponItem.stats.damageType || (isRanged ? 'piercing' : 'slashing');
      } else if (isMonk) {
        const monkLevel = attacker.level;
        const martialArtsDie = monkLevel >= 17 ? '1d10' : monkLevel >= 11 ? '1d8' : monkLevel >= 5 ? '1d6' : '1d4';
        damageDice = martialArtsDie;
        dmgType = 'bludgeoning';
      } else if (isUnarmed) {
        damageDice = '1d1';
        dmgType = 'bludgeoning';
      } else {
        damageDice = '1d6';
        dmgType = isRanged ? 'piercing' : 'slashing';
      }

      const parsed = parseDiceFormula(damageDice);
      if (!damageDice.match(/^\d+d\d+/)) return fail(`Invalid damage dice: ${damageDice}`);

      const diceCount = isCrit ? parsed.count * 2 : parsed.count;
      const dieSides = parsed.sides;
      const flatMod = parsed.bonus;

      const hasGWF = getEffects(attacker, 'gwf-reroll').length > 0 && !isOffHand;
      const damageResults: number[] = [];
      for (let i = 0; i < diceCount; i++) {
        let v = cryptoRoll(dieSides);
        if (hasGWF && v <= 2) v = cryptoRoll(dieSides);
        damageResults.push(v);
      }

      let damageTotal = damageResults.reduce((a, b) => a + b, 0) + flatMod;

      if (isUnarmed && !isMonk) {
        damageTotal += abilityMod;
      } else if (isOffHand) {
        if (getEffects(attacker, 'offhand-modifier').length > 0) damageTotal += abilityMod;
      } else {
        damageTotal += abilityMod;
      }

      if (sharpshooter && isRanged) damageTotal += 10;
      if (greatWeaponMaster && !isRanged) damageTotal += 10;

      if (isSneakAttack) {
        const sneakSources = getEffects(attacker, 'sneak-attack');
        const sneakDiceFromData = sneakSources[0]?.payload.extraDiceAtLevel as Record<string, number> | undefined;
        let sneakDice: number;
        if (sneakDiceFromData) {
          sneakDice = 1;
          const sorted = Object.keys(sneakDiceFromData).map(Number).sort((a, b) => a - b);
          for (const lvl of sorted) {
            if (attacker.level >= lvl) sneakDice = sneakDiceFromData[String(lvl)];
          }
        } else {
          sneakDice = attacker.sneakAttackDice ?? Math.ceil(attacker.level / 2);
        }
        for (let i = 0; i < (isCrit ? 2 * sneakDice : sneakDice); i++) {
          damageTotal += cryptoRoll(6);
        }
      }

      const dmgCtx: AttackDamageContext = {
        _hook: 'onAttackDamage',
        damage: damageTotal,
        character: attacker,
        weaponName,
        isCrit,
        isRanged,
      };
      const afterDmg = applyEffects(attacker, 'onAttackDamage', dmgCtx);
      damageTotal = afterDmg.damage;

      if (divineSmite && divineSmite.slotLevel && !isOffHand) {
        const smiteLevel = Math.min(divineSmite.slotLevel, 5);
        const smiteDice = 2 + smiteLevel;
        const isFiendOrUndead = enemy.type === 'fiend' || enemy.type === 'undead';
        const extraSmiteDie = isFiendOrUndead ? 1 : 0;
        for (let i = 0; i < smiteDice + extraSmiteDie; i++) {
          damageTotal += cryptoRoll(8);
        }
        damageTotal = Math.round(damageTotal);
        // Consume the spell slot
        const slotId = `spell-slot-${divineSmite.slotLevel}`;
        const slot = (attacker.resources || []).find(r => r.id === slotId);
        if (slot && slot.current > 0) {
          slot.current -= 1;
        }
      }

      const dmgResult = await deps.inflict_damage(damageTotal, enemy.id, dmgType);
      if (!dmgResult.success) return dmgResult;

      const xpLine = typeof dmgResult.data?.xpLine === 'string' ? dmgResult.data.xpLine as string : '';
      const critText = isCrit ? ' **CRITICAL HIT!**' : '';
      const offHandText = isOffHand ? ' (off-hand)' : '';
      return {
        success: true,
        data: {
          ...baseData, isHit: true,
          damage: damageTotal, damageResults, damageDice, damageType: dmgType,
          targetNewHp: enemy.hp.current, targetDefeated: enemy.isDead,
          xpAwarded: !!xpLine, xpLine,
        },
        message: `You attack ${enemy.name} with ${weaponName}${offHandText}: **HIT${critText}** (Rolled ${attackRoll} vs AC ${enemyAc}) dealing **${damageTotal}** ${dmgType} damage! ${enemy.name}: ${enemy.hp.current}/${enemy.hp.max} HP.${xpLine ? ' ' + xpLine : ''}`
      };
    },
  };
}
