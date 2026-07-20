import { useState, useCallback } from 'react';
import { Campaign, AppStage, GameState, Message } from '../types';
import { storageService } from '../services/storageService';
import { isDebugMode } from '../utils/debug';
import { mcpServer } from '../services/mcpService';

export const useCampaigns = (
    userId: string | undefined,
    setStage: (stage: AppStage) => void,
    setGameState: (state: GameState) => void,
    setMessages: (msgs: Message[]) => void,
    setCurrentCampaignId: (id: string | undefined) => void,
    setCampaignName: (name: string | undefined) => void,
    setIsNewCampaign: (isNew: boolean) => void,
    setMyCharacterId: (id: string | null) => void,
    setViewingCharacterId: (id: string | null) => void,
    setIsLoading: (loading: boolean) => void
) => {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [showCreateModal, setShowCreateModal] = useState(false);

    const loadCampaigns = useCallback(async () => {
        if (!userId) return;
        setIsLoading(true);
        const { campaigns: loaded, error } = await storageService.loadCampaigns(userId);
        if (!error) setCampaigns(loaded ?? []);
        else if (isDebugMode) console.error('Error loading campaigns:', error);
        setIsLoading(false);
    }, [userId, setIsLoading]);

    const handleCreateNewCampaign = () => {
        setShowCreateModal(true);
    };

    const handleConfirmCreateCampaign = (name: string) => {
        const newCampaignId = crypto.randomUUID();
        setCurrentCampaignId(newCampaignId);
        setCampaignName(name);
        setStage(AppStage.CREATION);
        setIsNewCampaign(true);
        mcpServer.reset();
        setGameState(mcpServer.getFullState());
        setMessages([]);
        setShowCreateModal(false);
    };

    const handleStorageAction = async (
        operation: Promise<{ error?: string }>,
        successAction: () => void,
        errorLabel: string,
    ) => {
        const { error } = await operation;
        if (error) alert(`Error ${errorLabel}: ${error}`);
        else successAction();
    };

    const handleRenameCampaign = (campaignId: string, newName: string) =>
        handleStorageAction(
            storageService.renameCampaign(userId, campaignId, newName),
            loadCampaigns,
            'renaming campaign',
        );

    const handleDeleteCampaign = (campaignId: string) =>
        handleStorageAction(
            storageService.deleteCampaign(userId, campaignId),
            loadCampaigns,
            'deleting campaign',
        );

    const handleJoinCampaign = async (campaignId: string, loadGameCallback: (uid: string | undefined, cid: string) => Promise<void>) => {
        if (!campaignId || campaignId.length < 8) {
            alert("Invalid Campaign ID");
            return;
        }
        setCurrentCampaignId(campaignId);
        await loadGameCallback(userId, campaignId);
    };

    return {
        campaigns,
        showCreateModal,
        setShowCreateModal,
        loadCampaigns,
        handleCreateNewCampaign,
        handleConfirmCreateCampaign,
        handleRenameCampaign,
        handleDeleteCampaign,
        handleJoinCampaign
    };
};
