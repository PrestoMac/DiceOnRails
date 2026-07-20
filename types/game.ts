import type { Character } from './character';
import type { CombatState } from './combat';
import type { QueuedAction } from './common';

export interface Quest {
  id: string;
  title: string;
  description: string;
  status: 'active' | 'completed' | 'failed';
}

export interface LoreEntry {
  id: string;
  category: 'NPC' | 'Location' | 'History' | 'Item';
  title: string;
  content: string;
}

export interface StartingLocation {
  name: string;
  description: string;
  introHook: string;
  atmosphereUrl?: string;
}

export interface XPTableEntry {
  level: number;
  xpRequired: number;
}

export interface ContextMetadata {
  episodeCheckpoints?: string[];
  frozenRawHistory?: string;
  frozenRawTokens?: number;
  frozenMessageCount?: number;
  turnCounter?: number;
  generation?: number;
}

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
