import type { RollData } from '../../../types';

/**
 * Builds a replay payload for the dice-roll modal from a persisted RollData.
 * Ported verbatim from the old ChatLog `buildReplayData`.
 */
export function buildReplayData(rd: RollData): Record<string, unknown> {
  return {
    characterName: rd.label || 'Unknown',
    rollType: rd.type,
    label: rd.label,
    rollResult: rd.dieRoll,
    modifier: rd.modifier,
    skillRank: rd.skillRank,
    difficulty: rd.dc,
    success: rd.success,
    xpGained: undefined,
    sides: parseInt((rd.dieFace || 'd20').replace('d', '')),
    isCritical: rd.isCritical,
    isFumble: rd.isFumble,
    count: rd.dieCount,
    results: rd.results,
  };
}
