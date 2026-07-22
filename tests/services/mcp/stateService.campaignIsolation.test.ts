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

describe('stateService.reset() campaign isolation', () => {
  it('clears gameTime, lastSuggestions, ctx, and all transient fields', () => {
    const state = makeBaseState();
    const stateService = createStateService(state);

    // Populate every field that previously leaked through reset().
    stateService.loadState({
      ...makeBaseState(),
      gameTime: 720,
      lastLongRestTime: 600,
      factionReputations: { orcs: -10, elves: 5 },
      combat: { isActive: true, round: 3, initiative: [] } as unknown as GameState['combat'],
      lastDiceRoll: { sides: 20, count: 1, modifier: 0, results: [15], total: 15 },
      lastSuggestions: ['Attack', 'Dodge'],
      ctx: { episodeCheckpoints: ['summary'], frozenRawHistory: 'history' } as unknown as GameState['ctx'],
      _tiredWarningFired: true,
      isProcessing: true,
      processingUser: 'Player',
    });

    // Sanity: fields are present before reset.
    const before = stateService.getFullState();
    expect(before.gameTime).toBe(720);
    expect(before.lastSuggestions).toEqual(['Attack', 'Dodge']);
    expect(before.ctx).toBeDefined();
    expect(before.combat?.isActive).toBe(true);

    // Reset — should produce a pristine new-campaign state.
    stateService.reset();

    const after = stateService.getFullState();
    // gameTime and lastLongRestTime must be at their default values, not leaked.
    expect(after.gameTime).toBe(0);
    expect(after.lastLongRestTime).toBe(-960);
    // Transient optional fields must be gone entirely.
    expect(after.combat).toBeUndefined();
    expect(after.lastDiceRoll).toBeUndefined();
    expect(after.lastSuggestions).toBeUndefined();
    expect(after.ctx).toBeUndefined();
    expect((after as { _tiredWarningFired?: boolean })._tiredWarningFired).toBeUndefined();
    expect(after.isProcessing).toBeUndefined();
    expect(after.processingUser).toBeUndefined();
    // factionReputations should be a fresh empty object.
    expect(after.factionReputations).toEqual({});
  });
});
