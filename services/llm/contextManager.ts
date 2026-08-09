import { Message, MessageRole, GameState } from '../../types';
import { mcpServer } from '../mcpService';
import { deepClone } from '../../utils/clone';
import { getEnv } from '../../utils/envHelper';
import { estimateTokens, computePayloadTokens, CONTEXT_BUDGET, STATIC_OVERHEAD, OVERHEAD_CONTEXT, PER_MSG_OVERHEAD, COMPLETION_RESERVE, RAW_CAP } from './tokenEstimation';
import { compressRawToCheckpoint } from './atmosphere';

/** Tracks the state of the context compression pipeline, including checkpoints, frozen history, and compression status. */
export type ContextState = {
    episodeCheckpoints: string[];
    frozenRawHistory: string;
    frozenRawTokens: number;
    frozenMessageCount: number;
    turnCounter: number;
    isCompressing: boolean;
    compressPromise: Promise<void> | null;
    generation: number;
};

/**
 * Enforces the token budget by evicting checkpoints, raw history, or trimming active messages as needed.
 * @param params - Object containing activeMessages, frozenMessages, ctx, and optional contextString.
 * @returns Eviction results including trimmed frozen messages and counts of dropped items.
 */
export function enforceTokenBudget(params: {
    activeMessages: { text?: string }[]
    frozenMessages: { role?: string; content?: string }[]
    ctx: { frozenRawHistory: string; frozenRawTokens: number; episodeCheckpoints: unknown[]; frozenMessageCount?: number; isCompressing?: boolean }
    contextString?: string
}): {
    trimmedFrozen: { role: 'user' | 'system'; content: string }[]
    droppedRaw: boolean
    droppedCheckpoints: number
    tiersTriggered: number[]
    trimActiveCount: number
    rawHistoryUpdate?: { history: string; tokens: number }
} {
    const { activeMessages, frozenMessages, contextString } = params;
    const frozenMsgCount = params.ctx.frozenMessageCount || 0;
    const frozen = [...frozenMessages] as { role: 'user' | 'system'; content: string }[];
    let droppedCheckpoints = 0;
    let droppedRaw = false;

    const activeOnly = activeMessages.slice(frozenMsgCount);

    const totalTokens = () => computePayloadTokens(activeOnly, frozen, contextString);
    if (totalTokens() <= CONTEXT_BUDGET) {
        return { trimmedFrozen: frozen, droppedRaw: false, droppedCheckpoints: 0, tiersTriggered: [], trimActiveCount: 0 };
    }

    while (totalTokens() > CONTEXT_BUDGET) {
        const chkIdx = frozen.findIndex(m => m.content?.startsWith('[RECENT SESSION]'));
        if (chkIdx >= 0) {
            frozen.splice(chkIdx, 1);
            droppedCheckpoints++;
            continue;
        }
        const rawIdx = frozen.findIndex(m => m.content?.startsWith('[EARLIER EVENTS]'));
        if (rawIdx >= 0) {
            frozen.splice(rawIdx, 1);
            droppedRaw = true;
            continue;
        }
        break;
    }

    let rawHistoryUpdate: { history: string; tokens: number } | undefined;
    if (!params.ctx.isCompressing) {
        const rawEntry = frozen.find(m => m.content?.startsWith('[EARLIER EVENTS]'));
        if (rawEntry) {
            const trimmed = rawEntry.content.replace(/^\[EARLIER EVENTS\]\n/, '');
            rawHistoryUpdate = { history: trimmed, tokens: estimateTokens(trimmed) };
        } else if (params.ctx.frozenRawHistory) {
            rawHistoryUpdate = { history: '', tokens: 0 };
        }
    }

    let trimActiveCount = 0;
    if (totalTokens() > CONTEXT_BUDGET && activeOnly.length > 1) {
        const frozenTokens = frozen.reduce((s, m) => s + estimateTokens(m.content || '') + PER_MSG_OVERHEAD, 0);
        const contextTokens = contextString ? estimateTokens(contextString) : 50;
        let running = STATIC_OVERHEAD + frozenTokens + OVERHEAD_CONTEXT + contextTokens + COMPLETION_RESERVE;
        for (let i = 0; i < activeOnly.length - 2; i++) {
            running += estimateTokens(activeOnly[i].text || '') + PER_MSG_OVERHEAD;
            if (running > CONTEXT_BUDGET) {
                trimActiveCount = i + 1;
                break;
            }
        }
    }

    if (totalTokens() > CONTEXT_BUDGET) {
        const lastRawIdx = frozen.findIndex(m => m.content?.startsWith('[EARLIER EVENTS]'));
        if (lastRawIdx >= 0) {
            frozen.splice(lastRawIdx, 1);
            droppedRaw = true;
        }
    }

    return { trimmedFrozen: frozen, droppedRaw, droppedCheckpoints, tiersTriggered: droppedCheckpoints > 0 ? [1] : [], trimActiveCount, rawHistoryUpdate };
}

