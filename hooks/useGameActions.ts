


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

/**
 * Hard cap for narration-retry LLM calls. A hung retry (e.g. a gateway that accepts
 * the connection then stalls on the response body) must never pin `isLoading`
 * forever and freeze the chat on "The Fates are deciding...". Resolves to
 * undefined if the call exceeds the budget, letting the deterministic fallback run.
 */
const NARRATION_RETRY_TIMEOUT_MS = 45000;
function withNarrationRetryTimeout<T>(p: Promise<T>): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), NARRATION_RETRY_TIMEOUT_MS); });
  return Promise.race([p.then(v => v, () => undefined), timeout]).finally(() => { if (timer) clearTimeout(timer); });
}


function insertToolCallMessages(
  messages: Message[],
  toolMessages: Message[],
  syntheticModelId: string
): Message[] {
  const result: Message[] = [];
  let i = 0;
  while (i < toolMessages.length) {
    // Pass non-TOOL messages (e.g. SYSTEM log messages from narrate_turn's ambient
    // events) straight through. Without this guard, a SYSTEM message would stall the
    // inner while loop indefinitely since i is never incremented for non-TOOL roles,
    // causing an infinite loop that freezes the UI on "The Fates are deciding...".
    if (toolMessages[i].role !== MessageRole.TOOL) {
      result.push(toolMessages[i]);
      i++;
      continue;
    }
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
import { runAgentLoop, generateNarration, generateNarrationSimple, buildDeterministicNarration, generatePortrait } from '../services/llm';
import { storageService } from '../services/storageService';
import { speakText, stopSpeaking } from '../services/audioService';
import { isDebugMode } from '../utils/debug';
import { sanitizeNarration } from '../utils/textSanitize';
import { bumpRewindGeneration } from '../services/rewindGeneration';
import { isSyncableCampaign, ANONYMOUS_CAMPAIGN_ID } from '../utils/campaign';
import {
  cleanSpeak,
  dispatchToolRolls, DiceRollFn, buildContextString, buildBatchContextString
} from './gameActionHelpers';
import { resolveSuggestionsPerCharacter, GENERIC_SUGGESTIONS, buildExplorationSuggestions } from '../services/llm/suggestions';
import { syncFinishedState as syncStateHelper, prepareContext as prepContext,
  runContextPipeline as runPipeline } from '../services/llm/contextManager';
import { buildSessionId } from '../services/llmClient';

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
    // Stable session ID for OpenRouter sticky routing. Derived once per campaign so
    // all LLM calls (agent loop, narration, compression) hit the same provider
    // endpoint, keeping the KV prompt cache warm across turns.
    const sessionId = buildSessionId(currentCampaignId);
    const ctxRef = useRef({
        episodeCheckpoints: [] as string[], frozenRawHistory: '' as string,
        frozenRawTokens: 0, frozenMessageCount: 0, turnCounter: 0,
        isCompressing: false, compressPromise: null as Promise<void> | null, generation: 0,
    });
    const ctxLoadedRef = useRef(false);

    useEffect(() => {
        if (!gameState) return;
        const gs = gameState as unknown as { ctx?: { episodeCheckpoints?: unknown[]; frozenRawHistory?: string; frozenRawTokens?: number; frozenMessageCount?: number; turnCounter?: number; generation?: number } };
        // Initial one-time hydration from persisted state.
        if (!ctxLoadedRef.current && (gs.ctx?.episodeCheckpoints?.length || gs.ctx?.frozenRawHistory || (gs.ctx?.frozenMessageCount ?? 0) > 0)) {
            const ctx = ctxRef.current;
            ctx.episodeCheckpoints = gs.ctx?.episodeCheckpoints ?? [];
            ctx.frozenRawHistory = gs.ctx?.frozenRawHistory ?? '';
            ctx.frozenRawTokens = gs.ctx?.frozenRawTokens ?? 0;
            ctx.frozenMessageCount = gs.ctx?.frozenMessageCount ?? 0;
            ctx.turnCounter = gs.ctx?.turnCounter ?? 0;
            ctx.generation = gs.ctx?.generation ?? 0;
            ctxLoadedRef.current = true;
            if (isDebugMode) console.log('[Context Restore] loaded from persisted gameState', { checkpoints: ctx.episodeCheckpoints.length, raw: ctx.frozenRawTokens });
            return;
        }
        // Cross-client re-hydration (issue 12): when another player processed a
        // turn, they advanced ctx.turnCounter and wrote the updated checkpoints/
        // frozen history to the shared blob. Adopt it so our local LLM context
        // does not diverge. Safe because: (a) we only adopt when the remote
        // turnCounter is STRICTLY greater than ours — never clobbering equal or
        // stale data; (b) during LOCAL processing the realtime handler skips
        // applying remote state, so this path only fires for genuine remote
        // advances; (c) transient fields (isCompressing/compressPromise) are left
        // untouched. Falls back to existing field values when remote omits them.
        if (ctxLoadedRef.current && gs.ctx) {
            const remoteTurn = gs.ctx.turnCounter ?? 0;
            if (remoteTurn > ctxRef.current.turnCounter) {
                const ctx = ctxRef.current;
                ctx.episodeCheckpoints = gs.ctx.episodeCheckpoints ?? ctx.episodeCheckpoints;
                ctx.frozenRawHistory = gs.ctx.frozenRawHistory ?? ctx.frozenRawHistory;
                ctx.frozenRawTokens = gs.ctx.frozenRawTokens ?? ctx.frozenRawTokens;
                ctx.frozenMessageCount = gs.ctx.frozenMessageCount ?? ctx.frozenMessageCount;
                ctx.turnCounter = remoteTurn;
                ctx.generation = gs.ctx.generation ?? ctx.generation;
                if (isDebugMode) console.log('[Context Restore] re-hydrated from remote (cross-client)', { remoteTurn, checkpoints: ctx.episodeCheckpoints.length });
            }
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

    const runPipeline_ = () => runPipeline(ctxRef.current, FREEZE_INTERVAL, messagesRef.current, ACTIVE_MSG_WINDOW, sessionId);

    const resolveNarration = async (
        _userText: string, _toolMessages: Message[], inlineNarration: string | undefined,
        _streamingId: string, _isBatch: boolean
    ): Promise<{ narrationText: string; usedStream: boolean }> => {
        return { narrationText: inlineNarration ?? 'The adventure continues...', usedStream: false };
    };

    const handleSendMessage = async (text: string, isRetry = false) => {
        if (isDebugMode) console.log('[DEBUG handleSendMessage] entered', { text, isRetry });
        const senderName = getSenderName();
        const userMsg: Message = { id: 'user-' + Date.now(), role: MessageRole.USER, text, senderName, characterId: myCharacterId ?? undefined, timestamp: Date.now() };

        // MULTIPLAYER PENDING PATH: when two or more party members are present
        // AND this is a fresh send (not a rewind retry), the message is held in
        // the chat as `pending: true` instead of triggering the LLM. Any player
        // can later flush the pending batch via `handleProcessBatch`. The
        // `isRetry` guard ensures rewind re-sends go straight to the LLM.
        if (!isRetry && (gameState.party?.length ?? 0) > 1) {
            const pendingMsg: Message = { ...userMsg, pending: true };
            const withPending = [...messagesRef.current, pendingMsg];
            setMessages(withPending);
            messagesRef.current = withPending;
            // Clear the local player's suggestion chips immediately — only the
            // player who just typed/clicked loses their chips; everyone else
            // keeps theirs until they act or the batch runs. Snapshots taken on
            // the next batch preserve prior chips for undo.
            const currentState = mcpServer.getFullState();
            if (myCharacterId && currentState.lastSuggestionsByCharacter && currentState.lastSuggestionsByCharacter[myCharacterId]) {
                const updated = { ...currentState.lastSuggestionsByCharacter };
                delete updated[myCharacterId];
                mcpServer.setLastSuggestionsByCharacter(updated);
            }
            syncState();
            if (isSyncableCampaign(currentCampaignId)) {
                storageService.syncCampaignState(currentCampaignId, mcpServer.getFullState(), withPending).catch(e => console.warn('[Sync] pending msg failed:', e));
            } else if (currentCampaignId === ANONYMOUS_CAMPAIGN_ID) {
                storageService.syncCampaignState(currentCampaignId, mcpServer.getFullState(), withPending).catch(e => console.warn('[Sync] pending msg failed:', e));
            }
            return;
        }

        if (!isRetry && (gameState.isProcessing || processingRef.current)) return;
        if (isRetry && processingRef.current) return;

        if (isSyncableCampaign(currentCampaignId)) {
            const remoteProcessing = await storageService.isCampaignProcessing(currentCampaignId);
            if (remoteProcessing) {
                if (isDebugMode) console.log('[handleSendMessage] aborted — remote campaign is processing');
                return;
            }
        }

        processingRef.current = true;
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
            // Capture the rewind point BEFORE clearing suggestions so rewinding a
            // turn restores the previous turn's chips rather than an empty tray.
            mcpServer.saveRewindPoint(currentState, [...currentMessages, userMsg]);
            mcpServer.saveEmergencySnapshot(currentState);
            // Clear the local player's chips so they vanish the moment one is clicked.
            // Must delete from lastSuggestionsByCharacter (the source the UI reads via
            // pickSuggestionsForCharacter); setLastSuggestions([]) alone is a no-op now.
            // Snapshots above still hold the prior chips so undo restores them.
            if (myCharacterId && currentState.lastSuggestionsByCharacter && currentState.lastSuggestionsByCharacter[myCharacterId]) {
                const updated = { ...currentState.lastSuggestionsByCharacter };
                delete updated[myCharacterId];
                mcpServer.setLastSuggestionsByCharacter(updated);
            }
            mcpServer.setLastSuggestions([]);
            syncState();
            const allMessagesWithUser = [...messagesRef.current.filter(m => !m.pending), userMsg];
            const ctxPrep = prepContext(ctxRef.current, allMessagesWithUser, buildContextString(myCharacterId));
            const historyForAPI = ctxPrep.activeMessages;
            let toolMessages: Message[] = [];
            const isClientSideAction = text.startsWith('[');
            const isTrivial = isTrivialInput(text);
            let inlineNarration: string | undefined;
            let rawSuggestions: string[] = [];
            let rawSuggestionsByChar: Record<string, string[]> | undefined;

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
                    }, undefined, { requestEndNarration: true, enableSuggestions: !!settings.enableSuggestions, sessionId });
                mcpServer.commitTransaction();
                toolMessages = result.toolMessages;
                inlineNarration = result.inlineNarration;
                rawSuggestions = result.suggestions || [];
                rawSuggestionsByChar = result.suggestionsByChar;
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
                    const retry = await withNarrationRetryTimeout(generateNarration(historyForAPI, buildContextString(myCharacterId), ctxPrep.frozen, undefined, sessionId));
                    const retryText = retry?.text ?? '';
                    const cleanRetry = sanitizeNarration(retryText);
                    if (cleanRetry.length >= 25) {
                        finalNarration = cleanRetry;
                        if (isDebugMode) console.log('[Narration] Retry succeeded', { len: finalNarration.length });
                    } else {
                        console.warn('[Narration] Retry produced empty/short/artifact-only text or timed out', { length: retryText.length, preview: retryText.slice(0, 80) });
                    }
                } catch (err) {
                    console.error('[Narration] Retry failed:', err instanceof Error ? err.message : String(err));
                }
            }
            // Tier-3: minimal-prompt LLM retry at higher temperature. Fires only
            // when both inline narration and the primary retry produced nothing usable.
            if (!inlineNarration && sanitizeNarration(finalNarration).length < 25) {
                try {
                    const simple = await withNarrationRetryTimeout(generateNarrationSimple(historyForAPI, buildContextString(myCharacterId), ctxPrep.frozen, undefined, sessionId));
                    const simpleText = simple?.text ?? '';
                    const cleanSimple = sanitizeNarration(simpleText);
                    if (cleanSimple.length >= 25) {
                        finalNarration = cleanSimple;
                        if (isDebugMode) console.log('[Narration] Simple retry succeeded', { len: finalNarration.length });
                    } else if (isDebugMode) {
                        console.log('[Narration] Simple retry produced no usable text or timed out');
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
            // Per-character suggestions (multiplayer-aware). Solo collapses to a
            // single-entry record keyed by myCharacterId; multiplayer produces a
            // per-party-member map. The agent loop's flat `rawSuggestions`
            // (legacy narrate_turn.suggestions) seeds Tier 0 for the solo char;
            // multiplayer Tier 0 comes from `result.suggestionsByChar` instead.
            const currentState2 = mcpServer.getFullState();
            const party = currentState2.party || [];
            const isMultiplayer = party.length > 1;
            const turnSuggestionsByChar = isMultiplayer
                ? rawSuggestionsByChar
                : (rawSuggestions.length > 0 && myCharacterId ? { [myCharacterId]: rawSuggestions } : undefined);
            const suggestionsMap = await resolveSuggestionsPerCharacter(
                currentState2, historyForAPI, buildContextString(myCharacterId),
                ctxPrep.frozen, turnSuggestionsByChar, !!settings.enableSuggestions, sessionId,
            );
            processingRef.current = false;

            const messagesToSync = [...currentMessages.filter(m => !m.pending), userMsg, ...insertToolCallMessages(currentMessages, toolMessages, 'model-synth'), modelMsg];
            syncFinished(messagesToSync, { lastSuggestionsByCharacter: suggestionsMap });
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
            // Leave a non-empty suggestion tray even when the turn crashed, so the
            // tray is never blank while the feature is enabled. Writes the
            // per-character map (source of truth) keyed by each alive party
            // member's id so every player sees recovery chips after a crash.
            if (settings.enableSuggestions) {
                const crashState = mcpServer.getFullState();
                const aliveParty = (crashState.party || []).filter(c => c.hp && c.hp.current > 0);
                if (aliveParty.length > 0) {
                    const crashMap: Record<string, string[]> = {};
                    for (const c of aliveParty) {
                        const det = buildExplorationSuggestions(crashState, c.id);
                        crashMap[c.id] = det.length > 0 ? det : [...GENERIC_SUGGESTIONS];
                    }
                    mcpServer.setLastSuggestionsByCharacter(crashMap);
                } else {
                    mcpServer.setLastSuggestions([...GENERIC_SUGGESTIONS]);
                }
            }
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

    const handleProcessBatch = async () => {
        // No-op in solo (every send triggers the LLM immediately) and when no
        // pending messages exist. Also guards against re-entry / remote lock.
        if ((gameState.party?.length ?? 0) <= 1) return;
        const localPending = messagesRef.current.filter(m => m.pending);
        if (localPending.length === 0) return;
        if (gameState.isProcessing || processingRef.current) return;

        if (isSyncableCampaign(currentCampaignId)) {
            const remoteProcessing = await storageService.isCampaignProcessing(currentCampaignId);
            if (remoteProcessing) {
                if (isDebugMode) console.log('[handleProcessBatch] aborted — remote campaign is processing');
                return;
            }
        }

        processingRef.current = true;
        setIsLoading(true);
        const currentMessages = messagesRef.current;

        // Race-window preservation: another player may have added a pending
        // message in the ~50ms between our local snapshot and the lock. Re-fetch
        // the messages column (Supabase only) and merge any unknown pending ids.
        let pendingMsgs = localPending;
        if (isSyncableCampaign(currentCampaignId)) {
            try {
                const remoteMsgs = await storageService.fetchMessages(currentCampaignId);
                if (remoteMsgs) {
                    const localIds = new Set(localPending.map(m => m.id));
                    const extraPending = remoteMsgs.filter(m => m.pending && !localIds.has(m.id));
                    if (extraPending.length > 0) {
                        pendingMsgs = [...localPending, ...extraPending];
                        if (isDebugMode) console.log('[handleProcessBatch] merged extra pending from remote', { count: extraPending.length });
                    }
                }
            } catch {
                // Fetch failed — proceed with local pending only.
            }
        }

        // Build the aggregated batch text the LLM sees. Each pending message
        // already carries its senderName + text (no action/dialogue distinction
        // anymore — the LLM infers intent from the prose). Sent to the LLM as a
        // synthetic USER message in history; NOT inserted as a chat bubble.
        const batchText = "[Collaborative Turn]\n" + pendingMsgs.map(m => `[${m.senderName || 'Player'}]: ${m.text}`).join("\n");
        const syntheticBatchUserMsg: Message = { id: 'batch-' + Date.now(), role: MessageRole.USER, text: batchText, senderName: "Party", timestamp: Date.now() };

        const lockedState = { ...gameState, isProcessing: true, processingUser: "Party" };
        mcpServer.beginTransaction();
        setGameState(lockedState); mcpServer.loadState(lockedState);
        // Promote pending → regular USER messages in the visible chat. They
        // stay attributed to their original sender; only the pending flag flips.
        const promotedIds = new Set(pendingMsgs.map(m => m.id));
        const promotedMessages = currentMessages.map(m => promotedIds.has(m.id) ? { ...m, pending: false } : m);
        setMessages(promotedMessages);
        messagesRef.current = promotedMessages;
        if (isSyncableCampaign(currentCampaignId)) storageService.syncCampaignState(currentCampaignId, lockedState, promotedMessages).catch(e => console.warn('[Sync] failed:', e));
        else if (currentCampaignId === ANONYMOUS_CAMPAIGN_ID) storageService.syncCampaignState(currentCampaignId, lockedState, promotedMessages).catch(e => console.warn('[Sync] failed:', e));

        const turnStart = Date.now();
        let firstDeltaAt: number | null = null;

        try {
            // Rewind point captures the PRE-promotion state so a subsequent
            // undo restores the pending messages (still removable).
            mcpServer.saveRewindPoint(gameState, promotedMessages);
            mcpServer.saveEmergencySnapshot(gameState);
            // Clear the local player's chips immediately (mirrors the solo path).
            if (myCharacterId) {
                const map = mcpServer.getFullState().lastSuggestionsByCharacter;
                if (map && map[myCharacterId]) {
                    const updated = { ...map };
                    delete updated[myCharacterId];
                    mcpServer.setLastSuggestionsByCharacter(updated);
                }
            }
            mcpServer.setLastSuggestions([]);
            syncState();

            const batchContext = buildBatchContextString();
            const batchAllMessages = [...promotedMessages.filter(m => !m.pending), syntheticBatchUserMsg];
            const batchCtxPrep = prepContext(ctxRef.current, batchAllMessages, batchContext);
            const historyForAPI = batchCtxPrep.activeMessages;
            const batchCurrentState = mcpServer.getFullState();
            if (isDebugMode) console.log('[handleProcessBatch] calling runAgentLoop', { historyLen: historyForAPI.length, pendingCount: pendingMsgs.length });
            const result = await runAgentLoop(historyForAPI, batchContext, batchCtxPrep.frozen,
                async (toolName, args, toolResult) => {
                    await dispatchToolRolls(toolName, args, toolResult, onTriggerDiceRoll, batchCurrentState, myCharacterId);
                    if (toolName === 'move_to' && settings.enableAtmosphere) performAtmosphereUpdate(args.location_name as string, args.description as string | undefined, settings);
                }, undefined, { requestEndNarration: true, enableSuggestions: !!settings.enableSuggestions, sessionId });
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
                    const retry = await withNarrationRetryTimeout(generateNarration(historyForAPI, batchContext, batchCtxPrep.frozen, undefined, sessionId));
                    const retryText = retry?.text ?? '';
                    const cleanRetry = sanitizeNarration(retryText);
                    if (cleanRetry.length >= 25) {
                        finalNarration = cleanRetry;
                        if (isDebugMode) console.log('[Narration] Batch retry succeeded', { len: finalNarration.length });
                    } else {
                        console.warn('[Narration] Batch retry produced empty/short/artifact-only text', { length: retryText.length, preview: retryText.slice(0, 80) });
                    }
                } catch (err) {
                    console.error('[Narration] Batch retry failed:', err instanceof Error ? err.message : String(err));
                }
            }
            if (!result.inlineNarration && sanitizeNarration(finalNarration).length < 25) {
                try {
                    const simple = await withNarrationRetryTimeout(generateNarrationSimple(historyForAPI, batchContext, batchCtxPrep.frozen, undefined, sessionId));
                    const simpleText = simple?.text ?? '';
                    const cleanSimple = sanitizeNarration(simpleText);
                    if (cleanSimple.length >= 25) {
                        finalNarration = cleanSimple;
                        if (isDebugMode) console.log('[Narration] Batch simple retry succeeded', { len: finalNarration.length });
                    }
                } catch (err) {
                    console.error('[Narration] Batch simple retry failed:', err instanceof Error ? err.message : String(err));
                }
            }
            if (!result.inlineNarration && sanitizeNarration(finalNarration).length < 25) {
                const det = buildDeterministicNarration(result.toolMessages);
                if (det) {
                    finalNarration = det;
                    if (isDebugMode) console.log('[Narration] Batch using deterministic fallback', { text: det });
                }
            }

            const safeNarration = sanitizeNarration(finalNarration);
            // Tag MODEL narration as batchTurn so handleRewind can route a retry
            // back to handleProcessBatch instead of the solo handleSendMessage path.
            const modelMsg: Message = { id: streamingId, role: MessageRole.MODEL, text: safeNarration || 'The adventure continues...', timestamp: Date.now(), batchTurn: true };
            setMessages(prev => prev.map(m => m.id === streamingId ? modelMsg : m));

            const batchStateForSuggestions = mcpServer.getFullState();
            const suggestionsMap = await resolveSuggestionsPerCharacter(
                batchStateForSuggestions, historyForAPI, batchContext, batchCtxPrep.frozen,
                result.suggestionsByChar, !!settings.enableSuggestions, sessionId,
            );

            const messagesToSync = [...promotedMessages.filter(m => !m.pending), ...insertToolCallMessages(promotedMessages, result.toolMessages, 'model-synth'), modelMsg];

            processingRef.current = false;
            syncFinished(messagesToSync, { lastSuggestionsByCharacter: suggestionsMap });
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
            if (settings.enableSuggestions) {
                const crashState = mcpServer.getFullState();
                const aliveParty = (crashState.party || []).filter(c => c.hp && c.hp.current > 0);
                if (aliveParty.length > 0) {
                    const crashMap: Record<string, string[]> = {};
                    for (const c of aliveParty) {
                        const det = buildExplorationSuggestions(crashState, c.id);
                        crashMap[c.id] = det.length > 0 ? det : [...GENERIC_SUGGESTIONS];
                    }
                    mcpServer.setLastSuggestionsByCharacter(crashMap);
                } else {
                    mcpServer.setLastSuggestions([...GENERIC_SUGGESTIONS]);
                }
            }
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

    /** Multiplayer: removes a pending message owned by the local player. No-op
     *  for non-owners, non-pending messages, or once processing has started. */
    const handleRemovePendingMessage = async (messageId: string) => {
        if (processingRef.current || gameState.isProcessing) return;
        const target = messagesRef.current.find(m => m.id === messageId);
        if (!target || !target.pending || target.characterId !== (myCharacterId ?? undefined)) return;
        const updated = messagesRef.current.filter(m => m.id !== messageId);
        setMessages(updated);
        messagesRef.current = updated;
        if (isSyncableCampaign(currentCampaignId)) {
            storageService.syncCampaignState(currentCampaignId, mcpServer.getFullState(), updated).catch(e => console.warn('[Sync] failed:', e));
        } else if (currentCampaignId === ANONYMOUS_CAMPAIGN_ID) {
            storageService.syncCampaignState(currentCampaignId, mcpServer.getFullState(), updated).catch(e => console.warn('[Sync] failed:', e));
        }
    };

    const handleCharacterCreated = async (character: Character) => {
        if (userId) character.ownerId = userId;
        setMyCharacterId(character.id); setViewingCharacterId(character.id);
        const startingLoc = mcpServer.getFullState().startingLocation;
        // Always align the character's starting location with the campaign's
        // engine starting location. Both the QuickStart preset path and the
        // custom wizard path may leave a fallback location (e.g. "The Rusty
        // Tankard Tavern") baked into the built character; override it here so
        // a freshly-created host or joiner spawns at the actual chosen ground.
        if (startingLoc) character.location = startingLoc.name;
        // Detect "join existing party": the party already has members before joinParty
        // runs (new campaigns always reset to an empty party before the wizard runs).
        const isJoiningParty = mcpServer.getFullState().party.length > 0;
        mcpServer.joinParty(character); syncState(); setStage(AppStage.PLAY);

        let messagesToSync: Message[];
        let spokenText: string | undefined;
        if (isJoiningParty) {
            // Append a brief join notice — preserve the existing campaign chat history
            // rather than replacing it with a fresh intro message.
            const joinMsg: Message = { id: 'join-' + Date.now(), role: MessageRole.SYSTEM, text: `${character.name} has joined the party.`, timestamp: Date.now() };
            messagesToSync = [...messages, joinMsg];
        } else {
            const locName = startingLoc?.name || 'an unknown land';
            const desc = startingLoc?.description || '';
            // Prefer the LLM-generated atmospheric introHook; fall back to the
            // location description (also LLM-generated and thematic) rather than
            // injecting a generic tavern hook that doesn't match the scene.
            const hook = startingLoc?.introHook || startingLoc?.description || '';
            const introMsg: Message = { id: 'welcome-' + Date.now(), role: MessageRole.MODEL, text: `Greetings, ${character.name}. Your journey begins in ${locName}. ${desc}${hook ? ` ${hook}` : ''} What do you do?`, timestamp: Date.now() };
            messagesToSync = [introMsg];
            spokenText = introMsg.text;
        }
        setMessages(messagesToSync);

        if (userId && isSyncableCampaign(currentCampaignId)) {
            const fullState = mcpServer.getFullState();
            if (isNewCampaign) {
                await storageService.createCampaign(userId, campaignName || "New Campaign", fullState, currentCampaignId);
                await storageService.syncCampaignState(currentCampaignId, fullState, messagesToSync);
                setIsNewCampaign(false);
            } else {
                await storageService.syncCampaignState(currentCampaignId, fullState, messagesToSync);
            }
        } else if (currentCampaignId === ANONYMOUS_CAMPAIGN_ID) {
            // Persist the freshly created character + intro for anonymous players
            await storageService.syncCampaignState(currentCampaignId, mcpServer.getFullState(), messagesToSync);
            setIsNewCampaign(false);
        }
        if (settings.enableAtmosphere && startingLoc) performAtmosphereUpdate(startingLoc.name, startingLoc.description, settings);
        // Fire-and-forget portrait generation on creation (mirrors the atmosphere
        // pattern above). Lets the player enter the game instantly; the portrait
        // pops in when the ImageRouter call resolves. Fail-open: no key or a
        // network error leaves portraitUrl empty (placeholder shown). Patched via
        // the same engine mutator + syncState + persist trio used by handleUpdateCharacterFields.
        if (settings.enablePortraits) {
            generatePortrait(character).then(url => {
                if (url) {
                    mcpServer.updateCharacterFieldsDirectly({ portraitUrl: url }, character.id);
                    syncState();
                    storageService.syncCampaignState(currentCampaignId, mcpServer.getFullState(), messagesRef.current).catch(e => console.warn('[Sync] portrait persist failed:', e));
                }
            });
        }
        if (spokenText) autoSpeak(spokenText);
    };

    const handleSendMessageRef = useRef(handleSendMessage);
    handleSendMessageRef.current = handleSendMessage;

    const handleProcessBatchRef = useRef(handleProcessBatch);
    handleProcessBatchRef.current = handleProcessBatch;

    // Restores game state, messages, and LLM context to before the most recent
    // user turn. Shared by handleUndo (pure undo) and handleRewind (undo + retry).
    // Returns a discriminator describing what was restored:
    //   - `{ kind: 'solo', text }` — solo turn; caller re-sends `text` to retry.
    //   - `{ kind: 'batch' }`     — multiplayer batch turn; caller re-runs
    //                              handleProcessBatch to retry (the pending
    //                              messages are restored as `pending: true`).
    //   - `null`                  — nothing to restore (busy / no last turn).
    const restoreToBeforeLastTurn = useCallback(async (): Promise<{ kind: 'solo'; text: string } | { kind: 'batch' } | null> => {
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
            // Detect a batch turn by walking back to the last MODEL message: if
            // it carries `batchTurn`, the user messages preceding it were the
            // promoted batch inputs and should be restored as pending. Otherwise
            // solo — strip forward from the last USER message.
            const lastModelIdx = [...currentMsgs].reverse().findIndex(m => m.role === MessageRole.MODEL);
            const lastModel = lastModelIdx >= 0 ? currentMsgs[currentMsgs.length - 1 - lastModelIdx] : undefined;
            const isBatch = lastModel?.batchTurn === true;

            if (isBatch) {
                // Walk back past the batch MODEL + tool messages to the promoted
                // user messages that preceded them; restore those as pending.
                let cutIdx = currentMsgs.length;
                while (cutIdx > 0 && currentMsgs[cutIdx - 1].role !== MessageRole.USER) cutIdx--;
                // Include the contiguous USER block (the promoted batch inputs).
                while (cutIdx > 0 && currentMsgs[cutIdx - 1].role === MessageRole.USER) cutIdx--;
                const restoredMessages = currentMsgs.slice(0, cutIdx).map(m => m.role === MessageRole.USER ? { ...m, pending: true } : m);
                setMessages(restoredMessages);
                messagesRef.current = restoredMessages;
                processingRef.current = false; setIsLoading(false);

                if (emergencySnap) mcpServer.restoreSnapshot(emergencySnap);
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
                    await storageService.syncCampaignState(currentCampaignId, mcpServer.getFullState(), restoredMessages);
                }
                setViewingCharacterId(myCharacterId);
                mcpServer.clearRewindPoint();
                mcpServer.clearEmergencySnapshot();
                if (isDebugMode) console.log('[rewind] emergency batch restore');
                return { kind: 'batch' };
            }

            const lastUserMsg = [...currentMsgs].reverse().find(m => m.role === MessageRole.USER);
            if (!lastUserMsg) return null;
            const lastUserIdx = currentMsgs.map(m => m.id).lastIndexOf(lastUserMsg.id);
            const restoredMessages = currentMsgs.slice(0, lastUserIdx);
            setMessages(restoredMessages);
            messagesRef.current = restoredMessages;
            processingRef.current = false; setIsLoading(false);

            if (emergencySnap) mcpServer.restoreSnapshot(emergencySnap);
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
                await storageService.syncCampaignState(currentCampaignId, mcpServer.getFullState(), restoredMessages);
            }
            setViewingCharacterId(myCharacterId);
            mcpServer.clearRewindPoint();
            mcpServer.clearEmergencySnapshot();
            if (isDebugMode) console.log('[rewind] no snapshot, restored to before last message', { text: lastUserMsg.text.slice(0, 80) });
            return { kind: 'solo', text: lastUserMsg.text };
        }

        // Detect batch vs solo via the snapshot's trailing message: batch
        // snapshots were saved with the pending messages still pending, so the
        // last message has `pending: true`. Solo snapshots end with the user msg
        // (never pending).
        const lastSnapshotMsg = snapshot.messages[snapshot.messages.length - 1];
        const isBatch = lastSnapshotMsg?.pending === true;
        const userMessage = isBatch ? lastSnapshotMsg : lastSnapshotMsg;
        const originalText = userMessage?.text || '';
        processingRef.current = false; setIsLoading(false);

        mcpServer.restoreSnapshot(snapshot.gameState);
        const restoredState = mcpServer.getFullState();
        mcpServer.loadState(restoredState);

        // Batch: keep all messages (the pending ones are restored as pending,
        // ready for re-edit / re-process). Solo: strip the trailing user msg so
        // the retry can re-add it.
        const restoredMessages = isBatch ? snapshot.messages : snapshot.messages.slice(0, -1);
        setMessages(restoredMessages); setGameState(mcpServer.getFullState());
        messagesRef.current = restoredMessages;

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
            await storageService.syncCampaignState(currentCampaignId, cleanState, restoredMessages);
        } else if (currentCampaignId === ANONYMOUS_CAMPAIGN_ID) {
            await storageService.syncCampaignState(currentCampaignId, mcpServer.getFullState(), restoredMessages);
        }
        setViewingCharacterId(myCharacterId);
        mcpServer.clearRewindPoint();
        if (isDebugMode) console.log('[rewind] restored with snapshot', { isBatch, text: originalText.slice(0, 80) });
        return isBatch ? { kind: 'batch' } : { kind: 'solo', text: originalText };
    }, [currentCampaignId, setMessages, setGameState, setIsLoading]);

    // Pure undo: reverts the last turn and stops. No re-send, so quests/lore/loot
    // granted that turn actually disappear instead of being re-applied by a retry.
    const handleUndo = useCallback(async () => {
        await restoreToBeforeLastTurn();
    }, [restoreToBeforeLastTurn]);

    // Retry: reverts the last turn, then immediately re-processes the same input.
    // Solo: re-sends the user text through handleSendMessage. Batch: re-runs
    // handleProcessBatch which re-promotes the restored pending messages.
    const handleRewind = useCallback(async () => {
        const result = await restoreToBeforeLastTurn();
        if (result?.kind === 'batch') {
            if (isDebugMode) console.log('[handleRewind] retrying batch');
            setTimeout(() => handleProcessBatchRef.current(), 100);
        } else if (result?.kind === 'solo') {
            if (isDebugMode) console.log('[handleRewind] retrying solo', { text: result.text.slice(0, 80) });
            setTimeout(() => handleSendMessageRef.current(result.text, true), 100);
        }
    }, [restoreToBeforeLastTurn]);

    const handleArcaneRecovery = async (characterId: string, selections: Array<{ level: number; count: number }>): Promise<boolean> => {
      if (!characterId || selections.length === 0) return false;
      try {
        const result = await mcpServer.arcane_recovery(characterId, selections);
        if (result.success) {
          syncState();
          const cleanedMsgs = messagesRef.current.filter(m => m.text !== `[System] ${result.message}`);
          storageService.syncCampaignState(currentCampaignId, mcpServer.getFullState(), cleanedMsgs).catch((e: unknown) => console.warn('[Sync] failed:', e));
          return true;
        }
        console.warn('[Arcane Recovery] failed:', result.message);
        return false;
      } catch (err) {
        console.error('[Arcane Recovery] error:', err instanceof Error ? err.message : String(err));
        return false;
      }
    };

    /** UI-direct spellbook management (bypasses the LLM agent loop). Mirrors
     *  handleArcaneRecovery. Used by SpellbookModal for prepared casters. */
    const handleManageSpellbook = async (
      characterId: string,
      action: 'learn' | 'prepare' | 'unprepare' | 'forget' | 'finish_prep',
      spellId: string
    ): Promise<boolean> => {
      if (!characterId || (action !== 'finish_prep' && !spellId)) return false;

      try {
        const result = await mcpServer.manage_spellbook(characterId, action, spellId);
        if (result.success) {
          syncState();
          storageService.syncCampaignState(currentCampaignId, mcpServer.getFullState(), messagesRef.current).catch((e: unknown) => console.warn('[Sync] failed:', e));
          return true;
        }
        console.warn('[Manage Spellbook] failed:', result.message);
        return false;
      } catch (err) {
        console.error('[Manage Spellbook] error:', err instanceof Error ? err.message : String(err));
        return false;
      }
    };

    /** UI-direct known-spell / cantrip swap (bypasses the LLM agent loop).
     *  Handles both Tasha's leveled swap (known casters, pendingSpellSwap)
     *  and 2024 cantrip swap (any caster, cantripSwapAvailable from long_rest). */
    const handleSwapKnownSpell = async (
      characterId: string,
      oldSpellId: string,
      newSpellId: string
    ): Promise<boolean> => {
      if (!characterId || !oldSpellId || !newSpellId) return false;
      try {
        const result = await mcpServer.swap_known_spell(characterId, oldSpellId, newSpellId);
        if (result.success) {
          syncState();
          storageService.syncCampaignState(currentCampaignId, mcpServer.getFullState(), messagesRef.current).catch((e: unknown) => console.warn('[Sync] failed:', e));
          return true;
        }
        console.warn('[Swap Spell] failed:', result.message);
        return false;
      } catch (err) {
        console.error('[Swap Spell] error:', err instanceof Error ? err.message : String(err));
        return false;
      }
    };

    return { handleSendMessage, handleProcessBatch, handleRemovePendingMessage, handleCharacterCreated, handleUndo, handleRewind, resetContextState, handleArcaneRecovery, handleManageSpellbook, handleSwapKnownSpell };
};
