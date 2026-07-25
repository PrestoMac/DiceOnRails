


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
 * Actor-bearing tool calls and the argument key that identifies the acting
 * character for each. Used by the batch attribution diagnostic to determine
 * which party member each tool call was attributed to.
 */
const ACTOR_TOOL_KEYS: Record<string, string[]> = {
  player_attack: ['attackerId'],
  cast_spell: ['characterId', 'casterId'],
  check_skill: ['targetId'],
  make_save: ['targetId'],
  roll_death_save: ['targetId'],
  use_resource: ['characterId', 'targetId'],
  update_inventory: ['targetId'],
  adjust_currency: ['targetId'],
  short_rest: ['targetId'],
  long_rest: ['targetId'],
  manage_spellbook: ['characterId', 'targetId'],
  level_up: ['targetId'],
  award_experience: ['targetId'],
};

/**
 * Post-batch diagnostic: warns (console only) if any party member who queued an
 * action never appears as the actor of a tool call during the collaborative
 * turn. Indicates the LLM may have silently dropped or mis-attributed an action.
 * In solo play the queue is empty so this is a no-op. Never throws or blocks.
 */
function warnIfBatchAttributionIncomplete(queue: GameState['actionQueue'], toolMessages: Message[], party: Character[]): void {
  if (!queue || queue.length === 0 || party.length <= 1) return;
  const queuedNames = new Set(queue.map(q => q.playerName).filter(Boolean));
  if (queuedNames.size === 0) return;

  const nameLower = new Map<string, string>();
  for (const c of party) nameLower.set(c.name.toLowerCase(), c.name);

  const seenActors = new Set<string>();
  for (const m of toolMessages) {
    if (!m.toolCalls) continue;
    for (const tc of m.toolCalls) {
      const keys = ACTOR_TOOL_KEYS[tc.name];
      if (!keys) continue;
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.arguments || '{}'); } catch { continue; }
      for (const k of keys) {
        const v = args[k];
        if (typeof v === 'string' && v.trim()) {
          const resolved = nameLower.get(v.toLowerCase()) ?? v;
          seenActors.add(resolved);
        }
      }
    }
  }

  const missing: string[] = [];
  for (const name of queuedNames) {
    if (!seenActors.has(name)) missing.push(name);
  }
  if (missing.length > 0) {
    console.warn(`[Batch Attribution] ${missing.length} queued player(s) had no attributed tool call this turn: ${missing.join(', ')}. The LLM may have dropped or mis-attributed their action(s).`);
  }
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
import { runAgentLoop, generateNarration, generateNarrationSimple, buildDeterministicNarration } from '../services/llm';
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
import { resolveSuggestions, GENERIC_SUGGESTIONS, buildExplorationSuggestions } from '../services/llm/suggestions';
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
        const userMsg: Message = { id: 'user-' + Date.now(), role: MessageRole.USER, text, senderName, timestamp: Date.now() };

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
            mcpServer.setLastSuggestions([]);
            const allMessagesWithUser = [...messagesRef.current, userMsg];
            const ctxPrep = prepContext(ctxRef.current, allMessagesWithUser, buildContextString(myCharacterId));
            const historyForAPI = ctxPrep.activeMessages;
            let toolMessages: Message[] = [];
            const isClientSideAction = text.startsWith('[');
            const isTrivial = isTrivialInput(text);
            let inlineNarration: string | undefined;
            let rawSuggestions: string[] = [];

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
            const turnSuggestions = await resolveSuggestions(mcpServer.getFullState(), historyForAPI, buildContextString(myCharacterId), ctxPrep.frozen, rawSuggestions, !!settings.enableSuggestions, sessionId);
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
            // Leave a non-empty suggestion tray even when the turn crashed, so the
            // tray is never blank while the feature is enabled.
            if (settings.enableSuggestions) {
                const det = buildExplorationSuggestions(mcpServer.getFullState());
                mcpServer.setLastSuggestions(det.length > 0 ? det : [...GENERIC_SUGGESTIONS]);
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

    const handleExecuteBatch = async () => {
        if (!gameState.actionQueue || gameState.actionQueue.length === 0) return;
        if (gameState.isProcessing || processingRef.current) return;

        if (isSyncableCampaign(currentCampaignId)) {
            const remoteProcessing = await storageService.isCampaignProcessing(currentCampaignId);
            if (remoteProcessing) {
                if (isDebugMode) console.log('[handleExecuteBatch] aborted — remote campaign is processing');
                return;
            }
        }

        processingRef.current = true;
        setIsLoading(true);
        const currentMessages = messagesRef.current;

        const batchText = "[Collaborative Turn]\n" + gameState.actionQueue.map(item => `[${item.playerName}]: ${item.type === 'dialogue' ? `"${item.text}"` : item.text}`).join("\n");
        const userMsg: Message = { id: 'batch-' + Date.now(), role: MessageRole.USER, text: batchText, senderName: "Party", timestamp: Date.now() };

        const lockedState = { ...gameState, isProcessing: true, processingUser: "Party" };
        mcpServer.beginTransaction();
        setGameState(lockedState); mcpServer.loadState(lockedState);
        setMessages(prev => [...prev, userMsg]);
        if (isSyncableCampaign(currentCampaignId)) storageService.syncCampaignState(currentCampaignId, lockedState, [...currentMessages, userMsg]).catch(e => console.warn('[Sync] failed:', e));

        const turnStart = Date.now();
        let firstDeltaAt: number | null = null;

        try {
            mcpServer.saveRewindPoint(mcpServer.getFullState(), [...currentMessages, userMsg]);
            mcpServer.saveEmergencySnapshot(mcpServer.getFullState());

            // Enriched batch context: per-character class features / resources / spells /
            // feats for EVERY party member (not just the locally-active one), plus the
            // standard world/time/quest/lore/combat blocks. This matches the solo path's
            // richness so the LLM can correctly attribute spells & resources in multiplayer.
            const batchContext = buildBatchContextString();

            const batchAllMessages = [...currentMessages, userMsg];
            const batchCtxPrep = prepContext(ctxRef.current, batchAllMessages, batchContext);
            const historyForAPI = batchCtxPrep.activeMessages;
            const batchCurrentState = mcpServer.getFullState();
            if (isDebugMode) console.log('[handleExecuteBatch] calling runAgentLoop', { historyLen: historyForAPI.length, queueSize: gameState.actionQueue?.length });
            const result = await runAgentLoop(historyForAPI, batchContext, batchCtxPrep.frozen,
                async (toolName, args, toolResult) => {
                    await dispatchToolRolls(toolName, args, toolResult, onTriggerDiceRoll, batchCurrentState, myCharacterId);
                    if (toolName === 'move_to' && settings.enableAtmosphere) performAtmosphereUpdate(args.location_name as string, args.description as string | undefined, settings);
                }, undefined, { requestEndNarration: true, enableSuggestions: !!settings.enableSuggestions, sessionId });
            mcpServer.commitTransaction();

            // Attribution diagnostic (multiplayer observability, no behavior change).
            // Checks whether every party member who queued an action actually appears as
            // the actor of at least one tool call. Pure console.warn — never blocks.
            warnIfBatchAttributionIncomplete(gameState.actionQueue, result.toolMessages, batchCurrentState.party);

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
            // Tier-3: minimal-prompt LLM retry.
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

            const turnSuggestions = await resolveSuggestions(mcpServer.getFullState(), historyForAPI, batchContext, batchCtxPrep.frozen, result.suggestions, !!settings.enableSuggestions, sessionId);

            const messagesToSync = [...currentMessages, userMsg, ...insertToolCallMessages(currentMessages, result.toolMessages, 'model-synth'), modelMsg];

            let preservedQueue: GameState['actionQueue'] = [];
            if (isSyncableCampaign(currentCampaignId)) {
                try {
                    const remoteState = await storageService.fetchGameState(currentCampaignId);
                    if (remoteState?.actionQueue) {
                        const executedIds = new Set((gameState.actionQueue || []).map(q => q.id));
                        preservedQueue = remoteState.actionQueue.filter(q => !executedIds.has(q.id));
                    }
                } catch {
                    // Fetch failed — proceed with empty queue (original behavior)
                }
            }

            processingRef.current = false;
            syncFinished(messagesToSync, { actionQueue: preservedQueue, lastSuggestions: turnSuggestions });
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
                const det = buildExplorationSuggestions(mcpServer.getFullState());
                mcpServer.setLastSuggestions(det.length > 0 ? det : [...GENERIC_SUGGESTIONS]);
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

    const handleExecuteBatchRef = useRef(handleExecuteBatch);
    handleExecuteBatchRef.current = handleExecuteBatch;

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
        const liveQueue = mcpServer.getFullState().actionQueue ?? [];
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
                const emergencyQueueIds = new Set((emergencySnap.actionQueue ?? []).map(q => q.id));
                const preservedFromEmergency = liveQueue.filter(q => !emergencyQueueIds.has(q.id));
                if (preservedFromEmergency.length > 0) {
                    mcpServer.loadState({ ...mcpServer.getFullState(), actionQueue: [...(mcpServer.getFullState().actionQueue ?? []), ...preservedFromEmergency] });
                }
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

        const snapshotQueueIds = new Set((snapshot.gameState.actionQueue ?? []).map(q => q.id));
        const preservedQueueItems = liveQueue.filter(q => !snapshotQueueIds.has(q.id));
        if (preservedQueueItems.length > 0) {
            const merged = { ...mcpServer.getFullState(), actionQueue: [...(mcpServer.getFullState().actionQueue ?? []), ...preservedQueueItems] };
            mcpServer.loadState(merged);
        }

        setMessages(snapshot.messages.slice(0, -1)); setGameState(mcpServer.getFullState());
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
            if (text.startsWith('[Collaborative Turn]') && (mcpServer.getFullState().actionQueue?.length ?? 0) > 0) {
                setTimeout(() => handleExecuteBatchRef.current(), 100);
            } else {
                setTimeout(() => handleSendMessageRef.current(text, true), 100);
            }
        }
    }, [restoreToBeforeLastTurn]);

    return { handleSendMessage, handleExecuteBatch, handleCharacterCreated, handleUndo, handleRewind, resetContextState };
};
