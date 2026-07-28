import { describe, it, expect, beforeEach } from 'vitest';
import { MockMCPServer } from '../../services/mcpService';
import { GameState } from '../../types';

/**
 * End-to-end isolation test for the campaign-switch reset chain.
 *
 * The production switch path (useCampaigns.handleJoinCampaign) runs:
 *   1. mcpServer.reset()              (clears engine state + rewind closures)
 *   2. resetRewindGeneration()        (zeroes the module counter)
 *   3. loadGameData() → mcpServer.loadState(B)  (loads new campaign)
 *
 * This test drives the engine side of that chain with a real MockMCPServer
 * instance (per AGENTS.md: never mock mcpService for tool/state tests) and
 * verifies that no optional GameState field from Campaign A survives into
 * Campaign B after the reset + load cycle.
 */

function makeCampaignState(opts: {
  combat?: GameState['combat'];
  lastSuggestions?: string[];
  lastSuggestionsByCharacter?: Record<string, string[]>;
  ctx?: GameState['ctx'];
  lastDiceRoll?: GameState['lastDiceRoll'];
  gameTime?: number;
}): GameState {
  return {
    party: [],
    worldDescription: 'A dark tavern',
    sessionLogs: [],
    quests: [],
    lore: [],
    combat: opts.combat,
    lastSuggestions: opts.lastSuggestions,
    lastSuggestionsByCharacter: opts.lastSuggestionsByCharacter,
    ctx: opts.ctx,
    lastDiceRoll: opts.lastDiceRoll,
    gameTime: opts.gameTime,
  } as unknown as GameState;
}

describe('campaign switch reset chain — engine isolation', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    server = new MockMCPServer();
  });

  it('mcpServer.reset() + loadState(B) leaves no optional field from A in B', () => {
    // --- Campaign A: richly populated ---
    const campaignA = makeCampaignState({
      combat: { isActive: true, round: 3, initiative: [] } as unknown as GameState['combat'],
      lastSuggestions: ['Attack the goblin', 'Cast fireball'],
      lastSuggestionsByCharacter: { 'hero-1': ['A-char1-suggestion'], 'hero-2': ['A-char2-suggestion'] },
      ctx: {
        episodeCheckpoints: ['A summary: met the dragon'],
        frozenRawHistory: 'A earlier events',
        frozenRawTokens: 500,
        frozenMessageCount: 8,
        turnCounter: 4,
      } as unknown as GameState['ctx'],
      lastDiceRoll: { sides: 20, count: 1, modifier: 2, results: [18], total: 20 },
      gameTime: 7200,
    });
    server.loadState(campaignA);
    server.saveRewindPoint(server.getFullState(), []);
    server.saveEmergencySnapshot(server.getFullState());

    // Sanity: A's optional fields are present.
    const stateA = server.getFullState();
    expect(stateA.combat?.isActive).toBe(true);
    expect(stateA.lastSuggestions).toEqual(['Attack the goblin', 'Cast fireball']);
    expect(stateA.lastSuggestionsByCharacter).toEqual({ 'hero-1': ['A-char1-suggestion'], 'hero-2': ['A-char2-suggestion'] });
    expect(stateA.ctx?.episodeCheckpoints).toHaveLength(1);
    expect(stateA.lastDiceRoll).toBeDefined();
    expect(stateA.gameTime).toBe(7200);

    // --- Switch to Campaign B: simulate handleJoinCampaign ---
    server.reset(); // clears engine state + rewindPoint + emergencySnapshot
    const campaignB = makeCampaignState({ gameTime: 0 });
    server.loadState(campaignB); // B has no combat/ctx/suggestions/diceRoll

    const stateB = server.getFullState();

    // Optional fields from A must NOT bleed into B.
    expect(stateB.combat).toBeUndefined();
    expect(stateB.lastSuggestions).toBeUndefined();
    expect(stateB.lastSuggestionsByCharacter).toBeUndefined();
    expect(stateB.ctx).toBeUndefined();
    expect(stateB.lastDiceRoll).toBeUndefined();

    // Required fields from B are correctly loaded.
    expect(stateB.gameTime).toBe(0);

    // Rewind closures were cleared by reset() — loadRewindPoint returns null.
    expect(server.loadRewindPoint()).toBeNull();
    expect(server.loadEmergencySnapshot()).toBeNull();
  });

  it('a fresh rewind point saved in B is not contaminated by A snapshots', () => {
    // Campaign A saves a rewind point.
    const campaignA = makeCampaignState({
      gameTime: 100,
      lastSuggestions: ['A suggestion'],
    });
    server.loadState(campaignA);
    server.saveRewindPoint(campaignA, []);

    // Switch to B.
    server.reset();
    const campaignB = makeCampaignState({
      gameTime: 200,
      lastSuggestions: ['B suggestion'],
    });
    server.loadState(campaignB);

    // B plays a turn and saves its own rewind point.
    server.saveRewindPoint(server.getFullState(), []);

    // Rewinding in B restores B's state, not A's.
    const rewind = server.loadRewindPoint();
    expect(rewind).not.toBeNull();
    expect(rewind?.gameState.gameTime).toBe(200);
    expect(rewind?.gameState.lastSuggestions).toEqual(['B suggestion']);
  });

  it('B can have its own combat state after switching from A (no combat field bleed)', () => {
    // A is in combat with a Goblin.
    server.loadState(makeCampaignState({
      combat: { isActive: true, round: 1, initiative: [{ id: 'goblin-1', name: 'Goblin', roll: 15 }] } as unknown as GameState['combat'],
    }));
    expect(server.getFullState().combat?.isActive).toBe(true);
    expect(server.getFullState().combat?.initiative).toHaveLength(1);

    // Switch to B with no combat, then load B's own combat (as loadGameData would
    // after fetching B's row from Supabase where B was mid-fight with an Orc).
    server.reset();
    server.loadState(makeCampaignState({
      gameTime: 0,
      combat: { isActive: true, round: 2, initiative: [{ id: 'orc-1', name: 'Orc', roll: 12 }] } as unknown as GameState['combat'],
    }));

    const state = server.getFullState();
    expect(state.combat).toBeDefined();
    expect(state.combat?.isActive).toBe(true);
    // B's combat has the Orc, NOT A's Goblin.
    const enemyNames = (state.combat?.initiative ?? []).map(e => e.name);
    expect(enemyNames).toContain('Orc');
    expect(enemyNames).not.toContain('Goblin');
  });
});
