import { describe, it, expect } from 'vitest';
import { createStateService } from '../../../services/mcp/stateService';
import { GameState, Character, Message, MessageRole } from '../../../types';

function makeWizard(overrides: Partial<Character> = {}): Character {
  return {
    id: 'wiz-1',
    name: 'Magus',
    class: 'wizard',
    race: 'human',
    level: 5,
    hp: { current: 28, max: 28 },
    stats: { str: 8, dex: 14, con: 12, int: 18, wis: 10, cha: 10 },
    inventory: [],
    currency: { gp: 0, sp: 0, cp: 0 },
    location: 'Tavern',
    experience: 0,
    experienceToNextLevel: 0,
    unusedStatPoints: 0,
    maxHpBonus: 0,
    hitDice: { current: 5, max: 5 },
    knownSpells: ['fireball', 'magic-missile'],
    preparedSpells: ['fireball', 'magic-missile'],
    resources: [
      { id: 'spell-slot-1', name: 'Level 1 Spell Slot', current: 4, max: 4, resetOn: 'long', source: 'class', sourceId: 'wizard' },
      { id: 'spell-slot-2', name: 'Level 2 Spell Slot', current: 3, max: 3, resetOn: 'long', source: 'class', sourceId: 'wizard' },
      { id: 'spell-slot-3', name: 'Level 3 Spell Slot', current: 2, max: 2, resetOn: 'long', source: 'class', sourceId: 'wizard' },
    ],
    ...overrides,
  };
}

function makeState(): GameState {
  return {
    party: [makeWizard()],
    worldDescription: 'A dark tavern',
    sessionLogs: [],
    quests: [],
    lore: [],
    actionQueue: [],
  } as unknown as GameState;
}

function userMsg(text: string): Message {
  return { id: `user-${Math.random()}`, role: MessageRole.USER, text, timestamp: Date.now() };
}

