


const STRICT_TRIVIAL: RegExp[] = [
  /^(hi|hey|hello|howdy|yo|greetings|good\s*(morning|evening|day|night))[\s!.?]*$/i,
  /^(bye|goodbye|farewell|see\s*you|cya|later|night)[\s!.?]*$/i,
  /^(thanks|thank\s*you|thx|ty|cheers)[\s!.?]*$/i,
  /^(yes|yeah|yep|yup|no|nope|nah|ok|okay|sure)[\s!.?]*$/i,
  /^(lol|lmao|haha|hehe|rofl)[\s!.?]*$/i,
  /^(shrug|sigh|smile|grin|nod|wave|bow|applaud|cheer|laugh|cry)[\s!.?]*$/i,
  /^(hmm+|uh+h*|um+m*|er+m*|ah+)[\s!.?]*$/i,
];

const ACTION_HINT: RegExp[] = [
  /\b(i|i'll|i\s*will|let'?s|let\s*me|we|we'll|we\s*will|try|attempt|going\s*to|gonna)\b/i,
  /\b(attack|hit|strike|shoot|fire|cast|spell|drink|eat|use|open|close|pick|grab|take|drop|give|pay|buy|sell|loot|steal|search|look|listen|move|go|run|walk|enter|leave|exit|talk|speak|ask|tell|persuade|intimidate|deceive|lie|sneak|hide|climb|jump|swim|push|pull|break|lock|unlock|rest|sleep|camp|heal|save|reload|load|equip|unequip|draw|sheathe)\b/i,
  /\b(sword|dagger|bow|axe|mace|staff|wand|potion|gold|gp|sp|cp|coin|key|door|chest|lever|trap|enemy|goblin|orc|wolf|dragon|orc|bandit)\b/i,
  /\b(roll|check|save|throw)\b/i,
];

const MAX_LEN = 40;

function isTrivialInput(text: string): boolean {
  const t = (text ?? '').trim();
  if (t.length === 0) return true;
  if (t.length > MAX_LEN) return false;
  if (ACTION_HINT.some(re => re.test(t))) return false;
  return STRICT_TRIVIAL.some(re => re.test(t));
}


import React, { useCallback, useRef, useEffect } from 'react';
import { GameState, Message, MessageRole, AppSettings, Character, AppStage } from '../types';
import { mcpServer } from '../services/mcpService';
import { generateTightNarration, runAgentLoop } from '../services/llm';
import { storageService } from '../services/storageService';
import { speakText, stopSpeaking } from '../services/audioService';
import { isDebugMode } from '../utils/debug';
import { bumpRewindGeneration } from '../services/rewindGeneration';
import { isSyncableCampaign, ANONYMOUS_CAMPAIGN_ID } from '../utils/campaign';
import {
  isLazyNarration, buildDeterministicNarration, buildToolSummary, cleanSpeak,
  dispatchToolRolls, DiceRollFn, buildContextString
} from './gameActionHelpers';
import { syncFinishedState as syncStateHelper, prepareContext as prepContext,
  runContextPipeline as runPipeline } from '../services/llm/contextManager';

const FREEZE_INTERVAL = 5;
const ACTIVE_MSG_WINDOW = 20;

/** Core game interaction hook: handles sending messages, batch execution, character creation, and rewind/retry. */
export const useGameActions = (
    gameState: GameState, setGameState: (state: GameState) => void,
    messages: Message[], setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
    currentCampaignId: string | undefined, userId: string | undefined,
    myCharacterId: string | null, settings: AppSettings,
    setIsLoading: (loading: boolean) => void, onCloseLevelUp: () => void, syncState: () => void,
    performAtmosphereUpdate: (loc: string, desc: string | undefined, s: AppSettings) => void,
    setStage: (s: AppStage) => void, setViewingCharacterId: (id: string | null) => void,
    setMyCharacterId: (id: string | null) => void, isNewCampaign: boolean,
    campaignName: string | undefined, setIsNewCampaign: (n: boolean) => void,
    getSenderName: () => string, onTriggerDiceRoll?: DiceRollFn
) => {
    const processingRef = useRef(false);
    const messagesRef = useRef<Message[]>(messages);
    messagesRef.current = messages;
    const ctxRef = useRef({
        episodeCheckpoints: [] as string[], frozenRawHistory: '' as string,
        frozenRawTokens: 0, frozenMessageCount: 0, turnCounter: 0,
        isCompressing: false, compressPromise: null as Promise<void> | null, generation: 0,
    });
    const ctxLoadedRef = useRef(false);

    useEffect(() => {
        if (ctxLoadedRef.current || !gameState) return;
        const gs = gameState as unknown as { ctx?: { episodeCheckpoints?: unknown[]; frozenRawHistory?: string; frozenRawTokens?: number; frozenMessageCount?: number; turnCounter?: number } };
        if (!ctxLoadedRef.current && (gs.ctx?.episodeCheckpoints?.length || gs.ctx?.frozenRawHistory || (gs.ctx?.frozenMessageCount ?? 0) > 0)) {
            const ctx = ctxRef.current;
            ctx.episodeCheckpoints = gs.ctx?.episodeCheckpoints ?? [];
            ctx.frozenRawHistory = gs.ctx?.frozenRawHistory ?? '';
            ctx.frozenRawTokens = gs.ctx?.frozenRawTokens ?? 0;
            ctx.frozenMessageCount = gs.ctx?.frozenMessageCount ?? 0;
            ctx.turnCounter = gs.ctx?.turnCounter ?? 0;
            ctxLoadedRef.current = true;
            if (isDebugMode) console.log('[Context Restore] loaded from persisted gameState', { checkpoints: ctx.episodeCheckpoints.length, raw: ctx.frozenRawTokens });
        }
    }, [gameState]);

    const autoSpeak = (text: string) => { if (settings.autoSpeak) { const c = cleanSpeak(text); if (c) speakText(c, settings); } };

    const syncFinished = (msgs: Message[], extras?: Partial<GameState>) => {
        const finalState = syncStateHelper(ctxRef.current, msgs, mcpServer, setGameState, currentCampaignId, campaignName, extras);
        if (currentCampaignId) {
            storageService.syncCampaignState(currentCampaignId, finalState, msgs).catch(e => console.warn('[Sync] failed:', e));
        }
    };

    const runPipeline_ = () => runPipeline(ctxRef.current, FREEZE_INTERVAL, messagesRef.current, ACTIVE_MSG_WINDOW);

    const resolveNarration = async (
        userText: string, toolMessages: Message[], inlineNarration: string | undefined,
        streamingId: string, isBatch: boolean
    ): Promise<{ narrationText: string; usedStream: boolean }> => {
        let narration = inlineNarration ?? '';
        let usedStream = false;
        if (isLazyNarration(narration)) {
            if (isDebugMode) console.log('[resolveNarration] inline narration was lazy, clearing', { original: narration.slice(0, 100) });
            narration = '';
        }
        if (!narration) {
            usedStream = true;
            const toolSummary = buildToolSummary(toolMessages);
            if (isDebugMode) console.log('[resolveNarration] calling generateTightNarration', { isBatch, toolCount: toolMessages.length });
            narration = await generateTightNarration(userText, toolSummary, isBatch);
            if (isLazyNarration(narration)) {
                if (isDebugMode) console.log('[resolveNarration] tight narration was lazy, using deterministic fallback');
                narration = buildDeterministicNarration(toolSummary);
            }
            setMessages(prev => prev.map(m => m.id === streamingId ? { ...m, text: narration } : m));
        } else {
            if (isDebugMode) console.log('[resolveNarration] using inline narration', { len: narration.length, preview: narration.slice(0, 100) });
        }
        return { narrationText: narration, usedStream };
    };

    const handleSendMessage = async (text: string, isRetry = false) => {
        if (isDebugMode) console.log('[DEBUG handleSendMessage] entered', { text, isRetry });
        const senderName = getSenderName();
        const userMsg: Message = { id: 'user-' + Date.now(), role: MessageRole.USER, text, senderName, timestamp: Date.now() };

        if (!isRetry && (gameState.isProcessing || processingRef.current)) return;
        if (isRetry && processingRef.current) return;

        processingRef.current = true;
        mcpServer.setLastSuggestions([]);
        const currentMessages = messagesRef.current;
        setMessages(prev => [...prev, userMsg]);
        setIsLoading(true);

        if (isSyncableCampaign(currentCampaignId)) {
            const lockedState = { ...mcpServer.getFullState(), isProcessing: true, processingUser: senderName };
            mcpServer.loadState(lockedState); setGameState(lockedState);
            storageService.syncCampaignState(currentCampaignId, lockedState, [...currentMessages, userMsg]).catch(e => console.warn('[Sync] failed:', e));
        }

        const turnStart = Date.now();
        let firstDeltaAt: number | null = null;

        try {
            const currentState = mcpServer.getFullState();
            mcpServer.saveRewindPoint(currentState, [...currentMessages, userMsg]);
            mcpServer.saveEmergencySnapshot(currentState);
            const allMessagesWithUser = [...messagesRef.current, userMsg];
            const ctxPrep = prepContext(ctxRef.current, allMessagesWithUser, buildContextString(myCharacterId));
            const historyForAPI = ctxPrep.activeMessages;
            let toolMessages: Message[] = [];
            const isClientSideAction = text.startsWith('[');
            const isTrivial = isTrivialInput(text);
            let inlineNarration: string | undefined;

            if (isClientSideAction) {
                if (isDebugMode) console.log('[handleSendMessage] client-side action, skipping agent loop', { text: text.slice(0, 80) });
            } else if (isTrivial) {
                if (isDebugMode) console.log('[handleSendMessage] trivial input, skipping agent loop', { text: text.slice(0, 80) });
            } else {
                if (isDebugMode) console.log('[handleSendMessage] calling runAgentLoop', { historyLen: historyForAPI.length, contextLen: buildContextString(myCharacterId).length });
                const result = await runAgentLoop(historyForAPI, buildContextString(myCharacterId), ctxPrep.frozen,
                    async (toolName, args, toolResult) => {
                        await dispatchToolRolls(toolName, args, toolResult, onTriggerDiceRoll, currentState, myCharacterId);
                        if (toolName === 'move_to' && settings.enableAtmosphere) performAtmosphereUpdate(args.location_name as string, args.description as string | undefined, settings);
                    }, undefined, { requestEndNarration: true, enableSuggestions: !!settings.enableSuggestions });
                toolMessages = result.toolMessages;
                inlineNarration = result.inlineNarration;
            }

            const streamingId = `model-${Date.now()}`;
            const placeholderMsg: Message = { id: streamingId, role: MessageRole.MODEL, text: '', timestamp: Date.now() };
            setMessages(prev => [...prev, ...toolMessages, placeholderMsg]);

            const { narrationText, usedStream } = await resolveNarration(text, toolMessages, inlineNarration, streamingId, false);
            if (firstDeltaAt === null && usedStream) firstDeltaAt = Date.now();

            const modelMsg: Message = { id: streamingId, role: MessageRole.MODEL, text: narrationText || 'The adventure continues...', timestamp: Date.now() };
            setMessages(prev => prev.map(m => m.id === streamingId ? modelMsg : m));
            processingRef.current = false;

            const messagesToSync = [...currentMessages, userMsg, ...toolMessages, modelMsg];
            syncFinished(messagesToSync);
            autoSpeak(modelMsg.text);
            messagesRef.current = messagesToSync;
            runPipeline_();

            if (isDebugMode) {
                const total = Date.now() - turnStart;
                const ttft = firstDeltaAt !== null ? firstDeltaAt - turnStart : -1;
                console.log(`[Turn] total=${total}ms ttft=${ttft}ms stream=${usedStream} inline=${!!inlineNarration} tools=${toolMessages.length}`);
            }
        } catch (err) {
            if (isDebugMode) console.error("[DEBUG handleSendMessage] Critical failure:", err);
            processingRef.current = false;
            if (isSyncableCampaign(currentCampaignId)) {
                const finalState = { ...mcpServer.getFullState(), isProcessing: false, processingUser: undefined };
                mcpServer.loadState(finalState); setGameState(finalState);
                storageService.syncCampaignState(currentCampaignId, finalState).catch(e => console.warn('[Sync] failed:', e));
            }
        } finally {
            setIsLoading(false); syncState();
        }
    };

    const handleExecuteBatch = async () => {
        if (!gameState.actionQueue || gameState.actionQueue.length === 0) return;
        if (gameState.isProcessing || processingRef.current) return;

        processingRef.current = true;
        setIsLoading(true);
        const currentMessages = messagesRef.current;
        const lockedState = { ...gameState, isProcessing: true, processingUser: "Party" };
        setGameState(lockedState); mcpServer.loadState(lockedState);
        if (isSyncableCampaign(currentCampaignId)) storageService.syncCampaignState(currentCampaignId, lockedState).catch(e => console.warn('[Sync] failed:', e));

        const batchText = "[Collaborative Turn]\n" + gameState.actionQueue.map(item => `[${item.playerName}]: ${item.type === 'dialogue' ? `"${item.text}"` : item.text}`).join("\n");
        const turnStart = Date.now();
        let firstDeltaAt: number | null = null;

        try {
            const userMsg: Message = { id: 'batch-' + Date.now(), role: MessageRole.USER, text: batchText, senderName: "Party", timestamp: Date.now() };
            setMessages(prev => [...prev, userMsg]);
            mcpServer.saveRewindPoint(mcpServer.getFullState(), [...currentMessages, userMsg]);
            mcpServer.saveEmergencySnapshot(mcpServer.getFullState());

            const partyContext = JSON.stringify(mcpServer.getFullState().party);
            const worldData = JSON.stringify(mcpServer.getResource('campaign://world/current_location'));
            const batchContext = `YOU ARE NARRATING FOR A FULL PARTY. Process ALL actions in the user message. \n\nFULL PARTY STATE: ${partyContext}. \n\nWorld: ${worldData}.`;

            const batchAllMessages = [...currentMessages, userMsg];
            const batchCtxPrep = prepContext(ctxRef.current, batchAllMessages, batchContext);
            const historyForAPI = batchCtxPrep.activeMessages;
            if (isDebugMode) console.log('[handleExecuteBatch] calling runAgentLoop', { historyLen: historyForAPI.length, queueSize: gameState.actionQueue?.length });
            const result = await runAgentLoop(historyForAPI, batchContext, batchCtxPrep.frozen, undefined, undefined, { requestEndNarration: true });

            const streamingId = `model-${Date.now()}`;
            const placeholderMsg: Message = { id: streamingId, role: MessageRole.MODEL, text: '', timestamp: Date.now() };
            setMessages(prev => [...prev, ...result.toolMessages, placeholderMsg]);

            const { narrationText, usedStream } = await resolveNarration(batchText, result.toolMessages, result.inlineNarration, streamingId, true);
            if (firstDeltaAt === null && usedStream) firstDeltaAt = Date.now();

            const modelMsg: Message = { id: streamingId, role: MessageRole.MODEL, text: narrationText || 'The adventure continues...', timestamp: Date.now() };
            setMessages(prev => prev.map(m => m.id === streamingId ? modelMsg : m));
            processingRef.current = false;

            const messagesToSync = [...currentMessages, userMsg, ...result.toolMessages, modelMsg];
            syncFinished(messagesToSync, { actionQueue: [] });
            autoSpeak(modelMsg.text);
            messagesRef.current = messagesToSync;
            runPipeline_();

            if (isDebugMode) {
                const total = Date.now() - turnStart;
                const ttft = firstDeltaAt !== null ? firstDeltaAt - turnStart : -1;
                console.log(`[Batch] total=${total}ms ttft=${ttft}ms tools=${result.toolMessages.length}`);
            }
        } catch (err) {
            if (isDebugMode) console.error("Batch failure:", err);
            mcpServer.rollbackTransaction();
            processingRef.current = false;
            const finalState = { ...gameState, isProcessing: false };
            setGameState(finalState);
            if (isSyncableCampaign(currentCampaignId)) storageService.syncCampaignState(currentCampaignId, finalState).catch(e => console.warn('[Sync] failed:', e));
        } finally {
            setIsLoading(false);
        }
    };

    const handleCharacterCreated = async (character: Character) => {
        if (userId) character.ownerId = userId;
        setMyCharacterId(character.id); setViewingCharacterId(character.id);
        const startingLoc = mcpServer.getFullState().startingLocation;
        if (startingLoc) character.location = startingLoc.name;
        mcpServer.joinParty(character); syncState(); setStage(AppStage.PLAY);

        const locName = startingLoc?.name || 'the Rusty Tankard Tavern';
        const desc = startingLoc?.description || 'The air is thick with smoke and the smell of roasted meats.';
        const hook = startingLoc?.introHook || 'A hooded figure at the corner table catches your eye as you settle into a chair.';
        const introMsg: Message = { id: 'welcome-' + Date.now(), role: MessageRole.MODEL, text: `Greetings, ${character.name}. Your journey begins in ${locName}. ${desc} ${hook} What do you do?`, timestamp: Date.now() };
        setMessages([introMsg]);

        if (userId && isSyncableCampaign(currentCampaignId)) {
            const fullState = mcpServer.getFullState();
            if (isNewCampaign) {
                await storageService.createCampaign(userId, campaignName || "New Campaign", fullState, currentCampaignId);
                await storageService.syncCampaignState(currentCampaignId, fullState, [introMsg]);
                setIsNewCampaign(false);
            } else {
                await storageService.syncCampaignState(currentCampaignId, fullState, messages);
            }
        } else if (currentCampaignId === ANONYMOUS_CAMPAIGN_ID) {
            // Persist the freshly created character + intro for anonymous players
            await storageService.syncCampaignState(currentCampaignId, mcpServer.getFullState(), [introMsg]);
            setIsNewCampaign(false);
        }
        if (settings.enableAtmosphere && startingLoc) performAtmosphereUpdate(startingLoc.name, startingLoc.description, settings);
        autoSpeak(introMsg.text);
    };

    const handleSendMessageRef = useRef(handleSendMessage);
    handleSendMessageRef.current = handleSendMessage;

    const handleRewind = useCallback(async () => {
        stopSpeaking();
        onCloseLevelUp?.();
        if (processingRef.current) {
            if (isDebugMode) console.warn('[handleRewind] already processing, skipping');
            return;
        }
        // Bump the rewind generation BEFORE restoring. Any in-flight Supabase
        // realtime updates written with an older generation will be rejected by
        // useGameState's subscription handler, preventing them from overwriting
        // the restored state during the retry window.
        bumpRewindGeneration();
        const snapshot = mcpServer.loadRewindPoint();
        if (isDebugMode) console.log('[handleRewind] snapshot:', !!snapshot, 'processingRef:', processingRef.current);

        if (!snapshot) {
            const emergencySnap = mcpServer.loadEmergencySnapshot();
            const currentMsgs = messagesRef.current;
            const lastUserMsg = [...currentMsgs].reverse().find(m => m.role === MessageRole.USER);
            if (!lastUserMsg) return;
            const lastUserIdx = currentMsgs.map(m => m.id).lastIndexOf(lastUserMsg.id);
            const restoredMessages = currentMsgs.slice(0, lastUserIdx);
            setMessages(restoredMessages);
            processingRef.current = false; setIsLoading(false);

            if (emergencySnap) {
                mcpServer.restoreSnapshot(emergencySnap);
            }
            const gs = mcpServer.getFullState() as unknown as { ctx?: { episodeCheckpoints?: unknown[]; frozenRawHistory?: string; frozenRawTokens?: number; frozenMessageCount?: number; turnCounter?: number } };
            ctxRef.current = {
                episodeCheckpoints: gs.ctx?.episodeCheckpoints ?? [],
                frozenRawHistory: gs.ctx?.frozenRawHistory ?? '',
                frozenRawTokens: gs.ctx?.frozenRawTokens ?? 0,
                frozenMessageCount: gs.ctx?.frozenMessageCount ?? 0,
                turnCounter: gs.ctx?.turnCounter ?? 0,
                isCompressing: false,
                compressPromise: null,
                generation: (gs.ctx?.generation ?? 0) + 1,
            };

            if (isSyncableCampaign(currentCampaignId)) {
                const cleanState = { ...mcpServer.getFullState(), isProcessing: false, processingUser: undefined };
                mcpServer.loadState(cleanState); setGameState(cleanState);
                await storageService.syncCampaignState(currentCampaignId, cleanState, restoredMessages);
            } else if (currentCampaignId === ANONYMOUS_CAMPAIGN_ID) {
                // Persist the rewound state locally so a refresh doesn't undo the rewind
                await storageService.syncCampaignState(currentCampaignId, mcpServer.getFullState(), restoredMessages);
            }
            setViewingCharacterId(myCharacterId);
            mcpServer.clearRewindPoint();
            mcpServer.clearEmergencySnapshot();
            if (isDebugMode) console.log('[handleRewind] no snapshot, retrying last message', { text: lastUserMsg.text.slice(0, 80) });
            setTimeout(() => handleSendMessageRef.current(lastUserMsg.text, true), 100);
            return;
        }

        const userMessage = snapshot.messages[snapshot.messages.length - 1];
        const originalText = userMessage?.text || '';
        processingRef.current = false; setIsLoading(false);

        mcpServer.restoreSnapshot(snapshot.gameState);
        const restoredState = mcpServer.getFullState();
        mcpServer.loadState(restoredState);
        setMessages(snapshot.messages.slice(0, -1)); setGameState(restoredState);

        const gs = restoredState as unknown as { ctx?: { episodeCheckpoints?: unknown[]; frozenRawHistory?: string; frozenRawTokens?: number; frozenMessageCount?: number; turnCounter?: number } };
        ctxRef.current = {
            episodeCheckpoints: gs.ctx?.episodeCheckpoints ?? [],
            frozenRawHistory: gs.ctx?.frozenRawHistory ?? '',
            frozenRawTokens: gs.ctx?.frozenRawTokens ?? 0,
            frozenMessageCount: gs.ctx?.frozenMessageCount ?? 0,
            turnCounter: gs.ctx?.turnCounter ?? 0,
            isCompressing: false,
            compressPromise: null,
            generation: (gs.ctx?.generation ?? 0) + 1,
        };

        if (isSyncableCampaign(currentCampaignId)) {
            const cleanState = { ...mcpServer.getFullState(), isProcessing: false, processingUser: undefined };
            mcpServer.loadState(cleanState); setGameState(cleanState);
            await storageService.syncCampaignState(currentCampaignId, cleanState, snapshot.messages.slice(0, -1));
        } else if (currentCampaignId === ANONYMOUS_CAMPAIGN_ID) {
            await storageService.syncCampaignState(currentCampaignId, mcpServer.getFullState(), snapshot.messages.slice(0, -1));
        }
        setViewingCharacterId(myCharacterId);
        mcpServer.clearRewindPoint();
        if (originalText) {
            if (isDebugMode) console.log('[handleRewind] retrying with snapshot', { text: originalText.slice(0, 80) });
            setTimeout(() => handleSendMessageRef.current(originalText, true), 100);
        }
    }, [currentCampaignId, setMessages, setGameState, setIsLoading]);

    return { handleSendMessage, handleExecuteBatch, handleCharacterCreated, handleRewind };
};
