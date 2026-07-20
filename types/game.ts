import type { Character } from './character';
import type { CombatState } from './combat';
import type { QueuedAction } from './common';

/** A quest or objective tracked by the party. */
export interface Quest {
  id: string;
  title: string;
  description: string;
  status: 'active' | 'completed' | 'failed';
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
  startingLocation?: StartingLocation;
  locationImages?: Record<string, string>;
  isProcessing?: boolean;
  processingUser?: string;
  currentAtmosphereUrl?: string;
  actionQueue: QueuedAction[];
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
}
