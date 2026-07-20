import { getEnv } from '../../utils/envHelper';
import { SYSTEM_INSTRUCTION, PROGRESSION_SYSTEM_PROMPT } from '../../constants';
import { TOOL_MODE_INSTRUCTION } from './tools';

/**
 * Estimates the token count of a text string using a simple character-to-token ratio.
 * @param text - The text to estimate.
 * @param type - Optional hint: 'json' (3:1 ratio), 'code' (5:1), or undefined (4:1).
 * @returns The estimated number of tokens.
 */
export function estimateTokens(text: string, type?: 'json' | 'code'): number {
    if (!type) {
        const trimmed = text.trimStart();
        if (trimmed.startsWith('{') && trimmed.includes('":')) type = 'json';
        else if (trimmed.startsWith('[') && (trimmed.includes('":') || trimmed.startsWith('[{'))) type = 'json';
    }
    const ratio = type === 'json' ? 3 : type === 'code' ? 5 : 4;
    return Math.ceil(text.length / ratio);
}

/** Estimated per-message overhead in tokens. */
export const PER_MSG_OVERHEAD = 8;
/** Tokens reserved for the LLM completion response. */
export const COMPLETION_RESERVE = 4000;


import { tools } from './tools';
/** Estimated token overhead for the full tool schema definition. */
export const TOOL_SCHEMA_OVERHEAD = estimateTokens(JSON.stringify(tools), 'json');

/** Token overhead for the game state context message. */
export const OVERHEAD_CONTEXT = estimateTokens('[Dungeon State Context: ]') + PER_MSG_OVERHEAD;
/** Total static token overhead (system instructions + tool schemas). */
export const STATIC_OVERHEAD = estimateTokens(`${SYSTEM_INSTRUCTION}\n\n${PROGRESSION_SYSTEM_PROMPT}\n\n=== TOOL MODE ===\n${TOOL_MODE_INSTRUCTION}`) + TOOL_SCHEMA_OVERHEAD;

/** Token cap for raw frozen history before compression is triggered (default 30000). */
export const RAW_CAP = Number(getEnv('VITE_CONTEXT_RAW_CAP')) || 30000;
/** Hard token budget for the full context payload (default 180000). */
export const CONTEXT_BUDGET = Number(getEnv('VITE_CONTEXT_BUDGET')) || 180000;

/**
 * Computes the total estimated token count for a full payload including active messages, frozen messages, and context.
 * @param activeMessages - The active (unfrozen) messages.
 * @param frozenMessages - The frozen/pinned messages.
 * @param contextString - Optional game state context string.
 * @returns The total estimated token count.
 */
export function computePayloadTokens(
    activeMessages: { text?: string; content?: string }[],
    frozenMessages: { text?: string; content?: string }[],
    contextString?: string
): number {
    const staticTotal = STATIC_OVERHEAD;
    const activeTotal = activeMessages.reduce((s, m) => s + estimateTokens(m.text || m.content || '') + PER_MSG_OVERHEAD, 0);
    const frozenTotal = frozenMessages.reduce((s, m) => s + estimateTokens(m.content || m.text || '') + PER_MSG_OVERHEAD, 0);
    const contextTokens = contextString ? estimateTokens(contextString) : 50;
    const appendedTotal = OVERHEAD_CONTEXT + contextTokens + COMPLETION_RESERVE;
    return staticTotal + activeTotal + frozenTotal + appendedTotal;
}
