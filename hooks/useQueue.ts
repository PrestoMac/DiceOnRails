import { useState, useEffect, useRef } from 'react';
import { GameState, QueuedAction } from '../types';
import { mcpServer } from '../services/mcpService';
import { storageService } from '../services/storageService';

/** Manages the action queue: enqueue, remove, update, reorder items, and provides the sender name helper. */
export const useQueue = (
    gameState: GameState,
    setGameState: (state: GameState) => void,
    currentCampaignId: string | undefined,
    userId: string | undefined,
    myCharacterId: string | null
) => {
    const [queueNotification, setQueueNotification] = useState<string | null>(null);
    const prevQueueLengthRef = useRef(0);
    const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const currentLength = gameState.actionQueue?.length ?? 0;
        if (currentLength > prevQueueLengthRef.current) {
            const addedCount = currentLength - prevQueueLengthRef.current;
            setQueueNotification(addedCount > 1
                ? `${addedCount} new items added to Action Queue!`
                : "New item added to Action Queue!");

            if (notificationTimerRef.current) {
                clearTimeout(notificationTimerRef.current);
            }
            notificationTimerRef.current = setTimeout(() => {
                setQueueNotification(null);
            }, 3000);
        }
        prevQueueLengthRef.current = currentLength;

        return () => {
            if (notificationTimerRef.current) {
                clearTimeout(notificationTimerRef.current);
            }
        };
    }, [gameState.actionQueue]);

    const getSenderName = () => {
        if (!myCharacterId || !gameState.party) return "You";
        const char = mcpServer.getTarget(myCharacterId);
        return char?.name ?? "You";
    };

    const applyUpdate = async (newState: GameState) => {
        setGameState(newState);
        mcpServer.loadState(newState);
        if (currentCampaignId) {
            await storageService.syncCampaignState(currentCampaignId, newState);
        }
    };

    const handleEnqueueAction = async (text: string, type: 'action' | 'dialogue') => {
        const newItem: QueuedAction = {
            id: crypto.randomUUID(),
            playerId: userId ?? 'anonymous',
            playerName: getSenderName(),
            text,
            type,
            timestamp: Date.now()
        };
        await applyUpdate({ ...gameState, actionQueue: [...(gameState.actionQueue ?? []), newItem] });
    };

    const handleRemoveQueueItem = async (itemId: string) => {
        await applyUpdate({
            ...gameState,
            actionQueue: (gameState.actionQueue ?? []).filter(i => i.id !== itemId)
        });
    };

    const handleUpdateQueueItem = async (itemId: string, newText: string) => {
        await applyUpdate({
            ...gameState,
            actionQueue: (gameState.actionQueue ?? []).map(item =>
                item.id === itemId ? { ...item, text: newText } : item
            )
        });
    };

    const handleReorderQueue = async (newQueue: QueuedAction[]) => {
        await applyUpdate({ ...gameState, actionQueue: newQueue });
    };

    return {
        queueNotification,
        handleEnqueueAction,
        handleRemoveQueueItem,
        handleUpdateQueueItem,
        handleReorderQueue,
        getSenderName
    };
};
