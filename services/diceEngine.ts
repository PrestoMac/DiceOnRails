import { cryptoRoll } from '../utils/random';
import type { Character, CombatState } from '../types';
import { getExhaustionPenalty } from './conditionEngine';
import { ensureDeathSaves, updateCombatantDeathStatus } from './characterUtils';
import { getDeathSaveBonus } from './featsService';

/** Rolls a number of dice with the given sides and returns the sum total. */
export function rollDice(count: number, sides: number): number {
  let total = 0;
  for (let i = 0; i < count; i++) total += cryptoRoll(sides);
  return total;
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
  // Durable / Resilient-CON feats grant a flat bonus to death saves via getDeathSaveBonus.
  // The bonus is added to the total (not the natural die) so a nat 20 still revives and a
  // nat 1 still crit-fails by SRD. The rollSuccess check uses the modified total.
  const deathBonus = getDeathSaveBonus(ch);
  const total = rawRoll - getExhaustionPenalty(ch) + deathBonus;
  if (rawRoll === 20) {
    ch.hp.current = 1;
    ch.deathSaves = { successes: 0, failures: 0, isStable: false };
    if (cs) updateCombatantDeathStatus(cs, ch.id, false);
    return { message: `${ch.name} rolls DEATH SAVE: **Natural 20!** Revived with 1 HP!`, roll: rawRoll, total, successes: 0, failures: 0, isStable: false, revived: true, died: false, rollSuccess: true };
  }
  if (total >= 10) {
    s.successes++;
    if (s.successes >= 3) s.isStable = true;
    const bonusText = deathBonus > 0 ? ` (+${deathBonus} Durable)` : '';
    return { message: `${ch.name} rolls DEATH SAVE: **${rawRoll}**${bonusText} — ${s.successes >= 3 ? '3 successes! Stabilized.' : `Success (${s.successes}/3)`}`, roll: rawRoll, total, successes: s.successes, failures: s.failures, isStable: s.isStable, revived: false, died: false, rollSuccess: true };
  }
  s.failures++;
  const dead = s.failures >= 3;
  if (dead && cs) updateCombatantDeathStatus(cs, ch.id, true);
  return { message: `${ch.name} rolls DEATH SAVE: **${rawRoll}** — ${dead ? `3 failures! **${ch.name} has died.**` : `Failure (${s.failures}/3)`}`, roll: rawRoll, total, successes: s.successes, failures: s.failures, isStable: false, revived: false, died: dead, rollSuccess: false };
}
