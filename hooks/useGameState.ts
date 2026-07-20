import { useState, useCallback, useEffect, useRef } from 'react';
import { GameState, Message, MessageRole, AppStage, SavedGameData, Character, Currency, InventoryItem } from '../types';
import { mcpServer } from '../services/mcpService';
import { storageService } from '../services/storageService';
import { generateAtmosphere } from '../services/llm';
import { AppSettings } from '../types';
import { isDebugMode } from '../utils/debug';
import { getRewindGeneration } from '../services/rewindGeneration';

/** Central state management hook for the game: stage, gameState, messages, campaign metadata, sync, and atmosphere updates. */
export const useGameState = (userId: string | undefined) => {
    const [stage, setStage] = useState<AppStage>(AppStage.AUTH);
    const [gameState, setGameState] = useState<GameState>(mcpServer.getFullState());
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const [currentCampaignId, setCurrentCampaignId] = useState<string>();
    const [campaignName, setCampaignName] = useState<string>();
    const [isNewCampaign, setIsNewCampaign] = useState(false);

    const [myCharacterId, setMyCharacterId] = useState<string | null>(null);
    const [viewingCharacterId, setViewingCharacterId] = useState<string | null>(null);

    const isProcessingRef = useRef(false);

    const syncState = useCallback(() => {
        setGameState(mcpServer.getFullState());
    }, []);

    const isSyncableCampaign = (id?: string) => id != null && id !== 'anonymous';

    const syncCampaignState = useCallback(async () => {
        if (isSyncableCampaign(currentCampaignId)) {
            await storageService.syncCampaignState(currentCampaignId, mcpServer.getFullState());
        }
    }, [currentCampaignId]);

    const loadGameData = async (uid?: string, campaignId?: string) => {
        setIsLoading(true);
        try {
            const { data, error } = await storageService.loadGame(uid, campaignId);

            if (error) {
                alert("Failed to load game: " + error);
                return;
            }

            if (data) {
                setCampaignName(data.campaignName);
                setMessages(data.messages);

                const safeState = data.gameState ?? mcpServer.getFullState();
                mcpServer.loadState(safeState);
                setGameState(mcpServer.getFullState());

                const enrichedState = mcpServer.getFullState();
                const lastUserIdx = data.messages.map(m => m.id).lastIndexOf(
                    data.messages.filter(m => m.role === MessageRole.USER).pop()?.id ?? ''
                );
                if (lastUserIdx >= 0) {
                    mcpServer.saveRewindPoint(enrichedState, data.messages.slice(0, lastUserIdx + 1));
                }

                if (uid) {
                    const myChar = enrichedState.party.find(c => c.ownerId === uid) || enrichedState.party[0];
                    if (myChar) {
                        setMyCharacterId(myChar.id);
                        setViewingCharacterId(myChar.id);
                    }
                }
                setStage(data.stage);
            }
        } catch (e) {
            console.error('[loadGameData] Error:', e);
        } finally {
            setIsLoading(false);
        }
    };

    const saveGameData = useCallback(() => {
        if (!currentCampaignId) return;
        const gameData: SavedGameData = {
            version: '1.0',
            campaignId: currentCampaignId,
            campaignName,
            gameState: mcpServer.getFullState(),
            messages,
            stage,
            timestamp: Date.now()
        };
        storageService.saveGame(gameData, userId, currentCampaignId).catch(e => console.warn('[Save] failed:', e));
    }, [messages, stage, userId, currentCampaignId, campaignName]);

    const resetGame = useCallback(async () => {
        mcpServer.reset();
        const cleanState = mcpServer.getFullState();

        if (userId && currentCampaignId) {
            const emptyGameData: SavedGameData = {
                version: '1.0',
                campaignId: currentCampaignId,
                gameState: cleanState,
                messages: [],
                stage: AppStage.CREATION,
                timestamp: Date.now()
            };
            await storageService.saveGame(emptyGameData, userId, currentCampaignId);
        } else if (!userId) {
            storageService.clearLocalSave();
        }

        setIsNewCampaign(true);
        setStage(AppStage.CREATION);
        setMessages([]);
        setGameState(cleanState);
    }, [userId, currentCampaignId]);

    useEffect(() => {
        if (currentCampaignId && stage === AppStage.PLAY && currentCampaignId !== 'anonymous') {
            if (isDebugMode) console.log('[DEBUG useGameState] subscribing to campaign', currentCampaignId);
            const unsubscribe = storageService.subscribeToCampaign(currentCampaignId, (newData) => {
                const remoteState = newData.game_state;
                const remoteMessages = newData.messages;

                if (remoteState?.party) {
                    // Reject stale realtime updates written before the most recent rewind.
                    // Each syncCampaignState tags the payload with the current rewind generation;
                    // handleRewind bumps that generation. If a stale write lands during or after
                    // a rewind, its generation will be older than the local counter and must be
                    // discarded to avoid clobbering the restored state.
                    const remoteGen = (remoteState as any)?._rewindGeneration ?? 0;
                    const localGen = getRewindGeneration();
                    if (remoteGen < localGen) {
                        if (isDebugMode) console.log('[DEBUG useGameState] rejecting stale realtime update', { remoteGen, localGen });
                        return;
                    }
                    const isProcessing = remoteState.isProcessing === true;
                    if (isDebugMode) console.log('[DEBUG useGameState] realtime update', { isProcessingRef: isProcessingRef.current, remote_isProcessing: isProcessing });
                    if (isProcessingRef.current && !isProcessing) {
                        if (isDebugMode) console.log('[DEBUG useGameState] clearing isProcessingRef (unlock signal received)');
                        isProcessingRef.current = false;
                    }
                    if (!isProcessingRef.current) {
                        if (isDebugMode) console.log('[DEBUG useGameState] applying remote state, isProcessing:', isProcessing);
                        mcpServer.loadState(remoteState);
                        setGameState(mcpServer.getFullState());
                        isProcessingRef.current = isProcessing;
                    } else {
                        if (isDebugMode) console.log('[DEBUG useGameState] SKIPPING remote state (isProcessingRef still true)');
                    }
                }
                if (remoteMessages) {
                    setMessages(remoteMessages);
                }
            });

            return () => { if (isDebugMode) console.log('[DEBUG useGameState] unsubscribing'); unsubscribe(); };
        }
    }, [currentCampaignId, stage]);

    const handleUpdateInventory = (newInventory: InventoryItem[]) => {
        mcpServer.updateInventoryDirectly(newInventory);
        syncState();
        syncCampaignState().catch(e => console.warn('[Sync] failed:', e));
    };

    const handleUpdateCurrency = (newCurrency: Currency) => {
        mcpServer.updateCurrencyDirectly(newCurrency);
        syncState();
        syncCampaignState().catch(e => console.warn('[Sync] failed:', e));
    };

    const performAtmosphereUpdate = async (locationName: string, locationDescription: string | undefined, currentSettings: AppSettings): Promise<boolean> => {
        if (!currentSettings.enableAtmosphere) return false;

        const cached = mcpServer.getCachedLocationImage(locationName);
        if (cached) {
            mcpServer.setAtmosphere(cached);
            syncState();
            await syncCampaignState();
            return true;
        }

        const fullPrompt = locationDescription ? `${locationName}: ${locationDescription}` : locationName;
        try {
            const url = await generateAtmosphere(fullPrompt);
            if (!url) return false;
            mcpServer.cacheLocationImage(locationName, url);
            mcpServer.setAtmosphere(url);
            syncState();
            await syncCampaignState();
            return true;
        } catch (err) {
            if (isDebugMode) console.error("Atmosphere update failed:", err);
            return false;
        }
    };

    return {
        stage, setStage,
        gameState, setGameState,
        messages, setMessages,
        isLoading, setIsLoading,
        currentCampaignId, setCurrentCampaignId,
        campaignName, setCampaignName,
        isNewCampaign, setIsNewCampaign,
        myCharacterId, setMyCharacterId,
        viewingCharacterId, setViewingCharacterId,
        loadGameData,
        saveGameData,
        resetGame,
        syncState,
        handleUpdateInventory,
        handleUpdateCurrency,
        performAtmosphereUpdate
    };
};
