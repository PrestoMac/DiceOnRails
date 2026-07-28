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
  DASHBOARD = 'dashboard',
  /** Decision screen shown before character creation: Quick Start vs Custom Character. */
  START_MODE = 'start_mode',
  /** Quick Start flow: pick a preset character, then a starting ground. */
  QUICK_START = 'quick_start'
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
  /** Opt-in: enable per-turn LLM-driven Suggested Actions (extra API call per turn). */
  enableSuggestions?: boolean;
  /** Enable auto-generation of character portraits via ImageRouter on creation
   *  (and manual regeneration via the BackgroundModal). Mirrors enableAtmosphere. */
  enablePortraits?: boolean;
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
  /** The id of the party member who sent this message (used to look up their
   *  portraitUrl in the chat). Absent for MODEL/SYSTEM/TOOL messages and for
   *  collaborative batch turns (which carry senderName "Party"). */
  characterId?: string;
  timestamp: number;
  isToolCall?: boolean;
  toolCallId?: string;
  rollData?: RollData | RollData[];
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  /** Multiplayer only: when true, the message is held in the chat as a pending
   *  batch entry and has NOT yet been sent to the LLM. `handleProcessBatch`
   *  flips this to false (promoting the message into chat history) when the
   *  batch runs. Filtered out of LLM context. Removable by its owner until
   *  processing starts. */
  pending?: boolean;
  /** Marks the MODEL narration that concludes a collaborative batch turn, so
   *  that handleRewind can route a retry back to handleProcessBatch instead of
   *  the solo handleSendMessage retry path. */
  batchTurn?: boolean;
}

/** A full snapshot of game state for save/load operations. */
export interface SavedGameData {
  version: string;
  campaignId: string;
  campaignName?: string;
  /** The campaign host's user id (from the campaigns row's host_id). Used to gate
   *  GM-only features (e.g. Character.gmNotes). Undefined for anonymous/local saves. */
  hostId?: string;
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
  /** Stable machine-readable failure code; present only on failure responses when applicable. */
  errorCode?: string;
}
