import type { Character } from './character';
import type { CombatState } from './combat';
import type { BattleMap } from './grid';

/** Difficulty tiers for quest XP calibration (mirrors combat CR buckets). */
export type QuestDifficulty = 'trivial' | 'easy' | 'medium' | 'hard' | 'deadly';

/** Significance tiers for exploration XP on first location visits. */
export type LocationSignificance = 'minor' | 'major' | 'landmark';

/** A quest or objective tracked by the party. */
export interface Quest {
  id: string;
  title: string;
  description: string;
  status: 'active' | 'completed' | 'failed';
  difficulty?: QuestDifficulty;
  /** Idempotency flag — set true when quest-completion XP has been awarded. */
  xpAwarded?: boolean;
}

/** A lore entry (NPC, Location, History, or Item) discovered by the party. */
export interface LoreEntry {
  id: string;
  category: 'NPC' | 'Location' | 'History' | 'Item';
  title: string;
  content: string;
}

/** Describes a starting location for a new campaign, including its intro hook. */
export interface StartingLocation {
  name: string;
  description: string;
  introHook: string;
  atmosphereUrl?: string;
}

/** A single entry in the level-progression XP table. */
export interface XPTableEntry {
  level: number;
  xpRequired: number;
}

/** Metadata for the LLM context management system (checkpoints, compression, generation tracking). */
export interface ContextMetadata {
  episodeCheckpoints?: string[];
  frozenRawHistory?: string;
  frozenRawTokens?: number;
  frozenMessageCount?: number;
  turnCounter?: number;
  generation?: number;
}

/** The top-level game state, representing the entire world and party. */
export interface GameState {
  party: Character[];
  worldDescription: string;
  sessionLogs: string[];
  quests: Quest[];
  lore: LoreEntry[];
  /** Locations the party has visited (first-visit exploration XP gated on this set). */
  visitedLocations?: string[];
  startingLocation?: StartingLocation;
  locationImages?: Record<string, string>;
  isProcessing?: boolean;
  processingUser?: string;
  currentAtmosphereUrl?: string;
  combat?: CombatState;
  lastDiceRoll?: {
    sides: number;
    count: number;
    modifier: number;
    results: number[];
    total: number;
  };
  ctx?: ContextMetadata;
  gameTime?: number;
  lastLongRestTime?: number;
  _tiredWarningFired?: boolean;
  factionReputations?: Record<string, number>;
  /**
   * DEPRECATED: single shared suggestion list. Kept read-only for back-compat
   * with existing saves — never written by current code. New code writes
   * `lastSuggestionsByCharacter` instead. Consumers should prefer
   * `pickSuggestionsForCharacter(state, characterId)` which falls back to this
   * field when the per-character map is absent.
   */
  lastSuggestions?: string[];
  /**
   * Per-character suggested next actions, keyed by character id. Source of
   * truth for the suggestion tray. Solo play stores a single entry under the
   * lone character's id; multiplayer stores one entry per party member so each
   * player sees class-aware, scoped chips instead of a shared global list.
   * Old saves without this field fall back to `lastSuggestions` via
   * `pickSuggestionsForCharacter`.
   */
  lastSuggestionsByCharacter?: Record<string, string[]>;
  /**
   * VTT battle map state. Present only when the GM has activated the map for
   * the current encounter. Cleared (set to undefined) when combat ends or
   * the GM dismisses the map. Serializes automatically with the rest of
   * GameState — multiplayer sync is free via the existing Supabase path.
   */
  battleMap?: BattleMap;
  /**
   * Tracks the most recent token movement on the VTT battle map (from either
   * drag-and-drop or the move_token tool). Injected into the LLM context as a
   * PLAYER MOVEMENT: line so the AI is aware of player-driven movement without
   * requiring an LLM call. Cleared when combat ends or the map is dismissed.
   */
  lastTokenMove?: {
    tokenId: string;
    from: { x: number; y: number };
    to: { x: number; y: number };
  };
}
