import { GameState, Message } from '../../types';
import { ensureAllCharacterFields } from '../characterUtils';
import { deepClone } from '../../utils/clone';






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
  function ensureLocalGameStateFields(): void {
    ensureGameStateFields(state);
  }

  return {
    loadState(savedState: GameState) {
      // Purge optional fields so a missing key in savedState doesn't leak the
      // prior campaign's value via Object.assign. Keep in sync with types/game.ts:46.
      delete (state as { combat?: unknown }).combat;
      delete (state as { lastDiceRoll?: unknown }).lastDiceRoll;
      delete (state as { _tiredWarningFired?: unknown })._tiredWarningFired;
      delete (state as { lastSuggestions?: unknown }).lastSuggestions;
      delete (state as { lastSuggestionsByCharacter?: unknown }).lastSuggestionsByCharacter;
      delete (state as { ctx?: unknown }).ctx;
      delete (state as { isProcessing?: unknown }).isProcessing;
      delete (state as { processingUser?: unknown }).processingUser;
      delete (state as { battleMap?: unknown }).battleMap;
      Object.assign(state, savedState);
      if (!state.party) state.party = [];
      if (!state.quests) state.quests = [];
      if (!state.lore) state.lore = [];
      if (!state.sessionLogs) state.sessionLogs = [];
      if (!state.worldDescription) state.worldDescription = "You gather at The Rusty Tankard...";
      if (!state.actionQueue) state.actionQueue = [];
      if (!state.locationImages) state.locationImages = {};
      if (!('lastSuggestions' in savedState)) {
        state.lastSuggestions = undefined;
      }
      if (!('lastSuggestionsByCharacter' in savedState)) {
        state.lastSuggestionsByCharacter = undefined;
      }
      ensureAllCharacterFields(state.party);
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
        locationImages: {},
        gameTime: 0,
        lastLongRestTime: -960,
        factionReputations: {},
      };
      Object.assign(state, fresh);
      delete (state as { combat?: unknown }).combat;
      delete (state as { ctx?: unknown }).ctx;
      delete (state as { lastDiceRoll?: unknown }).lastDiceRoll;
      delete (state as { lastSuggestions?: unknown }).lastSuggestions;
      delete (state as { lastSuggestionsByCharacter?: unknown }).lastSuggestionsByCharacter;
      delete (state as { _tiredWarningFired?: unknown })._tiredWarningFired;
      delete (state as { isProcessing?: unknown }).isProcessing;
      delete (state as { processingUser?: unknown }).processingUser;
      delete (state as { battleMap?: unknown }).battleMap;
      rewindPoint = null;
      emergencySnapshot = null;
      ensureLocalGameStateFields();
    },

    getFullState(): GameState { return { ...state }; },

    beginTransaction(): void {
      _snapshot = deepClone(state);
    },

    rollbackTransaction(): void {
      if (_snapshot) {
        Object.assign(state, deepClone(_snapshot));
        _snapshot = undefined;
      }
    },

    commitTransaction(): void {
      _snapshot = undefined;
    },

    captureRewindSnapshot(): GameState | undefined {
      return _snapshot ? deepClone(_snapshot) : undefined;
    },

    restoreSnapshot(snapshot: GameState): void {
      Object.assign(state, deepClone(snapshot));
      _snapshot = undefined;
    },

    saveRewindPoint(gameState: GameState, messages: Message[]): void {
      rewindPoint = {
        gameState: deepClone(gameState),
        messages: deepClone(messages)
      };
    },

    loadRewindPoint(): { gameState: GameState; messages: Message[] } | null {
      return rewindPoint ? {
        gameState: deepClone(rewindPoint.gameState),
        messages: deepClone(rewindPoint.messages)
      } : null;
    },

    clearRewindPoint(): void {
      rewindPoint = null;
    },

    saveEmergencySnapshot(s: GameState): void {
      emergencySnapshot = deepClone(s);
    },

    loadEmergencySnapshot(): GameState | null {
      return emergencySnapshot ? deepClone(emergencySnapshot) : null;
    },

    clearEmergencySnapshot(): void {
      emergencySnapshot = null;
    },

    ensureCharacterFields: () => ensureAllCharacterFields(state.party),
    ensureGameStateFields: ensureLocalGameStateFields,
  };
}
