


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


function insertToolCallMessages(
  messages: Message[],
  toolMessages: Message[],
  syntheticModelId: string
): Message[] {
  const result: Message[] = [];
  let i = 0;
  while (i < toolMessages.length) {
    const batch: Message[] = [];
    while (i < toolMessages.length && toolMessages[i].role === MessageRole.TOOL) {
      batch.push(toolMessages[i]);
      i++;
    }
    if (batch.length > 0) {
      const toolCalls: Array<{ id: string; name: string; arguments: string }> = [];
      for (const m of batch) {
        if (m.toolCallId) {
          toolCalls.push({ id: m.toolCallId, name: 'tool_call', arguments: '{}' });
        }
      }
      if (toolCalls.length > 0) {
        result.push({
          id: `${syntheticModelId}-tc-${i}`,
          role: MessageRole.MODEL,
          text: '',
          timestamp: Date.now(),
          toolCalls,
        });
      }
      result.push(...batch);
    }
  }
  return result;
}

import React, { useCallback, useRef, useEffect } from 'react';
import { GameState, Message, MessageRole, AppSettings, Character, AppStage } from '../types';
import { mcpServer } from '../services/mcpService';
import { runAgentLoop, generateNarration, generateNarrationSimple, buildDeterministicNarration } from '../services/llm';
import { storageService } from '../services/storageService';
import { speakText, stopSpeaking } from '../services/audioService';
import { isDebugMode } from '../utils/debug';
import { sanitizeNarration } from '../utils/textSanitize';
import { bumpRewindGeneration } from '../services/rewindGeneration';
import { isSyncableCampaign, ANONYMOUS_CAMPAIGN_ID } from '../utils/campaign';
import {
  cleanSpeak,
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

    // Synchronously rebuilds ctxRef from the current gameState. Order-independent:
    // safe to call before or after loadGameData resolves, because it does not rely
    // on the useEffect above re-firing (refs aren't in dep arrays). Used on campaign
    // switch to prevent LLM context (frozenRawHistory, episodeCheckpoints, etc.)
    // from bleeding between campaigns.
    const resetContextState = () => {
        const gs = gameState as unknown as { ctx?: { episodeCheckpoints?: unknown[]; frozenRawHistory?: string; frozenRawTokens?: number; frozenMessageCount?: number; turnCounter?: number; generation?: number } };
        ctxRef.current = {
            episodeCheckpoints: (gs.ctx?.episodeCheckpoints as string[]) ?? [],
            frozenRawHistory: gs.ctx?.frozenRawHistory ?? '',
            frozenRawTokens: gs.ctx?.frozenRawTokens ?? 0,
            frozenMessageCount: gs.ctx?.frozenMessageCount ?? 0,
            turnCounter: gs.ctx?.turnCounter ?? 0,
            isCompressing: false,
            compressPromise: null,
            generation: (gs.ctx?.generation ?? 0),
        };
        ctxLoadedRef.current = true;
        if (isDebugMode) console.log('[Context Reset] re-hydrated on campaign switch', { checkpoints: ctxRef.current.episodeCheckpoints.length, raw: ctxRef.current.frozenRawTokens });
    };

    const autoSpeak = (text: string) => { if (settings.autoSpeak) { const c = cleanSpeak(text); if (c) speakText(c, settings); } };

    const syncFinished = (msgs: Message[], extras?: Partial<GameState>) => {
        const finalState = syncStateHelper(ctxRef.current, msgs, mcpServer, setGameState, currentCampaignId, campaignName, extras);
        if (currentCampaignId) {
            storageService.syncCampaignState(currentCampaignId, finalState, msgs).catch(e => console.warn('[Sync] failed:', e));
        }
    };

    const runPipeline_ = () => runPipeline(ctxRef.current, FREEZE_INTERVAL, messagesRef.current, ACTIVE_MSG_WINDOW);

    const resolveNarration = async (
        _userText: string, _toolMessages: Message[], inlineNarration: string | undefined,
        _streamingId: string, _isBatch: boolean
    ): Promise<{ narrationText: string; usedStream: boolean }> => {
        return { narrationText: inlineNarration ?? 'The adventure continues...', usedStream: false };
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
            let turnSuggestions: string[] = [];

            if (isClientSideAction) {
                if (isDebugMode) console.log('[handleSendMessage] client-side action, skipping agent loop', { text: text.slice(0, 80) });
            } else if (isTrivial) {
                if (isDebugMode) console.log('[handleSendMessage] trivial input, skipping agent loop', { text: text.slice(0, 80) });
            } else {
                if (isDebugMode) console.log('[handleSendMessage] calling runAgentLoop', { historyLen: historyForAPI.length, contextLen: buildContextString(myCharacterId).length });
                mcpServer.beginTransaction();
                const result = await runAgentLoop(historyForAPI, buildContextString(myCharacterId), ctxPrep.frozen,
                    async (toolName, args, toolResult) => {
                        await dispatchToolRolls(toolName, args, toolResult, onTriggerDiceRoll, currentState, myCharacterId);
                        if (toolName === 'move_to' && settings.enableAtmosphere) performAtmosphereUpdate(args.location_name as string, args.description as string | undefined, settings);
                    }, undefined, { requestEndNarration: true, enableSuggestions: !!settings.enableSuggestions });
                mcpServer.commitTransaction();
                toolMessages = result.toolMessages;
                inlineNarration = result.inlineNarration;
                turnSuggestions = result.suggestions || [];
            }

            const streamingId = `model-${Date.now()}`;
            const placeholderMsg: Message = { id: streamingId, role: MessageRole.MODEL, text: '', timestamp: Date.now() };
            setMessages(prev => [...prev, ...insertToolCallMessages(prev, toolMessages, 'model-synth'), placeholderMsg]);

            const { narrationText, usedStream } = await resolveNarration(text, toolMessages, inlineNarration, streamingId, false);
            if (firstDeltaAt === null && usedStream) firstDeltaAt = Date.now();

            let finalNarration = narrationText;
            if (!inlineNarration) {
                console.warn('[Narration] No inline narration from agent loop. Retrying with generateNarration...', { toolCount: toolMessages.length, inlineNarration });
                try {
                    const retry = await generateNarration(historyForAPI, buildContextString(myCharacterId), ctxPrep.frozen);
                    const cleanRetry = sanitizeNarration(retry.text);
                    if (cleanRetry.length >= 25) {
                        finalNarration = cleanRetry;
                        if (isDebugMode) console.log('[Narration] Retry succeeded', { len: finalNarration.length });
                    } else {
                        console.warn('[Narration] Retry produced empty/short/artifact-only text', { length: retry.text?.length ?? 0, preview: (retry.text ?? '').slice(0, 80) });
                    }
                } catch (err) {
                    console.error('[Narration] Retry failed:', err instanceof Error ? err.message : String(err));
                }
            }
            // Tier-3: minimal-prompt LLM retry at higher temperature. Fires only
            // when both inline narration and the primary retry produced nothing usable.
            if (!inlineNarration && sanitizeNarration(finalNarration).length < 25) {
                try {
                    const simple = await generateNarrationSimple(historyForAPI, buildContextString(myCharacterId), ctxPrep.frozen);
                    const cleanSimple = sanitizeNarration(simple.text);
                    if (cleanSimple.length >= 25) {
                        finalNarration = cleanSimple;
                        if (isDebugMode) console.log('[Narration] Simple retry succeeded', { len: finalNarration.length });
                    } else if (isDebugMode) {
                        console.log('[Narration] Simple retry produced no usable text');
                    }
                } catch (err) {
                    console.error('[Narration] Simple retry failed:', err instanceof Error ? err.message : String(err));
                }
            }
            // Tier-4: zero-LLM deterministic one-liner derived from the turn's tool
            // results. Always truthful (no hallucination), so it beats the generic
            // "The adventure continues..." whenever any tool produced rollData.
            if (!inlineNarration && sanitizeNarration(finalNarration).length < 25) {
                const det = buildDeterministicNarration(toolMessages);
                if (det) {
                    finalNarration = det;
                    if (isDebugMode) console.log('[Narration] Using deterministic fallback', { text: det });
                }
            }

            // Ultimate chokepoint: no LLM-sourced narration reaches the bubble unsanitized,
            // regardless of source (inlineNarration, generateNarration retry, or streaming).
            const safeNarration = sanitizeNarration(finalNarration);
            const modelMsg: Message = { id: streamingId, role: MessageRole.MODEL, text: safeNarration || 'The adventure continues...', timestamp: Date.now() };
            setMessages(prev => prev.map(m => m.id === streamingId ? modelMsg : m));
            processingRef.current = false;

            const messagesToSync = [...currentMessages, userMsg, ...insertToolCallMessages(currentMessages, toolMessages, 'model-synth'), modelMsg];
            syncFinished(messagesToSync, { lastSuggestions: turnSuggestions });
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
            mcpServer.rollbackTransaction();
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
        mcpServer.beginTransaction();
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
            mcpServer.commitTransaction();

            const streamingId = `model-${Date.now()}`;
            const placeholderMsg: Message = { id: streamingId, role: MessageRole.MODEL, text: '', timestamp: Date.now() };
            setMessages(prev => [...prev, ...insertToolCallMessages(prev, result.toolMessages, 'model-synth'), placeholderMsg]);

            const { narrationText, usedStream } = await resolveNarration(batchText, result.toolMessages, result.inlineNarration, streamingId, true);
            if (firstDeltaAt === null && usedStream) firstDeltaAt = Date.now();

            let finalNarration = narrationText;
            if (!result.inlineNarration) {
                console.warn('[Narration] No inline narration from batch agent loop. Retrying with generateNarration...', { toolCount: result.toolMessages.length, inlineNarration: result.inlineNarration });
                try {
                    const retry = await generateNarration(historyForAPI, batchContext, batchCtxPrep.frozen);
                    const cleanRetry = sanitizeNarration(retry.text);
                    if (cleanRetry.length >= 25) {
                        finalNarration = cleanRetry;
                        if (isDebugMode) console.log('[Narration] Batch retry succeeded', { len: finalNarration.length });
                    } else {
                        console.warn('[Narration] Batch retry produced empty/short/artifact-only text', { length: retry.text?.length ?? 0, preview: (retry.text ?? '').slice(0, 80) });
                    }
                } catch (err) {
                    console.error('[Narration] Batch retry failed:', err instanceof Error ? err.message : String(err));
                }
            }
            // Tier-3: minimal-prompt LLM retry.
            if (!result.inlineNarration && sanitizeNarration(finalNarration).length < 25) {
                try {
                    const simple = await generateNarrationSimple(historyForAPI, batchContext, batchCtxPrep.frozen);
                    const cleanSimple = sanitizeNarration(simple.text);
                    if (cleanSimple.length >= 25) {
                        finalNarration = cleanSimple;
                        if (isDebugMode) console.log('[Narration] Batch simple retry succeeded', { len: finalNarration.length });
                    }
                } catch (err) {
                    console.error('[Narration] Batch simple retry failed:', err instanceof Error ? err.message : String(err));
                }
            }
            // Tier-4: deterministic fallback from tool results.
            if (!result.inlineNarration && sanitizeNarration(finalNarration).length < 25) {
                const det = buildDeterministicNarration(result.toolMessages);
                if (det) {
                    finalNarration = det;
                    if (isDebugMode) console.log('[Narration] Batch using deterministic fallback', { text: det });
                }
            }

            // Ultimate chokepoint: no LLM-sourced narration reaches the bubble unsanitized.
            const safeNarration = sanitizeNarration(finalNarration);
            const modelMsg: Message = { id: streamingId, role: MessageRole.MODEL, text: safeNarration || 'The adventure continues...', timestamp: Date.now() };
            setMessages(prev => prev.map(m => m.id === streamingId ? modelMsg : m));
            processingRef.current = false;

            const messagesToSync = [...currentMessages, userMsg, ...insertToolCallMessages(currentMessages, result.toolMessages, 'model-synth'), modelMsg];
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

    // Restores game state, messages, and LLM context to before the most recent
    // user turn. Shared by handleUndo (pure undo) and handleRewind (undo + retry).
    // Returns the original user text so the caller can optionally re-send it, or
    // null when nothing was restored (busy / no last user message).
    const restoreToBeforeLastTurn = useCallback(async (): Promise<string | null> => {
        stopSpeaking();
        onCloseLevelUp?.();
        if (processingRef.current) {
            if (isDebugMode) console.warn('[rewind] already processing, skipping');
            return null;
        }
        // Bump the rewind generation BEFORE restoring. Any in-flight Supabase
        // realtime updates written with an older generation will be rejected by
        // useGameState's subscription handler, preventing them from overwriting
        // the restored state during the retry window.
        bumpRewindGeneration();
        const snapshot = mcpServer.loadRewindPoint();
        if (isDebugMode) console.log('[rewind] snapshot:', !!snapshot, 'processingRef:', processingRef.current);

        if (!snapshot) {
            const emergencySnap = mcpServer.loadEmergencySnapshot();
            const currentMsgs = messagesRef.current;
            const lastUserMsg = [...currentMsgs].reverse().find(m => m.role === MessageRole.USER);
            if (!lastUserMsg) return null;
            const lastUserIdx = currentMsgs.map(m => m.id).lastIndexOf(lastUserMsg.id);
            const restoredMessages = currentMsgs.slice(0, lastUserIdx);
            setMessages(restoredMessages);
            // Sync the ref mirror immediately so a prompt retry captures the rewound
            // list instead of a stale, pre-rewind snapshot.
            messagesRef.current = restoredMessages;
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
            if (isDebugMode) console.log('[rewind] no snapshot, restored to before last message', { text: lastUserMsg.text.slice(0, 80) });
            return lastUserMsg.text;
        }

        const userMessage = snapshot.messages[snapshot.messages.length - 1];
        const originalText = userMessage?.text || '';
        processingRef.current = false; setIsLoading(false);

        mcpServer.restoreSnapshot(snapshot.gameState);
        const restoredState = mcpServer.getFullState();
        mcpServer.loadState(restoredState);
        setMessages(snapshot.messages.slice(0, -1)); setGameState(restoredState);
        // Sync the ref mirror immediately so a prompt retry captures the rewound
        // list instead of a stale, pre-rewind snapshot.
        messagesRef.current = snapshot.messages.slice(0, -1);

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
        if (isDebugMode) console.log('[rewind] restored with snapshot', { text: originalText.slice(0, 80) });
        return originalText || null;
    }, [currentCampaignId, setMessages, setGameState, setIsLoading]);

    // Pure undo: reverts the last turn and stops. No re-send, so quests/lore/loot
    // granted that turn actually disappear instead of being re-applied by a retry.
    const handleUndo = useCallback(async () => {
        await restoreToBeforeLastTurn();
    }, [restoreToBeforeLastTurn]);

    // Retry: reverts the last turn, then immediately re-processes the same input.
    const handleRewind = useCallback(async () => {
        const text = await restoreToBeforeLastTurn();
        if (text) {
            if (isDebugMode) console.log('[handleRewind] retrying', { text: text.slice(0, 80) });
            setTimeout(() => handleSendMessageRef.current(text, true), 100);
        }
    }, [restoreToBeforeLastTurn]);

    return { handleSendMessage, handleExecuteBatch, handleCharacterCreated, handleUndo, handleRewind, resetContextState };
};
