import { createContext, useContext, ReactNode } from 'react';
import { GameState, Message, AppStage, Currency, InventoryItem, Character } from '../types';
import { useGameState } from '../hooks/useGameState';
import { useAuthContext } from './AuthContext';
import { AppSettings } from '../types';

interface GameContextValue {
  stage: AppStage;
  gameState: GameState;
  messages: Message[];
  isLoading: boolean;
  currentCampaignId: string | undefined;
  campaignName: string | undefined;
  /** The campaign host's user id (gates GM-only features). Undefined for anonymous. */
  hostId: string | undefined;
  isNewCampaign: boolean;
  myCharacterId: string | null;
  viewingCharacterId: string | null;
  setStage: (s: AppStage) => void;
  setViewingCharacterId: (id: string | null) => void;
  syncState: () => void;
  loadGameData: (userId?: string, campaignId?: string) => Promise<boolean>;
  saveGameData: () => Promise<void>;
  resetGame: () => void;
  handleUpdateInventory: (items: InventoryItem[], charId?: string) => void;
  handleUpdateCurrency: (currency: Currency, charId?: string) => void;
  handleUpdateCharacterFields: (partial: Partial<Character>, charId?: string) => void;
  performAtmosphereUpdate: (locationName: string, locationDescription: string | undefined, currentSettings: AppSettings) => Promise<boolean>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setIsLoading: (loading: boolean) => void;
  setGameState: (state: GameState) => void;
  setCurrentCampaignId: (id: string | undefined) => void;
  setCampaignName: (name: string | undefined) => void;
  setIsNewCampaign: (n: boolean) => void;
  setMyCharacterId: (id: string | null) => void;
  getSenderName: () => string;
}

const GameContext = createContext<GameContextValue | null>(null);

/** Provides the core game state context (state, messages, loading, sync) to the component tree. */
export function GameProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuthContext();
  const gameState = useGameState(userId);

  const value: GameContextValue = {
    ...gameState,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

/** Returns the game context value. Must be used within a GameProvider. */
export function useGameContext() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGameContext must be used within GameProvider');
  return ctx;
}