/**
 * Builds the frozen messages array from checkpoints and raw history stored in the context state.
 * @param ctx - The current context state.
 * @returns An array of frozen messages with role and content.
 */
export function buildFrozenMessages(ctx: ContextState): { role: 'user' | 'system'; content: string }[] {
    const msgs: { role: 'user' | 'system'; content: string }[] = [];
    for (const chk of ctx.episodeCheckpoints) msgs.push({ role: 'system', content: `[RECENT SESSION]\n${chk}` });
    if (ctx.frozenRawHistory) msgs.push({ role: 'system', content: `[EARLIER EVENTS]\n${ctx.frozenRawHistory}` });
    return msgs;
}

/**
 * Freezes messages outside the active window into the raw history, truncating oldest content if the character cap is exceeded.
 * @param ctx - The current context state (mutated in place).
 * @param allMessages - The full list of messages.
 * @param aw - The active window size (number of messages to keep unfrozen).
 */
export function freezeMessages(ctx: ContextState, allMessages: Message[], aw: number): void {
    const fe = Math.max(0, allMessages.length - aw);
    if (fe <= ctx.frozenMessageCount) return;
    const tf = allMessages.slice(ctx.frozenMessageCount, fe);
    if (tf.length === 0) return;
    const ft = tf.map(m => `[${m.role === MessageRole.USER ? (m.senderName || 'Player') : m.role === MessageRole.MODEL ? 'GM' : 'System'}] ${m.text}`).join('\n\n');
    ctx.frozenRawHistory += (ctx.frozenRawHistory ? '\n\n' : '') + ft;
    ctx.frozenRawTokens = estimateTokens(ctx.frozenRawHistory);
    const FROZEN_RAW_CHAR_CAP = 80000;
    if (ctx.frozenRawHistory.length > FROZEN_RAW_CHAR_CAP) {
        const truncateAt = Math.floor(ctx.frozenRawHistory.length * 0.25);
        const newStart = ctx.frozenRawHistory.indexOf('\n\n', truncateAt);
        if (newStart > 0) {
            ctx.frozenRawHistory = ctx.frozenRawHistory.slice(newStart + 2);
        }
        ctx.frozenRawTokens = estimateTokens(ctx.frozenRawHistory);
        console.warn('[Context Freeze] frozenRawHistory exceeded char cap, truncated oldest 25%');
    }
    ctx.frozenMessageCount = fe; ctx.turnCounter = 0;
    console.log(`[Context Freeze] ${tf.length} msgs \u2192 ${estimateTokens(ft)} tokens. Frozen total: ${ctx.frozenRawTokens}/${RAW_CAP}`);
}

/**
 * Triggers checkpoint compression if the frozen raw history exceeds the token cap and no compression is already in progress.
 * @param ctx - The current context state (mutated in place).
 * @param sessionId - Optional OpenRouter sticky routing session ID for prompt caching.
 */
