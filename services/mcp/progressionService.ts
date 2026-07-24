import { Character, GameState, MCPResponse, LevelUpSummary, Enemy } from '../../types';
import { fail } from './_shared';
import { awardExperience as progAward, applyStatAllocation, getProgressionContext } from '../progressionService';

/**
 * Auto-awards an enemy's XP to the party on defeat (party-split + solo-buff, mirroring awardExperience).
 * Idempotent via the enemy.xpAwarded flag — safe to call from every damage path.
 * @returns A summary line appended to tool result messages, or empty string if already awarded/no XP.
 */
export function awardEnemyDefeatXp(state: GameState, enemy: Enemy): string {
  if (enemy.xpAwarded) return '';
  const baseXp = Math.max(0, Number(enemy.xp ?? 0));
  if (baseXp === 0) {
    enemy.xpAwarded = true;
    return '';
  }
  enemy.xpAwarded = true;

  const partySize = state.party.length;
  if (partySize === 0) return '';

  let perMember: number;
  let soloBuff = false;
  if (partySize === 1) {
    perMember = Math.round(baseXp * 1.25);
    soloBuff = true;
  } else {
    perMember = Math.max(1, Math.floor(baseXp / partySize));
  }

  const reports: string[] = [];
  let anyLevelUp = false;
  state.party = state.party.map(target => {
    const result = progAward(target, perMember);
    if (result.leveledUp && result.levelUpSummary) {
      anyLevelUp = true;
      state.sessionLogs.push(`${result.character.name} reached level ${result.levelUpSummary.newLevel}!`);
      reports.push(`${result.character.name} leveled up to ${result.levelUpSummary.newLevel}!`);
    } else {
      reports.push(`${result.character.name} +${perMember} XP`);
    }
    return result.character;
  });

  const prefix = soloBuff
    ? `Combat XP (auto): ${perMember} XP each (solo +25% buff, base CR ${baseXp}).`
    : `Combat XP (auto): ${baseXp} XP split ${perMember}/each.`;
  return `${prefix}${anyLevelUp ? ' LEVEL UP!' : ''} ${reports.join('; ')}`;
}

/** Service interface for managing character experience, levels, and stat allocations. */
export interface ProgressionService {
  awardExperience(amount: number, targetId?: string): { success: boolean; data: Record<string, unknown>; message: string; leveledUp: boolean; levelUpSummary?: LevelUpSummary; levelUpSummaries?: LevelUpSummary[] };
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
    awardExperience(amount: number, targetId?: string) {
      if (state.party.length === 0) {
        return { success: false, data: {}, message: "No characters in party.", leveledUp: false };
      }

      const isPartyWide = !targetId || targetId.toLowerCase() === 'party' || targetId.toLowerCase() === 'all';

      if (isPartyWide) {
        const partySize = state.party.length;
        let finalAmount = amount;
        let soloBuffApplied = false;

        if (partySize === 1) {
          finalAmount = Math.round(amount * 1.25);
          soloBuffApplied = true;
        } else {
          finalAmount = Math.max(1, Math.floor(amount / partySize));
        }

        const summaries: LevelUpSummary[] = [];
        let anyLeveledUp = false;
        const characterReports: string[] = [];

        state.party = state.party.map(target => {
          const result = progAward(target, finalAmount);
          if (result.leveledUp && result.levelUpSummary) {
            anyLeveledUp = true;
            summaries.push(result.levelUpSummary);
            state.sessionLogs.push(`${result.character.name} reached level ${result.levelUpSummary.newLevel}!`);
            characterReports.push(`${result.character.name} leveled up to ${result.levelUpSummary.newLevel}!`);
          } else {
            characterReports.push(`${result.character.name} gained ${finalAmount} XP (${result.character.experience}/${result.character.experienceToNextLevel} XP)`);
          }
          return result.character;
        });

        const messagePrefix = soloBuffApplied
          ? `Awarded ${finalAmount} XP to solo adventurer (includes +25% Solo Buff, base: ${amount} XP).`
          : `Divided ${amount} total XP among ${partySize} party members (${finalAmount} XP each).`;

        return {
          success: true,
          data: { party: state.party.map(c => ({ name: c.name, xp: c.experience, level: c.level })) },
          message: `${messagePrefix} Details: ${characterReports.join('; ')}`,
          leveledUp: anyLeveledUp,
          levelUpSummaries: summaries,
          levelUpSummary: summaries[0],
        };
      } else {
        const target = getTarget(targetId);
        if (!target) return { success: false, data: {}, message: "Target character not found.", leveledUp: false };

        let finalAmount = amount;
        let soloBuffApplied = false;
        if (state.party.length === 1) {
          finalAmount = Math.round(amount * 1.25);
          soloBuffApplied = true;
        }

        const result = progAward(target, finalAmount);
        const idx = state.party.findIndex(c => c.id === result.character.id);
        if (idx > -1) {
          state.party[idx] = result.character;
        }

        const soloMsg = soloBuffApplied ? ` (includes +25% Solo Buff, base: ${amount} XP)` : '';

        if (result.leveledUp && result.levelUpSummary) {
          state.sessionLogs.push(`${result.character.name} reached level ${result.levelUpSummary.newLevel}!`);
          return {
            success: true,
            data: { character: result.character.name, xp: result.character.experience, level: result.character.level },
            message: `Awarded ${finalAmount} XP to ${result.character.name}${soloMsg}. LEVEL UP! Now level ${result.levelUpSummary.newLevel} (HP: ${result.levelUpSummary.newMaxHp}, ${result.levelUpSummary.statPointsGained} stat points gained).`,
            leveledUp: true,
            levelUpSummaries: [result.levelUpSummary],
            levelUpSummary: result.levelUpSummary,
          };
        }

        return {
          success: true,
          data: { character: result.character.name, xp: result.character.experience },
          message: `Awarded ${finalAmount} XP to ${result.character.name}${soloMsg}. (${result.character.experience}/${result.character.experienceToNextLevel} XP to level ${result.character.level + 1})`,
          leveledUp: false,
        };
      }
    },

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
