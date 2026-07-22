import { describe, it, expect } from 'vitest';
import { createStateService } from '../../../services/mcp/stateService';
import { GameState } from '../../../types';

/**
 * Campaign-isolation guarantees for StateService.loadState.
 *
 * loadState used to use a plain Object.assign, which left optional fields
 * (combat, lastDiceRoll, lastSuggestions, ctx, etc.) from the prior campaign
 * in place when the incoming savedState omitted them. The delete-list in
 * loadState must purge those keys before Object.assign so switching campaigns
 * cannot leak optional state across campaigns.
 */

function makeBaseState(): GameState {
  return {
    party: [],
    worldDescription: 'A dark tavern',
    sessionLogs: [],
    quests: [],
    lore: [],
    actionQueue: [],
  } as unknown as GameState;
}

describe('stateService.loadState campaign isolation', () => {
  it('purges combat when the incoming savedState does not include it', () => {
    const state = makeBaseState();
    const stateService = createStateService(state);

    // Campaign A: active combat.
    stateService.loadState({
      ...makeBaseState(),
      combat: { isActive: true, round: 2, initiative: [] } as unknown as GameState['combat'],
    });
    expect(stateService.getFullState().combat).toBeDefined();

    // Campaign B: no combat key at all.
    stateService.loadState({ ...makeBaseState() });
    expect(stateService.getFullState().combat).toBeUndefined();
  });

  it('purges lastDiceRoll, lastSuggestions, ctx, _tiredWarningFired, isProcessing, processingUser', () => {
    const state = makeBaseState();
    const stateService = createStateService(state);

    // Campaign A: every optional field populated.
    stateService.loadState({
      ...makeBaseState(),
      lastDiceRoll: { sides: 20, count: 1, modifier: 0, results: [15], total: 15 },
      lastSuggestions: ['Attack', 'Cast spell'],
      ctx: { episodeCheckpoints: ['A summary'], frozenRawHistory: 'earlier events' } as unknown as GameState['ctx'],
      _tiredWarningFired: true,
      isProcessing: true,
      processingUser: 'Player 1',
    });

    // Sanity: all keys are present after Campaign A loads.
    const afterA = stateService.getFullState();
    expect(afterA.lastDiceRoll).toBeDefined();
    expect(afterA.lastSuggestions).toEqual(['Attack', 'Cast spell']);
    expect(afterA.ctx).toBeDefined();
    expect((afterA as { _tiredWarningFired?: boolean })._tiredWarningFired).toBe(true);
    expect(afterA.isProcessing).toBe(true);
    expect(afterA.processingUser).toBe('Player 1');

    // Campaign B: bare state with none of the optional keys.
    stateService.loadState({ ...makeBaseState() });

    const afterB = stateService.getFullState();
    expect(afterB.lastDiceRoll).toBeUndefined();
    expect(afterB.lastSuggestions).toBeUndefined();
    expect(afterB.ctx).toBeUndefined();
    expect((afterB as { _tiredWarningFired?: boolean })._tiredWarningFired).toBeUndefined();
    expect(afterB.isProcessing).toBeUndefined();
    expect(afterB.processingUser).toBeUndefined();
  });

  it('still applies incoming optional fields when savedState provides them', () => {
    const state = makeBaseState();
    const stateService = createStateService(state);

    stateService.loadState({
      ...makeBaseState(),
      combat: { isActive: true, round: 1, initiative: [] } as unknown as GameState['combat'],
      lastSuggestions: ['Look around'],
      ctx: { episodeCheckpoints: ['B summary'] } as unknown as GameState['ctx'],
    });

    const after = stateService.getFullState();
    expect(after.combat).toBeDefined();
    expect(after.combat?.isActive).toBe(true);
    expect(after.lastSuggestions).toEqual(['Look around']);
    expect(after.ctx).toBeDefined();
  });
});