export function compressToCheckpointIfNeeded(ctx: ContextState, sessionId?: string): void {
    if (ctx.isCompressing || (ctx.frozenRawTokens < RAW_CAP && ctx.episodeCheckpoints.length > 0) || !ctx.frozenRawHistory) return;
    if (ctx.frozenRawTokens < 1000 && ctx.episodeCheckpoints.length === 0) return;
    ctx.isCompressing = true;
    const snapshot = ctx.frozenRawHistory;
    const gen = ctx.generation;
    ctx.compressPromise = (async () => {
        try {
            const cp = await compressRawToCheckpoint(snapshot, getEnv('VITE_LLM_API_KEY'), getEnv('VITE_SUMMARIZATION_MODEL') || 'xiaomi/mimo-v2.5', undefined, undefined, sessionId);
            if (cp && ctx.generation === gen) {
                ctx.episodeCheckpoints.push(cp);
                ctx.frozenRawHistory = '';
                ctx.frozenRawTokens = 0;
                console.log(`[Context Pipeline] Checkpoint: #${ctx.episodeCheckpoints.length} ${estimateTokens(cp)} tokens`);
            }
        } catch (e) { console.error('[Context Pipeline] Checkpoint error:', e); }
        finally { ctx.isCompressing = false; ctx.compressPromise = null; }
    })();
}

/**
 * Runs one step of the context pipeline: increments turn counter, freezes messages if threshold is met, and triggers compression.
 * @param ctx - The current context state (mutated in place).
 * @param fi - Freeze interval (number of turns between freeze operations).
 * @param am - The full list of active messages.
 * @param aw - The active window size.
 * @param sessionId - Optional OpenRouter sticky routing session ID for prompt caching during compression.
 */
export function runContextPipeline(ctx: ContextState, fi: number, am: Message[], aw: number, sessionId?: string): void {
    ctx.turnCounter++;
    if (ctx.turnCounter >= fi) freezeMessages(ctx, am, aw);
    compressToCheckpointIfNeeded(ctx, sessionId);
}

/**
 * Prepares the context for an LLM call by building frozen messages, enforcing the token budget, and slicing active messages.
 * @param ctx - The current context state (may be mutated if eviction occurs).
 * @param am - The full list of active messages.
 * @param contextString - Optional context string to include in budget calculation.
 * @returns An object with frozen messages and a trimmed active messages array.
 */
export function prepareContext(ctx: ContextState, am: Message[], contextString?: string): { frozen: { role: 'user' | 'system'; content: string }[]; activeMessages: Message[] } {
    const frozen = buildFrozenMessages(ctx);
    const result = enforceTokenBudget({ activeMessages: am, frozenMessages: frozen, ctx, contextString });
    if (result.droppedCheckpoints > 0) { ctx.episodeCheckpoints.splice(0, result.droppedCheckpoints); console.log(`[Context Budget] Eviction: dropped ${result.droppedCheckpoints} oldest checkpoint(s)`); }
    if (result.rawHistoryUpdate) { ctx.frozenRawHistory = result.rawHistoryUpdate.history; ctx.frozenRawTokens = result.rawHistoryUpdate.tokens; }
    const sliceStart = Math.min(ctx.frozenMessageCount + result.trimActiveCount, Math.max(0, am.length - 1));
    const activeSlice = am.slice(sliceStart);
    return { frozen: result.trimmedFrozen, activeMessages: activeSlice };
}

/**
 * Syncs finished state by attaching context metadata, deep-cloning the game state, and persisting it.
 * @param ctx - The current context state.
 * @param ms - The MCP server instance.
 * @param sg - State setter function (e.g. React setState).
 * @param extras - Optional additional GameState fields to merge.
 * @returns The finalized game state object.
 */
export function syncFinishedState(ctx: ContextState, ms: typeof mcpServer, sg: (s: GameState) => void, extras?: Partial<GameState>) {
    const ctxMeta: Record<string, unknown> = {};
    if (ctx.episodeCheckpoints.length > 0) ctxMeta.episodeCheckpoints = ctx.episodeCheckpoints;
    ctxMeta.frozenRawHistory = ctx.frozenRawHistory;
    ctxMeta.frozenRawTokens = ctx.frozenRawTokens;
    ctxMeta.frozenMessageCount = ctx.frozenMessageCount;
    ctxMeta.turnCounter = ctx.turnCounter;
    ctxMeta.generation = ctx.generation;
    const fs = deepClone({ ...ms.getFullState(), isProcessing: false, processingUser: undefined, ctx: ctxMeta, ...extras });
    ms.loadState(fs); sg(fs); return fs;
}
