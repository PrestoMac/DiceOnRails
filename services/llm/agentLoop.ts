import { Message, MessageRole, LLMProvider, MCPResponse } from '../../types';
import { SYSTEM_INSTRUCTION, PROGRESSION_SYSTEM_PROMPT } from '../../constants';
import { getThinkingDisabledBody } from '../../utils/envHelper';
import { isDebugMode } from '../../utils/debug';
import { safeParseJson } from '../../utils/safeJson';
import { mcpServer } from '../mcpService';
import { tools, TOOL_MODE_INSTRUCTION } from './tools';
import { extractRollData, formatToolResult } from './narration';
import { estimateTokens, PER_MSG_OVERHEAD, STATIC_OVERHEAD, COMPLETION_RESERVE, CONTEXT_BUDGET } from './tokenEstimation';
import { sanitizeNarration } from '../../utils/textSanitize';
import { filterTools } from './toolFilter';
import { resolveLLMConfig, mapHistoryToMessages } from './llmApiClient';
import { CONDITION_INFO } from '../../data/conditionInfo';

const CRITICAL_TOOLS = new Set(['cast_spell', 'inflict_damage', 'roll_dice', 'player_attack']);

function createToolMessage(toolName: string, result: MCPResponse, toolCallId?: string): Message {
    return {
        id: `tool-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        role: MessageRole.TOOL,
        text: `[System:${toolName}] ${result.message}`,
        timestamp: Date.now(),
        toolCallId,
        rollData: extractRollData(toolName, result),
    };
}

async function executeToolBatch(
    rawToolCalls: Array<{ id: string; function: { name?: string; arguments?: string } }>,
    toolCalls: { id: string; name: string; args: Record<string, unknown> }[],
    toolMessages: Message[],
    onToolResult?: (toolName: string, args: Record<string, unknown>, result: MCPResponse) => void,
): Promise<{ results: Array<{ mapped: { id: string; name?: string; args: Record<string, unknown> }; raw: { id: string; function: { name?: string; arguments?: string } }; result: MCPResponse }>; criticalFailed: boolean }> {
    if (isDebugMode) console.log(`[AgentLoop] executeToolBatch executing ${toolCalls.length} tool(s)`, toolCalls.map(tc => ({ name: tc.name, args: tc.args })));
    const batchStart = Date.now();
    const results = await Promise.all(toolCalls.map(async tc => {
        const execStart = Date.now();
        const result = await mcpServer.executeToolCall(tc.name, tc.args);
        if (isDebugMode) console.log(`[AgentLoop] Tool ${tc.name} completed in ${Date.now() - execStart}ms`, { success: result.success, messageLen: result.message.length });
        return { mapped: tc, raw: rawToolCalls.find((r: { id: string }) => r.id === tc.id) || tc, result };
    }));
    results.sort((a, b) => String(a.raw.id).localeCompare(String(b.raw.id)));
    let criticalFailed = false;
    for (const { mapped, raw, result } of results) {
        const toolName = mapped.name || raw.function?.name;
        toolMessages.push(createToolMessage(toolName, result, raw.id));
        if (onToolResult) onToolResult(toolName, mapped.args, result);
        if (!result.success && CRITICAL_TOOLS.has(toolName)) {
            if (isDebugMode) console.warn(`[AgentLoop] Critical tool failed: ${toolName}`);
            criticalFailed = true;
        }
    }
    if (isDebugMode) console.log(`[AgentLoop] executeToolBatch done in ${Date.now() - batchStart}ms`, { total: results.length, criticalFailed });
    return { results, criticalFailed };
}

/**
 * Runs the main LLM agent loop, iteratively calling the LLM with tool definitions
 * until an end-of-turn condition is met or the iteration budget is exhausted.
 * @param history - The conversation history messages.
 * @param context - A string describing the current game state context.
 * @param frozenMessages - Optional frozen/pinned messages (checkpoints, raw history) to include.
 * @param onToolResult - Optional callback invoked after each tool execution.
 * @param providerConfig - Optional LLM provider configuration override.
 * @param options - Optional settings: requestEndNarration, maxIters, AbortSignal.
 * @returns An object containing tool messages, iteration count, token usage, and optional inline narration.
 */
export async function runAgentLoop(
  history: Message[],
  context: string,
  frozenMessages?: { role: 'user' | 'system'; content: string }[],
  onToolResult?: (toolName: string, args: Record<string, unknown>, result: MCPResponse) => void,
  providerConfig?: { provider: LLMProvider; apiKey: string; apiBase?: string },
  options?: { requestEndNarration?: boolean; maxIters?: number; signal?: AbortSignal; enableSuggestions?: boolean }
): Promise<{
  toolMessages: Message[];
  iterationCount: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  inlineNarration?: string;
  suggestions?: string[];
}> {
  const { model, apiUrl, apiHeaders } = resolveLLMConfig(providerConfig);
  if (isDebugMode) {
    console.log('[AgentLoop] runAgentLoop entry', {
      historyLen: history.length,
      contextLen: context.length,
      frozenCount: frozenMessages?.length ?? 0,
      apiUrl,
      model,
      maxIters: options?.maxIters ?? 20,
      requestEndNarration: options?.requestEndNarration,
    });
  }
  const agentLoopStart = Date.now();

  const systemMessage = {
    role: "system" as const,
    content: `${SYSTEM_INSTRUCTION}\n\n${PROGRESSION_SYSTEM_PROMPT}${options?.enableSuggestions ? '\n15. SUGGESTED ACTIONS: When ending a turn with narrate_turn, ALWAYS include 2-3 short suggested next actions in the suggestions field. Each must be ≤60 chars, in first person from the player\'s perspective (e.g. "I attack the goblin with my longsword", "I order a drink and sit down"). This is mandatory.\n' : ''}\n\n=== TOOL MODE ===\n${TOOL_MODE_INSTRUCTION}`
  };
  const state = mcpServer.getFullState();
  const gameTimeAtStart = state.gameTime ?? 0;
  const contextParts: string[] = [];


  contextParts.push(`[Dungeon State Context: ${context}]`);


  if (state.combat?.isActive && state.combat.initiative?.length > 0) {
    const entry = state.combat.initiative[state.combat.turnIndex];
    contextParts.push(`CURRENT TURN: ${entry.name} (${entry.type}) — Round ${state.combat.round}`);
    contextParts.push(`INITIATIVE: ${state.combat.initiative.map(e =>
      `${e.name} (${e.initiative}${e.type === 'player' ? ', player' : ''})`
    ).join(' → ')}`);
  }


  if (state.combat?.isActive && state.combat.enemies?.length > 0) {
    const alive = state.combat.enemies.filter(e => !e.isDead);
    if (alive.length > 0) {
      contextParts.push('ENEMIES: ' + alive.map(e =>
        `${e.name} (${e.hp.current}/${e.hp.max} HP, AC ${e.ac})${
          e.conditions?.length ? ` [${e.conditions.map(c => c.id).join(',')}]` : ''
        }`
      ).join(' | '));
    }
  }


  const effects: string[] = [];
  for (const c of state.party) {
    if (c.concentrationSpellId) {
      const effectiveDuration = c.runtime?.concentrationEffectiveDuration;
      const elapsed = (state.gameTime ?? 0) - (c.runtime?.concentrationStartTime ?? 0);
      const remaining = effectiveDuration != null
        ? Math.max(0, effectiveDuration - elapsed)
        : null;
      effects.push(`${c.name} concentrating on ${c.concentrationSpellId}${
        remaining !== null ? ` (${remaining} min remaining)` : ''
      }`);
    }
    if (c.conditions?.length) {
      effects.push(`${c.name} has: ${c.conditions.map(cond => {
        const info = CONDITION_INFO[cond.id];
        const name = info ? cond.id.replace(/-/g, ' ') : cond.id;
        const dur = cond.duration > 0 ? ` (${cond.duration}${(cond.durationUnit ?? 'round')[0]})` : '';
        return `${name}${dur}`;
      }).join(', ')}`);
    }
    if (c.raging) {
      effects.push(`${c.name} is raging`);
    }
    if (c.tempHp && c.tempHp > 0) {
      effects.push(`${c.name} has ${c.tempHp} temp HP`);
    }
    if (c.runtime?.transformationState) {
      effects.push(`${c.name} is transformed (${c.runtime.transformationState.duration ?? 0} min left)`);
    }
  }
  if (state.combat?.activeDoTs?.length) {
    effects.push('Active DoTs: ' + state.combat.activeDoTs.map(dot =>
      `${dot.spellId} on [${dot.targetIds.join(', ')}] (${dot.damageFormula})`
    ).join('; '));
  }
  if (effects.length > 0) {
    contextParts.push('ACTIVE EFFECTS: ' + effects.join(' | '));
  }

  if (options?.enableSuggestions) {
    contextParts.push('REMEMBER: Include 2-3 short suggested next actions in the suggestions field of narrate_turn. Each must be in FIRST PERSON from the player perspective.');
  }

  const contextMessage = {
    role: "user" as const,
    content: contextParts.join('\n')
  };

  const messages: Array<{ role: string; content: string }> = [
    systemMessage,
    ...(frozenMessages || []),
    ...mapHistoryToMessages(history),
    contextMessage
  ];

  const toolMessages: Message[] = [];
  let totalPrompt = 0, totalCompletion = 0, totalCached = 0;
  const MAX_ITERS = options?.maxIters ?? 20;
  let itersCompleted = 0;
  let inlineNarration: string | undefined;
  let suggestions: string[] | undefined;
  let narrateTurnExecuted = false;
  let correctiveRetries = 0;
  // Tracks the most recent assistant prose (or reasoning_content fallback) across
  // iterations. Used as a last-resort source for inlineNarration when the model
  // emits prose alongside tool calls but no narrate_turn/inline-finalize narration
  // is captured from the tool results themselves.
  let lastNarrationCandidate = '';

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    itersCompleted = iter + 1;
    const thinkingBody = getThinkingDisabledBody();
    const filteredTools = filterTools(tools, mcpServer.getFullState());
    if (options?.enableSuggestions) {
      const nt = filteredTools.find((t: { function: { name: string } }) => t.function.name === 'narrate_turn') as
        { function: { name: string; parameters: { type: string; properties: Record<string, unknown>; required: string[] } } } | undefined;
      if (nt) {
        nt.function.parameters.required = ['narration', 'timePassed', 'suggestions'];
      }
    }
    const body: Record<string, unknown> = { model, messages, temperature: 0.7, tools: filteredTools, tool_choice: "auto", ...(thinkingBody || {}) };
    if (isDebugMode) console.log(`[AgentLoop] Iter ${iter + 1}/${MAX_ITERS} starting, messageCount=${messages.length}`, { bodyKeys: Object.keys(body), hasThinking: !!thinkingBody, model, toolCount: filteredTools.length });

    const fetchController = new AbortController();
    const fetchTimer = setTimeout(() => fetchController.abort(), 60_000);
    const fetchSignal = options?.signal
      ? AbortSignal.any([options.signal, fetchController.signal])
      : fetchController.signal;
    const iterStart = Date.now();
    let response: Response;
    try {
      response = await fetch(apiUrl, {
        method: "POST",
        headers: apiHeaders,
        body: JSON.stringify(body),
        signal: fetchSignal,
      });
      if (isDebugMode) console.log(`[AgentLoop] Iter ${iter + 1} fetch completed in ${Date.now() - iterStart}ms, status=${response.status}`);
    } finally {
      clearTimeout(fetchTimer);
    }

    if (!response.ok) {
      const errData = await safeParseJson<{ error?: { message?: string } }>(response) || {};
      const errMsg = errData.error?.message || `LLM request failed: ${response.status}`;
      if (isDebugMode) console.error(`[AgentLoop] Iter ${iter + 1} request failed`, { status: response.status, errMsg, errBody: errData.error || errData });
      throw new Error(errMsg);
    }

    const data = await response.json();
    const promptT = data.usage?.prompt_tokens ?? 0;
    const completionT = data.usage?.completion_tokens ?? 0;
    const cachedT = data.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    totalPrompt += promptT;
    totalCompletion += completionT;
    totalCached += cachedT;

    const assistantMsg = data.choices[0].message;
    const rawToolCalls = assistantMsg.tool_calls || [];
    const assistantContent = (assistantMsg.content || '').toString().trim();
    // Reasoning models (e.g. deepseek-v4-flash) sometimes leave `content` empty and
    // emit prose in `reasoning_content`. Keep a narration candidate that falls back
    // to reasoning_content for the inlineNarration capture path, while leaving
    // `assistantContent` (content-only) untouched so the <tool_call>-markup guard
    // below doesn't misfire on reasoning text.
    const reasoningContent = (typeof assistantMsg.reasoning_content === 'string' ? assistantMsg.reasoning_content : '').trim();
    const narrationCandidate = sanitizeNarration(assistantContent || reasoningContent);
    if (narrationCandidate.length >= 25) lastNarrationCandidate = narrationCandidate;

    if (isDebugMode) {
      console.log(`[Agent Loop] Iter ${iter + 1}: prompt=${promptT} completion=${completionT} cached=${cachedT} tools=${rawToolCalls.length} contentLen=${assistantContent.length} elapsed=${Date.now() - iterStart}ms`);
      if (rawToolCalls.length > 0) {
        console.log(`[Agent Loop] Dispatched Tool Calls:\n${rawToolCalls.map((tc: { id: string; function: { name: string; arguments: string } }) => ` - ID: ${tc.id}, Function: ${tc.function.name}, Args: ${tc.function.arguments}`).join('\n')}`);
      }
      if (assistantContent) {
        console.log(`[Agent Loop] Assistant content: ${assistantContent.slice(0, 200)}`);
      }
    }

    if (rawToolCalls.length === 0) {
      // Layer-2 guardrail: the model suffered a tool-calling format failure and emitted
      // its calls as raw <tool_call>/<function> text instead of using the structured
      // tool_calls field. Nudge it to re-issue proper structured calls (recovers dropped
      // calls like award_experience). Up to 2 corrective retries.
      const rawToolText = /<tool_call>|<function\s*=|<\/function>/i.test(assistantContent);
      if (rawToolText && correctiveRetries < 2) {
        correctiveRetries++;
        if (isDebugMode) console.warn(`[AgentLoop] Raw <tool_call> text detected (iter ${iter + 1}); issuing corrective retry ${correctiveRetries}/2`);
        messages.push({
          role: 'user',
          content: 'You emitted tool calls as raw <tool_call>/<function> text in your content. That is not valid — tool calls MUST use the structured function-calling mechanism (the tools parameter), never markup in text. Re-issue your intended tool calls now, choosing from the provided tool definitions, with proper arguments.',
        });
        continue;
      }
      if (iter === 0) {
        messages.push({ role: 'user', content: 'You MUST call at least one tool. Determine the correct tool and call it now.' });
        continue;
      }
      const currentState = mcpServer.getFullState();
      const combat = currentState.combat;
      if (combat && combat.isActive && combat.enemies && combat.enemies.some((e: { isDead: boolean }) => !e.isDead)) {



        const activeEntry = combat.initiative?.[combat.turnIndex];
        if (iter < 5 && activeEntry && activeEntry.type !== 'player') {
          messages.push({
            role: 'user',
            content: 'Combat is still active. Call next_turn to advance initiative. Enemy turns are auto-resolved. Do NOT call narrate_turn yet.'
          });
          continue;
        }
      }
      break;
    }
    const toolCalls = rawToolCalls.map((tc: { id: string; function: { name: string; arguments: string } }) => {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(tc.function.arguments);
      } catch {
        if (isDebugMode) console.warn(`[AgentLoop] Malformed JSON in tool call ${tc.function.name} (${tc.id}), using empty args`);
      }
      return { id: tc.id, name: tc.function.name, args: parsedArgs };
    });

    const combatActive = mcpServer.getFullState().combat?.isActive === true;
    const isEndOfTurn = toolCalls.some((tc: { name: string; args?: { narration?: string; autoAdvanceTime?: boolean; route?: string; timePassed?: number; narrationOnSuccess?: string; narrationOnFailure?: string } }) =>
      tc.name === 'narrate_turn' ||
      (tc.name === 'long_rest' && (tc.args?.narration || tc.args?.autoAdvanceTime)) ||
      (tc.name === 'short_rest' && (tc.args?.narration || tc.args?.autoAdvanceTime)) ||
      (tc.name === 'move_to' && tc.args?.route) ||
      // Inline finalize: an action tool carrying narration/timePassed (deterministic)
      // or narrationOnSuccess/narrationOnFailure (binary dice) ends the turn.
      // The engine selected the branch from its own roll. Gated out of combat,
      // where turns are driven by next_turn instead.
      (!combatActive && (tc.args?.narration || tc.args?.timePassed !== undefined || tc.args?.narrationOnSuccess || tc.args?.narrationOnFailure))
    );

    if (isEndOfTurn) {

      const preEndCalls = toolCalls.filter((tc: { name: string }) => tc.name !== 'narrate_turn');
      if (preEndCalls.length > 0) {
        const { results: preEndResults, criticalFailed: preEndCritical } = await executeToolBatch(rawToolCalls, preEndCalls, toolMessages, onToolResult);

        if (options?.requestEndNarration && !preEndCritical) {
          for (const r of preEndResults) {
            const data = r.result.data as Record<string, unknown> | undefined;
            const timeResult = data?.timeResult as { narration?: string } | undefined;
            const narrText = String(data?.narration ?? timeResult?.narration ?? '').trim();
            if (narrText.length >= 25) {
              inlineNarration = narrText;
              break;
            }
          }
        }

        // Inline-finalized tools carry suggestions on their own args (there is no
        // separate narrate_turn to read them from). Pull them from the pre-end calls.
        if ((!suggestions || suggestions.length === 0)) {
          for (const r of preEndResults) {
            const sugg = (r.mapped.args as Record<string, unknown> | undefined)?.suggestions;
            if (Array.isArray(sugg) && sugg.length > 0) {
              suggestions = (sugg as unknown[])
                .filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0)
                .slice(0, 3);
              if (suggestions.length > 0) break;
            }
          }
        }
      }



      const timeAlreadyAdvanced = (mcpServer.getFullState().gameTime ?? 0) > gameTimeAtStart;
      const narrateCall = toolCalls.find((tc: { name: string }) => tc.name === 'narrate_turn');
      if (narrateCall) {
        if (!timeAlreadyAdvanced) {
          const narrateResult = await mcpServer.executeToolCall('narrate_turn', narrateCall.args);
          narrateTurnExecuted = true;
          if (Array.isArray(narrateCall.args?.suggestions)) {
            suggestions = narrateCall.args.suggestions
              .filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0)
              .slice(0, 3);
          }
          const logs = narrateResult.data?.logs;
          if (Array.isArray(logs) && logs.length > 0) {
            toolMessages.push({
              id: `sys-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
              role: MessageRole.SYSTEM,
              text: logs.join('\n'),
              timestamp: Date.now(),
            });
          }
          if (options?.requestEndNarration && narrateResult.success) {
            const text = String(narrateResult.data?.narration ?? '').trim();
            if (text.length >= 25) {
              inlineNarration = text;
            }
          }
        }
      }

      // If no inline narration was captured from the narrate_turn/inline-finalize
      // tool results, fall back to the assistant prose emitted alongside the tool
      // calls in this iteration. Previously this prose was silently dropped.
      if (!inlineNarration && narrationCandidate.length >= 25) {
        inlineNarration = narrationCandidate;
        if (isDebugMode) console.log(`[AgentLoop] Narration captured from assistant prose (len=${narrationCandidate.length})`);
      }

      if (isDebugMode && !inlineNarration) {
        console.log('[AgentLoop] Narration empty — diagnostics:', {
          assistantContentLen: assistantContent?.length ?? 0,
          assistantContentPreview: (assistantContent ?? '').slice(0, 80),
          hadNarrateCall: !!narrateCall,
          timeAlreadyAdvanced,
          iter: itersCompleted,
        });
      }

      break;
    }

    const toolCallDefs = rawToolCalls.map((tc: { id: string; function: { name: string; arguments: string } }) => ({
      id: tc.id, type: 'function',
      function: { name: tc.function.name, arguments: tc.function.arguments }
    }));
    const { results: batchResults } = await executeToolBatch(rawToolCalls, toolCalls, toolMessages, onToolResult);

    messages.push({ role: 'assistant', content: "", tool_calls: toolCallDefs });
    for (const { mapped, raw, result } of batchResults) {
      const toolName = mapped.name || raw.function?.name;
      messages.push({ role: 'tool', tool_call_id: raw.id, content: formatToolResult(toolName, result) });
    }


    const iterTokens = messages.reduce((s: number, m: { content?: string }) => s + estimateTokens(m.content || JSON.stringify(m) || '') + PER_MSG_OVERHEAD, 0)
        + STATIC_OVERHEAD + COMPLETION_RESERVE;
    if (iterTokens > CONTEXT_BUDGET * 0.95) {
        if (isDebugMode) console.warn(`[Agent Loop] Budget exceeded at iter ${iter + 1}: ~${iterTokens} tokens. Breaking early.`);
        break;
    }




    const nextTurnResult = batchResults.find((r: { mapped: { name: string } }) => r.mapped.name === 'next_turn');
    if (nextTurnResult && nextTurnResult.result.success) {
      // Combat turns are driven by next_turn, which carries no narration prose of
      // its own. The engine attaches a deterministic narration summary (built from
      // the resolved enemy attack results) plus contextual suggestions, so the
      // fallback "The adventure continues..." and empty suggestion tray never fire
      // during combat. LLM-provided narration (via narrate_turn) still wins.
      const ntData = nextTurnResult.result.data as Record<string, unknown> | undefined;
      if (!inlineNarration) {
        const ntNarration = String(ntData?.narration ?? '').trim();
        if (ntNarration.length >= 25) inlineNarration = ntNarration;
      }
      if (!suggestions || suggestions.length === 0) {
        const ntSuggestions = ntData?.suggestions;
        if (Array.isArray(ntSuggestions)) {
          suggestions = (ntSuggestions as unknown[])
            .filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0)
            .map((s: string) => s.slice(0, 80))
            .slice(0, 3);
        }
      }
      break;
    }
  }






  // Loop exhausted / budget hit / next_turn break without inline narration:
  // fall back to the most recent assistant prose captured across iterations so
  // the turn still carries the model's own words rather than the generic fallback.
  if (!inlineNarration && lastNarrationCandidate.length >= 25) {
    inlineNarration = lastNarrationCandidate;
    if (isDebugMode) console.log(`[AgentLoop] Narration captured from lastNarrationCandidate post-loop (len=${lastNarrationCandidate.length})`);
  }

  const gameTimeNow = mcpServer.getFullState().gameTime ?? 0;
  const timeAdvancedThisTurn = narrateTurnExecuted || gameTimeNow > gameTimeAtStart;
  if (!timeAdvancedThisTurn) {
    await mcpServer.executeToolCall('narrate_turn', { narration: '', timePassed: 0 });
    if (isDebugMode) console.log('[AgentLoop] Enforcement: auto-called narrate_turn(timePassed=0) — no time advanced this turn');
  }

  if (isDebugMode) {
    console.log(`[AgentLoop] runAgentLoop complete in ${Date.now() - agentLoopStart}ms`, {
      itersCompleted,
      toolMessages: toolMessages.length,
      totalPrompt,
      totalCompletion,
      totalCached,
      hasInlineNarration: !!inlineNarration,
      inlineNarrationLen: inlineNarration?.length ?? 0,
      timeAdvancedThisTurn,
      hasSuggestions: !!suggestions?.length,
    });
  }
  return {
    toolMessages,
    iterationCount: itersCompleted,
    promptTokens: totalPrompt,
    completionTokens: totalCompletion,
    cachedTokens: totalCached,
    inlineNarration: sanitizeNarration(inlineNarration) || undefined,
    suggestions,
  };
}
