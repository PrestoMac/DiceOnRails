import { createContext, useContext, ReactNode } from 'react';
import { Campaign } from '../types';
import { useCampaigns } from '../hooks/useCampaigns';
import { useAuthContext } from './AuthContext';
import { useGameContext } from './GameContext';

interface CampaignContextValue {
  campaigns: Campaign[];
  showCreateModal: boolean;
  setShowCreateModal: (show: boolean) => void;
  loadCampaigns: () => Promise<void>;
  handleCreateNewCampaign: () => void;
  handleConfirmCreateCampaign: (name: string) => void;
  handleJoinCampaign: (id: string, loadGame: (uid?: string, cid?: string) => Promise<void>) => Promise<void>;
  handleDeleteCampaign: (id: string) => void;
  handleRenameCampaign: (id: string, newName: string) => void;
}

const CampaignContext = createContext<CampaignContextValue | null>(null);

export function CampaignProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuthContext();
  const {
    setStage, setGameState, setMessages, setCurrentCampaignId,
    setCampaignName, setIsNewCampaign, setMyCharacterId,
    setViewingCharacterId, setIsLoading, loadGameData
  } = useGameContext();

  const campaigns = useCampaigns(
    userId,
    setStage, setGameState, setMessages, setCurrentCampaignId,
    setCampaignName, setIsNewCampaign, setMyCharacterId,
    setViewingCharacterId, setIsLoading
  );

  return <CampaignContext.Provider value={campaigns}>{children}</CampaignContext.Provider>;
}

export function useCampaignContext() {
  const ctx = useContext(CampaignContext);
  if (!ctx) throw new Error('useCampaignContext must be used within CampaignProvider');
  return ctx;
}
