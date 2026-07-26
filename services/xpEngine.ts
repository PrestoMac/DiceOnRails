import { GameState, LevelUpSummary, LocationSignificance, QuestDifficulty } from '../types';
import { awardExperience as progAward } from './progressionService';

/**
 * Centralized XP engine. Every XP award in the system flows through `computeXp`
 * (pure amount calculation) and `awardXpToParty` (flat award to all party members).
 *
 * Design:
 * - No party splitting, no solo buff — every character receives the full amount.
 * - The LLM never names an XP number except the optional roleplay `xp` on narrate_turn.
 * - Tune game feel by editing the per-trigger functions below.
 */

export type XpTrigger = 'combat' | 'skill' | 'explore' | 'quest' | 'lore' | 'roleplay';

export type { LocationSignificance, QuestDifficulty };

/** Context bundle passed to `computeXp`. Only the fields relevant to the trigger need be set. */
export interface XpContext {
  /** Combat: enemy Challenge Rating (used when `xp` is absent). */
  cr?: number;
  /** Combat: explicit enemy XP value (preferred over CR lookup — it is CR-derived in the data). */
  xp?: number;
  /** Skill: ability check DC. */
  dc?: number;
  /** Skill: true when the raw d20 landed on 20 (doubles the base XP). */
  nat20?: boolean;
  /** Explore: significance tier supplied by the LLM on `move_to`. */
  significance?: LocationSignificance;
  /** Quest: difficulty tier supplied by the LLM on `upsert_quest`. */
  difficulty?: QuestDifficulty;
  /** Roleplay: LLM-proposed amount (clamped to 5–50). */
  amount?: number;
}

/**
 * Official 5e CR → XP table keyed by numeric CR. Used as a fallback when an enemy
 * has no explicit `xp` field. Covers CR 0 through 30.
 */
const NUMERIC_CR_XP: Record<number, number> = {
  0: 10, 0.125: 25, 0.25: 50, 0.5: 100,
  1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800,
  6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900,
  11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000,
  16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000,
  21: 33000, 22: 41000, 23: 50000, 24: 62000, 25: 75000,
  26: 90000, 27: 105000, 28: 120000, 29: 135000, 30: 155000,
};

/** Combat XP: respect an explicit enemy.xp (even 0); fall back to CR table only when xp is absent. */
function combatXp(ctx: XpContext): number {
  if (typeof ctx.xp === 'number') return Math.max(0, ctx.xp);
  if (typeof ctx.cr === 'number') {
    return NUMERIC_CR_XP[ctx.cr] ?? Math.round(10 * Math.pow(ctx.cr + 1, 2));
  }
  return 10;
}

/** Skill XP: DC-bracketed base; a natural 20 doubles the result. */
function skillXp(ctx: XpContext): number {
  const dc = ctx.dc ?? 10;
  const base = dc >= 25 ? 150 : dc >= 20 ? 75 : dc >= 15 ? 35 : dc >= 10 ? 15 : 5;
  return ctx.nat20 ? base * 2 : base;
}

/**
 * Exploration XP: tiered by LLM-supplied significance.
 * When significance is omitted the engine defaults to the landmark tier (100 XP)
 * to keep exploration rewarding and leveling fast.
 */
function exploreXp(ctx: XpContext): number {
  const sig = ctx.significance;
  if (sig === 'minor') return 25;
  if (sig === 'major') return 50;
  return 100;
}

/** Quest XP: fixed bracket per difficulty tier. Defaults to 'easy' (100). */
function questXp(ctx: XpContext): number {
  const diff = ctx.difficulty ?? 'easy';
  const brackets: Record<QuestDifficulty, number> = {
    trivial: 50, easy: 100, medium: 200, hard: 400, deadly: 800,
  };
  return brackets[diff] ?? 100;
}

/** Lore XP: flat small chunk per new journal entry. */
function loreXp(): number {
  return 10;
}

/** Roleplay XP: LLM-proposed amount clamped to the 1–10 range. Default baseline is 1 XP. */
function roleplayXp(ctx: XpContext): number {
  const amount = typeof ctx.amount === 'number' ? ctx.amount : 1;
  return Math.max(1, Math.min(10, Math.round(amount)));
}

/**
 * Computes the XP amount for a given trigger. Pure — no state mutation.
 * This is the single function every award site calls.
 */
export function computeXp(trigger: XpTrigger, ctx: XpContext = {}): number {
  switch (trigger) {
    case 'combat':   return combatXp(ctx);
    case 'skill':    return skillXp(ctx);
    case 'explore':  return exploreXp(ctx);
    case 'quest':    return questXp(ctx);
    case 'lore':     return loreXp();
    case 'roleplay': return roleplayXp(ctx);
  }
}

export interface XpAwardResult {
  /** The per-character amount awarded. */
  amount: number;
  /** Per-character report lines (e.g. "Aria +50 XP" or "Aria leveled up to 3!"). */
  reports: string[];
  /** True if any party member crossed a level boundary. */
  anyLevelUp: boolean;
  /** Level-up summaries for every member that leveled (empty when none did). */
  levelUpSummaries: LevelUpSummary[];
}

/**
 * Awards a flat XP amount to EVERY party member. No split, no solo buff.
 * Mutates `state.party` in place (replacing each character with its leveled-up copy)
 * and pushes level-up lines to `state.sessionLogs`.
 */
export function awardXpToParty(state: GameState, amount: number): XpAwardResult {
  const reports: string[] = [];
  const levelUpSummaries: LevelUpSummary[] = [];
  let anyLevelUp = false;

  state.party = state.party.map(character => {
    const result = progAward(character, amount);
    if (result.leveledUp && result.levelUpSummary) {
      anyLevelUp = true;
      levelUpSummaries.push(result.levelUpSummary);
      state.sessionLogs.push(`${result.character.name} reached level ${result.levelUpSummary.newLevel}!`);
      reports.push(`${result.character.name} leveled up to ${result.levelUpSummary.newLevel}!`);
    } else {
      reports.push(`${result.character.name} +${amount} XP`);
    }
    return result.character;
  });

  return { amount, reports, anyLevelUp, levelUpSummaries };
}

const TRIGGER_LABELS: Record<XpTrigger, string> = {
  combat: 'Combat XP',
  skill: 'Skill XP',
  explore: 'Exploration XP',
  quest: 'Quest XP',
  lore: 'Lore XP',
  roleplay: 'Roleplay XP',
};

/** Builds a human-readable summary line for tool result messages. */
export function formatXpAwardLine(trigger: XpTrigger, result: XpAwardResult): string {
  const label = TRIGGER_LABELS[trigger];
  const levelUpSuffix = result.anyLevelUp ? ' LEVEL UP!' : '';
  return `${label} (auto): ${result.amount} XP each. ${result.reports.join('; ')}${levelUpSuffix}`;
}