describe('stateService rewind cycle (spell slot restoration)', () => {
  it('saveRewindPoint + restoreSnapshot preserves spell slots across multiple cycles', () => {
    const initialState = makeState();
    const stateService = createStateService(initialState);

    const SLOT_3_MAX = 2;
    const SLOT_1_MAX = 4;

    function slot(level: number): number {
      const char = stateService.getFullState().party[0];
      const r = (char.resources ?? []).find(x => x.id === `spell-slot-${level}`);
      return r?.current ?? -1;
    }

    function consume(level: number): void {
      const char = stateService.getFullState().party[0];
      const r = (char.resources ?? []).find(x => x.id === `spell-slot-${level}`);
      if (!r) throw new Error(`No slot ${level}`);
      r.current -= 1;
    }

    const messages: Message[] = [userMsg('I cast fireball')];

    for (let cycle = 1; cycle <= 3; cycle++) {
      // Pre-turn: save rewind point with full slots
      stateService.saveRewindPoint(stateService.getFullState(), messages);

      // Sanity: slots at max before consume
      expect(slot(3)).toBe(SLOT_3_MAX);
      expect(slot(1)).toBe(SLOT_1_MAX);

      // Simulate agent loop consuming one L3 slot
      consume(3);
      expect(slot(3)).toBe(SLOT_3_MAX - 1);

      // Rewind: load + restore
      const loaded = stateService.loadRewindPoint();
      if (!loaded) throw new Error(`cycle ${cycle}: expected rewind point to exist`);
      stateService.restoreSnapshot(loaded.gameState);

      // Critical assertion: slot fully restored to max
      expect(slot(3)).toBe(SLOT_3_MAX);
      expect(slot(1)).toBe(SLOT_1_MAX);

      stateService.clearRewindPoint();
    }
  });

  it('loadRewindPoint returns independent deep copy (mutating live state after save does not affect saved point)', () => {
    const initialState = makeState();
    const stateService = createStateService(initialState);

    stateService.saveRewindPoint(stateService.getFullState(), []);

    const char = stateService.getFullState().party[0];
    const slot3 = (char.resources ?? []).find(r => r.id === 'spell-slot-3');
    if (!slot3) throw new Error('expected spell-slot-3');
    slot3.current -= 1;
    slot3.current -= 1;

    const loaded = stateService.loadRewindPoint();
    if (!loaded) throw new Error('expected rewind point');
    const loadedResources = loaded.gameState.party[0].resources;
    if (!loadedResources) throw new Error('expected resources on loaded character');
    const loadedSlot3 = loadedResources.find(r => r.id === 'spell-slot-3');
    if (!loadedSlot3) throw new Error('expected spell-slot-3 in loaded');
    expect(loadedSlot3.current).toBe(2);
  });

  it('restoreSnapshot fully replaces party array (no stale references)', () => {
    const initialState = makeState();
    const stateService = createStateService(initialState);

    stateService.saveRewindPoint(stateService.getFullState(), []);

    // Capture reference to original party / character
    const originalParty = stateService.getFullState().party;
    const originalChar = originalParty[0];

    // Mutate original character
    const originalResources = originalChar.resources;
    if (!originalResources) throw new Error('expected resources');
    const slot3 = originalResources.find(r => r.id === 'spell-slot-3');
    if (!slot3) throw new Error('expected spell-slot-3');
    slot3.current = 0;

    // Restore
    const loaded = stateService.loadRewindPoint();
    if (!loaded) throw new Error('expected rewind point');
    stateService.restoreSnapshot(loaded.gameState);

    // The live state's party should be a DIFFERENT array reference now
    const restoredParty = stateService.getFullState().party;
    expect(restoredParty).not.toBe(originalParty);

    // And the restored character should be a different reference
    const restoredChar = restoredParty[0];
    expect(restoredChar).not.toBe(originalChar);

    // And the slot should be pristine, even on the new reference
    const restoredResources = restoredChar.resources;
    if (!restoredResources) throw new Error('expected restored resources');
    const restoredSlot3 = restoredResources.find(r => r.id === 'spell-slot-3');
    if (!restoredSlot3) throw new Error('expected restored spell-slot-3');
    expect(restoredSlot3.current).toBe(2);

    // The old (stale) character still reflects the mutation; that's expected.
    expect(slot3.current).toBe(0);
  });

  it('saveRewindPoint captures lastSuggestionsByCharacter so a rewind restores each player\'s chips', () => {
    // Validates the Part 1 disappear-on-select contract: a turn clears the
    // local player's chips immediately (handled in useGameActions), but
    // because the snapshot was saved BEFORE the clear, an undo restores them.
    // Per-character entries must survive the deep-clone cycle intact.
    const initialState = makeState();
    const stateService = createStateService(initialState);

    // Each player has unique suggestions.
    const preTurnMap = {
      'wiz-1': ['Cast fireball', 'Examine aura'],
      'rogue-1': ['Sneak Attack', 'Hide'],
    };
    stateService.loadState({
      ...stateService.getFullState(),
      lastSuggestionsByCharacter: preTurnMap,
    });

    // Pre-turn snapshot captures the populated map.
    stateService.saveRewindPoint(stateService.getFullState(), []);

    // During the turn: loadState clears the map (the engine side of Part 1's
    // immediate clear, before the new turn's suggestions resolve).
    stateService.loadState({
      ...stateService.getFullState(),
      lastSuggestionsByCharacter: {},
    });
    expect(stateService.getFullState().lastSuggestionsByCharacter).toEqual({});

    // Rewind restores the pre-turn map.
    const loaded = stateService.loadRewindPoint();
    if (!loaded) throw new Error('expected rewind point');
    stateService.restoreSnapshot(loaded.gameState);

    const restored = stateService.getFullState().lastSuggestionsByCharacter;
    expect(restored).toEqual(preTurnMap);
    // Both players' chips survived the deep-clone round-trip.
    expect(restored?.['wiz-1']).toEqual(['Cast fireball', 'Examine aura']);
    expect(restored?.['rogue-1']).toEqual(['Sneak Attack', 'Hide']);
  });
});
