import { Character, GameState, MCPResponse, Enemy } from '../../types';
import { fail } from './_shared';
import { applyStatAllocation, getProgressionContext } from '../progressionService';
import { computeXp, awardXpToParty, formatXpAwardLine } from '../xpEngine';
import { applyEffects, LevelUpContext } from '../effectDispatcher';

/**
 * Auto-awards an enemy's XP to the party on defeat. Combat XP is CR-based (via the
 * xpEngine), awarded flat to every party member — no split, no solo buff.
 * Idempotent via the enemy.xpAwarded flag — safe to call from every damage path.
 * @returns A summary line appended to tool result messages, or empty string if already awarded/no XP.
 */
export function awardEnemyDefeatXp(state: GameState, enemy: Enemy): string {
  if (enemy.xpAwarded) return '';
  const amount = computeXp('combat', { xp: enemy.xp, cr: enemy.cr });
  if (amount <= 0) {
    enemy.xpAwarded = true;
    return '';
  }
  enemy.xpAwarded = true;

  if (state.party.length === 0) return '';

  const result = awardXpToParty(state, amount);
  return formatXpAwardLine('combat', result);
}

/** Service interface for managing character experience, levels, and stat allocations. */
export interface ProgressionService {
  level_up(targetId: string, statAllocations?: Record<string, number>, subclassSelection?: string, chosenFeats?: string[]): Promise<MCPResponse>;
  allocateStatPoints(allocations: Partial<Record<keyof Character['stats'], number>>, targetId?: string, skillAllocations?: Record<string, number>, hpDeviation?: number): MCPResponse;
  getCharacterProgression(targetId?: string): string;
}

/** Creates a new ProgressionService instance operating on the given GameState. */
export function createProgressionService(state: GameState): ProgressionService {
  function getTarget(id?: string): Character | undefined {
    if (!id) return state.party[0];
    return state.party.find(c => c.id === id || c.name.toLowerCase() === id.toLowerCase());
  }

  return {
    async level_up(targetId, statAllocations, subclassSelection, chosenFeats) {
      const target = getTarget(targetId);
      if (!target) return fail(`Character "${targetId}" not found.`);

      const context = getProgressionContext(target);

      if (context.pendingStatAllocations > 0) {
        if (!statAllocations || Object.keys(statAllocations).length === 0) {
          return fail(`${target.name} has pending Attribute Score Improvements (${context.pendingStatAllocations} points). Provide statAllocations.`);
        }
        const sum = Object.values(statAllocations).reduce((a, b) => a + b, 0);
        if (sum !== context.pendingStatAllocations) {
          return fail(`Allocated ${sum} points but require exactly ${context.pendingStatAllocations} points.`);
        }
        const applyResult = applyStatAllocation(target, statAllocations);
        if (!applyResult.success) {
          return fail(applyResult.message || "Failed to allocate stat points.");
        }
      }

      if (context.pendingSubclassSelection && subclassSelection) {
        target.subclass = subclassSelection.toLowerCase().trim();
        target.pendingSubclassFeature = false;
      }

      if (context.pendingFeatChoice && chosenFeats && chosenFeats.length > 0) {
        target.feats = [...(target.feats || []), ...chosenFeats];
        target.pendingFeatChoice = false;
      }

      const idx = state.party.findIndex(c => c.id === target.id);
      if (idx > -1) {
        state.party[idx] = target;
      }

      if (!target.hitDice) target.hitDice = { current: target.level, max: target.level };
      target.feats ??= [];
      target.featSelections ??= [];
      target.featChoices ??= {};
      target.pendingFeatChoice ??= false;
      if (target.class) target.class = target.class.toLowerCase();
      if (target.race) target.race = target.race.toLowerCase();
      target.resources ??= [];
      target.knownSpells ??= [];
      target.preparedSpells ??= [];
      target.racialTraits ??= [];
      target.unlockedSubclassFeatures ??= [];
      target.pendingSubclassFeature ??= false;
      if (!target.conditionsImmunities && (target.racialTraits || []).includes('fey-ancestry')) {
        target.conditionsImmunities = ['sleep'];
      }

      const levelUpCtx: LevelUpContext = { _hook: 'onLevelUp', character: target, newLevel: target.level };
      applyEffects(target, 'onLevelUp', levelUpCtx);

      return {
        success: true,
        data: { character: target.name, level: target.level, stats: target.stats, feats: target.feats, subclass: target.subclass },
        message: `Successfully processed level up choices for ${target.name}! Character is now level ${target.level}.`
      };
    },

    allocateStatPoints(allocations, targetId, skillAllocations = {}, hpDeviation = 0) {
      const target = getTarget(targetId);
      if (!target) return fail("Target character not found.");

      const result = applyStatAllocation(target, allocations, skillAllocations, hpDeviation);

      if (result.errors.length > 0) {
        return fail(result.errors.join('; '));
      }

      const idx = state.party.findIndex(c => c.id === result.character.id);
      if (idx > -1) {
        state.party[idx] = result.character;
      }

      const statNames: Record<string, string> = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };
      const allocatedDesc = Object.entries(allocations)
        .filter(([, v]) => typeof v === 'number' && v > 0)
        .map(([k, v]) => `${statNames[k] || k}+${v}`)
        .join(', ');

      const skillDesc = Object.entries(skillAllocations)
        .filter(([, v]) => typeof v === 'number' && v > 0)
        .map(([k, v]) => `${k}+${v}`)
        .join(', ');

      const parts = [];
      if (allocatedDesc) parts.push(`Stats: ${allocatedDesc}`);
      if (skillDesc) parts.push(`Skills: ${skillDesc}`);
      if (hpDeviation !== 0) parts.push(`HP roll adjustment: ${hpDeviation > 0 ? '+' : ''}${hpDeviation}`);
      const summary = parts.join('; ');

      return {
        success: true,
        data: { character: result.character, hpGained: result.hpGained },
        message: `${target.name}'s stats updated: ${summary}. HP: ${result.character.hp.max}${result.hpGained > 0 ? ` (+${result.hpGained})` : ''}.`,
      };
    },

    getCharacterProgression(targetId) {
      const target = getTarget(targetId);
      if (!target) return 'No character found.';
      return getProgressionContext(target);
    },
  };
}
