import { GameState, Message } from '../../types';






/** Ensures that required GameState fields (gameTime, lastLongRestTime, factionReputations) have valid defaults. */
export function ensureGameStateFields(state: GameState): void {
  if (state.gameTime == null || typeof state.gameTime !== 'number' || isNaN(state.gameTime) || state.gameTime < 0) {
    state.gameTime = 0;
  }
  if (state.lastLongRestTime == null || typeof state.lastLongRestTime !== 'number' || isNaN(state.lastLongRestTime)) {
    state.lastLongRestTime = -960;
  }
  if (state.factionReputations == null) {
    state.factionReputations = {};
  }
}

/** Service interface for managing game state lifecycle, transactions, snapshots, and rewinds. */
export interface StateService {
  loadState(savedState: GameState): void;
  reset(): void;
  getFullState(): GameState;
  beginTransaction(): void;
  rollbackTransaction(): void;
  commitTransaction(): void;
  captureRewindSnapshot(): GameState | undefined;
  restoreSnapshot(snapshot: GameState): void;
  saveRewindPoint(gameState: GameState, messages: Message[]): void;
  loadRewindPoint(): { gameState: GameState; messages: Message[] } | null;
  clearRewindPoint(): void;
  saveEmergencySnapshot(state: GameState): void;
  loadEmergencySnapshot(): GameState | null;
  clearEmergencySnapshot(): void;
  ensureCharacterFields(): void;
  ensureGameStateFields(): void;
}

/** Creates a new StateService instance operating on the given GameState. */
export function createStateService(state: GameState): StateService {
  let _snapshot: GameState | undefined;
  let rewindPoint: { gameState: GameState; messages: Message[] } | null = null;
  let emergencySnapshot: GameState | null = null;
  function ensureCharacterFields(): void {
    for (const char of state.party) {
      char.hitDice ??= { current: char.level, max: char.level };
      char.feats ??= [];
      char.featSelections ??= [];
      char.featChoices ??= {};
      char.pendingFeatChoice ??= false;
      if (char.class) char.class = char.class.toLowerCase();
      if (char.race) char.race = char.race.toLowerCase();
      char.resources ??= [];
      char.knownSpells ??= [];
      char.preparedSpells ??= [];
      char.racialTraits ??= [];
      char.unlockedSubclassFeatures ??= [];
      char.pendingSubclassFeature ??= false;
      if (!char.conditionsImmunities && (char.racialTraits || []).includes('fey-ancestry')) {
        char.conditionsImmunities = ['unconscious'];
      }
    }
  }

  function ensureLocalGameStateFields(): void {
    ensureGameStateFields(state);
  }

  return {
    loadState(savedState: GameState) {
      Object.assign(state, savedState);
      if (!state.party) state.party = [];
      if (!state.quests) state.quests = [];
      if (!state.lore) state.lore = [];
      if (!state.sessionLogs) state.sessionLogs = [];
      if (!state.worldDescription) state.worldDescription = "You gather at The Rusty Tankard...";
      if (!state.actionQueue) state.actionQueue = [];
      if (!state.locationImages) state.locationImages = {};
      state.lastSuggestions = undefined;
      ensureCharacterFields();
      ensureLocalGameStateFields();
      state.startingLocation ??= undefined;
    },

    reset() {
      const fresh: GameState = {
        party: [],
        worldDescription: "You gather at The Rusty Tankard...",
        sessionLogs: [],
        quests: [],
        lore: [],
        currentAtmosphereUrl: undefined as string | undefined,
        actionQueue: [],
        startingLocation: undefined,
        locationImages: {}
      };
      Object.assign(state, fresh);
      delete (state as { combat?: unknown }).combat;
      rewindPoint = null;
      emergencySnapshot = null;
      ensureLocalGameStateFields();
    },

    getFullState(): GameState { return { ...state }; },

    beginTransaction(): void {
      _snapshot = JSON.parse(JSON.stringify(state));
    },

    rollbackTransaction(): void {
      if (_snapshot) {
        Object.assign(state, JSON.parse(JSON.stringify(_snapshot)));
        _snapshot = undefined;
      }
    },

    commitTransaction(): void {
      _snapshot = undefined;
    },

    captureRewindSnapshot(): GameState | undefined {
      return _snapshot ? JSON.parse(JSON.stringify(_snapshot)) : undefined;
    },

    restoreSnapshot(snapshot: GameState): void {
      Object.assign(state, JSON.parse(JSON.stringify(snapshot)));
      _snapshot = undefined;
    },

    saveRewindPoint(gameState: GameState, messages: Message[]): void {
      rewindPoint = {
        gameState: JSON.parse(JSON.stringify(gameState)),
        messages: JSON.parse(JSON.stringify(messages))
      };
    },

    loadRewindPoint(): { gameState: GameState; messages: Message[] } | null {
      return rewindPoint ? {
        gameState: JSON.parse(JSON.stringify(rewindPoint.gameState)),
        messages: JSON.parse(JSON.stringify(rewindPoint.messages))
      } : null;
    },

    clearRewindPoint(): void {
      rewindPoint = null;
    },

    saveEmergencySnapshot(s: GameState): void {
      emergencySnapshot = JSON.parse(JSON.stringify(s));
    },

    loadEmergencySnapshot(): GameState | null {
      return emergencySnapshot ? JSON.parse(JSON.stringify(emergencySnapshot)) : null;
    },

    clearEmergencySnapshot(): void {
      emergencySnapshot = null;
    },

    ensureCharacterFields,
    ensureGameStateFields: ensureLocalGameStateFields,
  };
}
