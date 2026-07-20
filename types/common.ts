/** Roles that a chat message can have in the conversation. */
export enum MessageRole {
  USER = 'user',
  MODEL = 'model',
  SYSTEM = 'system',
  TOOL = 'tool'
}

/** The high-level stage of the application lifecycle. */
export enum AppStage {
  CREATION = 'creation',
  PLAY = 'play',
  AUTH = 'auth',
  DASHBOARD = 'dashboard'
}

/** A saved campaign with metadata for listing and resuming. */
export interface Campaign {
  id: string;
  name: string;
  createdAt: number;
  lastPlayed: number;
  characterName?: string;
  stage: AppStage;
}

/** Supported LLM API providers. */
export type LLMProvider = 'openai' | 'openrouter';

/** Application-wide user settings for voice, atmosphere, and debug mode. */
export interface AppSettings {
  voiceName: string;
  rate: number;
  pitch: number;
  volume: number;
  autoSpeak: boolean;
  enableAtmosphere: boolean;
  debugMode: boolean;
}

/** Structured data about a dice roll, used for UI rendering and result display. */
export interface RollData {
  type: 'attack' | 'skill' | 'damage' | 'cast_spell' | 'save' | 'death_save';
  dieFace: string;
  dieRoll: number;
  modifier: number;
  total: number;
  dc?: number;
  success?: boolean;
  label?: string;
  skillRank?: number;
  isCritical?: boolean;
  isFumble?: boolean;
  dieCount?: number;
  results?: number[];
  rerolledIndices?: number[];
  hit?: boolean;
  stat?: string;
}

/** A single message in the chat log. */
export interface Message {
  id: string;
  role: MessageRole;
  text: string;
  senderName?: string;
  timestamp: number;
  isToolCall?: boolean;
  toolCallId?: string;
  rollData?: RollData;
}

/** An action queued by a player, pending execution. */
export interface QueuedAction {
  id: string;
  playerId: string;
  playerName: string;
  avatarUrl?: string;
  text: string;
  type: 'action' | 'dialogue';
  timestamp: number;
}

/** A full snapshot of game state for save/load operations. */
export interface SavedGameData {
  version: string;
  campaignId: string;
  campaignName?: string;
  gameState: Record<string, unknown>;
  messages: Message[];
  stage: AppStage;
  timestamp: number;
}

/** Standard response envelope from the MCP engine. */
export interface MCPResponse {
  success: boolean;
  data: Record<string, unknown>;
  message?: string;
}
