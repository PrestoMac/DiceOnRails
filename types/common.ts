export enum MessageRole {
  USER = 'user',
  MODEL = 'model',
  SYSTEM = 'system',
  TOOL = 'tool'
}

export enum AppStage {
  CREATION = 'creation',
  PLAY = 'play',
  AUTH = 'auth',
  DASHBOARD = 'dashboard'
}

export interface Campaign {
  id: string;
  name: string;
  createdAt: number;
  lastPlayed: number;
  characterName?: string;
  stage: AppStage;
}

export type LLMProvider = 'openai' | 'openrouter';

export interface AppSettings {
  voiceName: string;
  rate: number;
  pitch: number;
  volume: number;
  autoSpeak: boolean;
  enableAtmosphere: boolean;
  debugMode: boolean;
}

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

export interface QueuedAction {
  id: string;
  playerId: string;
  playerName: string;
  avatarUrl?: string;
  text: string;
  type: 'action' | 'dialogue';
  timestamp: number;
}

export interface SavedGameData {
  version: string;
  campaignId: string;
  campaignName?: string;
  gameState: any;
  messages: Message[];
  stage: AppStage;
  timestamp: number;
}

export interface MCPResponse {
  success: boolean;
  data: any;
  message?: string;
}
