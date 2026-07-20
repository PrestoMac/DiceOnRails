import { createContext, useContext, ReactNode } from 'react';
import { GameState, Message, AppStage, Character, Currency, InventoryItem, QueuedAction } from '../types';
import { useGameState } from '../hooks/useGameState';
import { useQueue } from '../hooks/useQueue';
import { useAuthContext } from './AuthContext';
import { AppSettings } from '../types';

interface GameContextValue {
  stage: AppStage;
  gameState: GameState;
  messages: Message[];
  isLoading: boolean;
  currentCampaignId: string | undefined;
  campaignName: string | undefined;
  isNewCampaign: boolean;
  myCharacterId: string | null;
  viewingCharacterId: string | null;
  setStage: (s: AppStage) => void;
  setViewingCharacterId: (id: string | null) => void;
  syncState: () => void;
  loadGameData: (userId?: string, campaignId?: string) => Promise<void>;
  saveGameData: () => Promise<void>;
  resetGame: () => void;
  handleUpdateInventory: (charId: string, items: InventoryItem[]) => void;
  handleUpdateCurrency: (charId: string, currency: Currency) => void;
  performAtmosphereUpdate: (locationName: string, locationDescription: string | undefined, currentSettings: AppSettings) => Promise<boolean>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setIsLoading: (loading: boolean) => void;
  setGameState: (state: GameState) => void;
  setCurrentCampaignId: (id: string | undefined) => void;
  setCampaignName: (name: string | undefined) => void;
  setIsNewCampaign: (n: boolean) => void;
  setMyCharacterId: (id: string | null) => void;
  queueNotification: string | null;
  handleEnqueueAction: (text: string, type: 'action' | 'dialogue') => Promise<void>;
  handleRemoveQueueItem: (itemId: string) => Promise<void>;
  handleUpdateQueueItem: (itemId: string, newText: string) => Promise<void>;
  handleReorderQueue: (newQueue: QueuedAction[]) => Promise<void>;
  getSenderName: () => string;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuthContext();
  const gameState = useGameState(userId);
  const queue = useQueue(
    gameState.gameState,
    gameState.setGameState,
    gameState.currentCampaignId,
    userId,
    gameState.myCharacterId
  );

  const value: GameContextValue = {
    ...gameState,
    ...queue,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGameContext() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGameContext must be used within GameProvider');
  return ctx;
}
