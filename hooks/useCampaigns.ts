import { useState, useCallback } from 'react';
import { Campaign, AppStage, GameState, Message } from '../types';
import { storageService } from '../services/storageService';
import { isDebugMode } from '../utils/debug';
import { mcpServer } from '../services/mcpService';
import { resetRewindGeneration } from '../services/rewindGeneration';

/** Manages campaign CRUD operations (create, join, rename, delete) and loading the campaign list. */
export const useCampaigns = (
    userId: string | undefined,
    gameState: GameState,
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
        resetRewindGeneration();
        setCurrentCampaignId(newCampaignId);
        setCampaignName(name);
        setStage(AppStage.START_MODE);
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

    const handleJoinCampaign = async (campaignId: string, loadGameCallback: (uid: string | undefined, cid: string) => Promise<boolean>, joinAsNewMember = false) => {
        if (gameState.isProcessing) {
            alert('Please wait for the current turn to finish before switching campaigns.');
            return;
        }
        if (!campaignId || campaignId.length < 8) {
            alert("Invalid Campaign ID");
            return;
        }
        // Reset all campaign-scoped singleton state before loading the new campaign.
        // mcpServer.reset() clears the closure-scoped rewindPoint/emergencySnapshot
        // (stateService) and the engine GameState. resetRewindGeneration() zeroes the
        // module-level counter so the new campaign's realtime updates aren't rejected
        // as stale. Note: this intentionally forfeits cross-session rewind (undoing an
        // action from a prior session of this campaign after switching away and back);
        // the Supabase row remains the canonical save.
        mcpServer.reset();
        resetRewindGeneration();
        setCurrentCampaignId(campaignId);
        const found = await loadGameCallback(userId, campaignId);

        if (joinAsNewMember) {
            // "Join Existing Party" path: the user should create a character to add to
            // the party rather than dropping into an existing campaign as a viewer.
            if (!found) {
                alert('Campaign not found. Check the ID with your party host.');
                return;
            }
            // Re-join guard: if the user already owns a character in this campaign,
            // loadGameData already set stage to PLAY + myCharacterId. Skip the wizard so
            // they don't create a duplicate character.
            const loadedParty = mcpServer.getFullState().party;
            if (userId && loadedParty.some(c => c.ownerId === userId)) {
                return;
            }
            // Route the joiner through START_MODE so they can choose Quick Start
            // (preset hero) or Customize (full wizard). isNewCampaign=false hides
            // the starting-grounds step in both sub-paths (the campaign already
            // has a starting location, chosen by the host). The new character is
            // added via joinParty in handleCharacterCreated.
            setIsNewCampaign(false);
            setStage(AppStage.START_MODE);
        }
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
