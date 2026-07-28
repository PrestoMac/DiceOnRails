import { useState, useCallback, useEffect, useRef } from 'react';
import { GameState, Message, MessageRole, AppStage, SavedGameData, Currency, InventoryItem, Character } from '../types';
import { mcpServer } from '../services/mcpService';
import { storageService } from '../services/storageService';
import { generateAtmosphere } from '../services/llm';
import { AppSettings } from '../types';
import { isDebugMode } from '../utils/debug';
import { getRewindGeneration } from '../services/rewindGeneration';
import { isSyncableCampaign, ANONYMOUS_CAMPAIGN_ID } from '../utils/campaign';

/** Central state management hook for the game: stage, gameState, messages, campaign metadata, sync, and atmosphere updates. */
export const useGameState = (userId: string | undefined) => {
    const [stage, setStage] = useState<AppStage>(AppStage.AUTH);
    const [gameState, setGameState] = useState<GameState>(mcpServer.getFullState());
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const [currentCampaignId, setCurrentCampaignId] = useState<string>();
    const [campaignName, setCampaignName] = useState<string>();
    const [hostId, setHostId] = useState<string | undefined>();
    const [isNewCampaign, setIsNewCampaign] = useState(false);

    const [myCharacterId, setMyCharacterId] = useState<string | null>(null);
    const [viewingCharacterId, setViewingCharacterId] = useState<string | null>(null);

    const isProcessingRef = useRef(false);
    // Timestamp the local realtime-lock was engaged, for the self-heal watchdog.
    const isProcessingLockedAt = useRef<number | null>(null);

    const syncState = useCallback(() => {
        setGameState(mcpServer.getFullState());
    }, []);

    const syncCampaignState = useCallback(async () => {
        if (currentCampaignId) {
            await storageService.syncCampaignState(currentCampaignId, mcpServer.getFullState());
        }
    }, [currentCampaignId]);

    // Returns true when campaign data was found and loaded, false otherwise (bad ID,
    // storage error, or anonymous-with-no-save). Callers use this to decide whether to
    // proceed (e.g. the join flow bails with an alert when false).
    const loadGameData = async (uid?: string, campaignId?: string): Promise<boolean> => {
        setIsLoading(true);
        try {
            const { data, error } = await storageService.loadGame(uid, campaignId);

            if (error) {
                console.error("Failed to load game: " + error);
                return false;
            }

            if (data) {
                setCampaignName(data.campaignName);
                setHostId(data.hostId);

                // One-time migration: convert any legacy `actionQueue` items
                // (removed queue system) to pending USER messages so player work
                // is never silently dropped on first load. The actionQueue field
                // is then stripped from the loaded state and never re-persisted.
                const migratedMessages: Message[] = [...data.messages];
                const rawState = (data.gameState ?? mcpServer.getFullState()) as Record<string, unknown>;
                const legacyQueue = Array.isArray(rawState.actionQueue) ? rawState.actionQueue : [];
                if (legacyQueue.length > 0) {
                    for (const item of legacyQueue) {
                        const q = item as { id?: string; playerId?: string; playerName?: string; text?: string; type?: string; timestamp?: number };
                        migratedMessages.push({
                            id: `migrated-${q.id ?? crypto.randomUUID()}`,
                            role: MessageRole.USER,
                            text: q.text ?? '',
                            senderName: q.playerName,
                            // playerId held the character id in the legacy queue
                            // (set from userId in useQueue). We can't reliably map
                            // it to a character id post-hoc, so leave characterId
                            // undefined; the avatar falls back to the initial.
                            timestamp: q.timestamp ?? Date.now(),
                            pending: true,
                        });
                    }
                    delete rawState.actionQueue;
                }
                setMessages(migratedMessages);

                const safeState = rawState as GameState;
                // A fresh page load / campaign switch has no turn in flight. Strip any
                // persisted `isProcessing: true` so the UI never boots into a frozen state.
                const cleanState = { ...safeState, isProcessing: false, processingUser: undefined };
                mcpServer.loadState(cleanState);
                setGameState(mcpServer.getFullState());
                isProcessingRef.current = false;
                isProcessingLockedAt.current = null;

                const enrichedState = mcpServer.getFullState();
                const lastUserIdx = migratedMessages.map(m => m.id).lastIndexOf(
                    migratedMessages.filter(m => m.role === MessageRole.USER).pop()?.id ?? ''
                );
                if (lastUserIdx >= 0) {
                    mcpServer.saveRewindPoint(enrichedState, migratedMessages.slice(0, lastUserIdx + 1));
                }

                if (uid) {
                    const myChar = enrichedState.party.find(c => c.ownerId === uid) || enrichedState.party[0];
                    if (myChar) {
                        setMyCharacterId(myChar.id);
                        setViewingCharacterId(myChar.id);
                    }
                }
                setStage(data.stage);
                return true;
            } else if (campaignId === ANONYMOUS_CAMPAIGN_ID) {
                // First-time anonymous user with no local save → start at the Quick Start vs Custom decision.
                setIsNewCampaign(true);
                setStage(AppStage.START_MODE);
                return true;
            }
            return false;
        } catch (e) {
            console.error('[loadGameData] Error:', e);
            return false;
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
                stage: AppStage.START_MODE,
                timestamp: Date.now()
            };
            await storageService.saveGame(emptyGameData, userId, currentCampaignId);
        } else if (!userId) {
            storageService.clearLocalSave();
        }

        setIsNewCampaign(true);
        setStage(AppStage.START_MODE);
        setMessages([]);
        setGameState(cleanState);
    }, [userId, currentCampaignId]);

    useEffect(() => {
        if (isSyncableCampaign(currentCampaignId) && stage === AppStage.PLAY) {
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
                    const remoteGen = (remoteState as unknown as { _rewindGeneration?: number })?._rewindGeneration ?? 0;
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
                        // Only accept remote messages alongside remote state. A heartbeat
                        // echo during an in-flight turn carries a stale messages snapshot
                        // and must not clobber the local placeholder/tool messages.
                        if (remoteMessages) setMessages(remoteMessages);
                        isProcessingRef.current = isProcessing;
                        isProcessingLockedAt.current = isProcessing ? Date.now() : null;
                    } else {
                        if (isDebugMode) console.log('[DEBUG useGameState] SKIPPING remote state (isProcessingRef still true)');
                    }
                }
            });

            // Self-heal watchdog: if the realtime lock stays engaged beyond a sane bound
            // (e.g. the isProcessing:false unlock payload was dropped/rejected), force-clear
            // it so remote updates resume instead of locking the client out until reload.
            const WATCHDOG_MS = 180000;
            const watchdog = setInterval(() => {
                if (isProcessingRef.current && isProcessingLockedAt.current !== null && Date.now() - isProcessingLockedAt.current > WATCHDOG_MS) {
                    if (isDebugMode) console.warn('[DEBUG useGameState] isProcessingRef stuck >' + WATCHDOG_MS + 'ms, force-clearing');
                    isProcessingRef.current = false;
                    isProcessingLockedAt.current = null;
                }
            }, 30000);
            return () => { if (isDebugMode) console.log('[DEBUG useGameState] unsubscribing'); clearInterval(watchdog); unsubscribe(); };
        }
    }, [currentCampaignId, stage]);

    const handleUpdateInventory = (newInventory: InventoryItem[], charId?: string) => {
        mcpServer.updateInventoryDirectly(newInventory, charId);
        syncState();
        syncCampaignState().catch(e => console.warn('[Sync] failed:', e));
    };

    const handleUpdateCurrency = (newCurrency: Currency, charId?: string) => {
        mcpServer.updateCurrencyDirectly(newCurrency, charId);
        syncState();
        syncCampaignState().catch(e => console.warn('[Sync] failed:', e));
    };

    /** Patches arbitrary character fields (e.g. personal/GM notes) on a character
     *  by id and syncs. UI-only path (issue 10). Mirrors the inventory/currency
     *  direct-update handlers. */
    const handleUpdateCharacterFields = (partial: Partial<Character>, charId?: string) => {
        mcpServer.updateCharacterFieldsDirectly(partial, charId);
        syncState();
        syncCampaignState().catch(e => console.warn('[Sync] failed:', e));
    };

    /** Resolves the local player's character name for chat message attribution. */
    const getSenderName = useCallback((): string => {
        if (!myCharacterId || !gameState.party) return "You";
        const char = mcpServer.getTarget(myCharacterId);
        return char?.name ?? "You";
    }, [myCharacterId, gameState.party]);

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
        hostId,
        isNewCampaign, setIsNewCampaign,
        myCharacterId, setMyCharacterId,
        viewingCharacterId, setViewingCharacterId,
        loadGameData,
        saveGameData,
        resetGame,
        syncState,
        handleUpdateInventory,
        handleUpdateCurrency,
        handleUpdateCharacterFields,
        getSenderName,
        performAtmosphereUpdate
    };
};
