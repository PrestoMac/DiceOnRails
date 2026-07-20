import { Message, MessageRole, LLMProvider, MCPResponse, RollData } from '../../types';
import { SYSTEM_INSTRUCTION, PROGRESSION_SYSTEM_PROMPT } from '../../constants';
import { getEnv, getThinkingDisabledBody } from '../../utils/envHelper';
import { isDebugMode } from '../../utils/debug';
import { safeParseJson } from '../../utils/safeJson';
import { streamChatCompletion } from '../streamingClient';
import { resolveLLMConfig, mapHistoryToMessages } from './llmApiClient';

function skillRollData(d: any, dc: any, label?: string, extra?: Partial<RollData>): RollData {
    return { type: 'skill', dieFace: 'd20', dieRoll: d.roll ?? 0, modifier: d.modifier ?? 0, total: d.total ?? 0, dc, success: d.success, label, dieCount: 1, results: [d.roll ?? 0], ...extra };
}

/**
 * Extracts structured RollData from a tool execution result for UI display.
 * @param toolName - The name of the executed tool.
 * @param result - The MCP response from the tool execution.
 * @returns A RollData object if the tool produces roll data, otherwise undefined.
 */
export function extractRollData(toolName: string, result: MCPResponse): RollData | undefined {
  const d = result.data || {};
  if (toolName === 'roll_dice') {
    const type: RollData['type'] = d.target_ac ? 'attack' : d.isDamageRoll ? 'damage' : 'skill';
    return { type, dieFace: `d${d.sides}`, dieRoll: d.results?.[0] ?? 0, modifier: d.modifier ?? 0, total: d.total ?? 0, dc: d.target_ac, success: d.success, label: d.roll_label, isCritical: d.isCritical, isFumble: d.isFumble, dieCount: d.count ?? 1, results: d.results ?? [d.results?.[0] ?? 0], rerolledIndices: d.rerolledIndices };
  } else if (toolName === 'check_skill') {
    return skillRollData(d, d.difficulty, d.character, { skillRank: d.skillRank ?? 0 });
  } else if (toolName === 'player_attack') {
    return { type: 'attack', dieFace: 'd20', dieRoll: d.roll ?? 0, modifier: (d.attackRoll ?? 0) - (d.roll ?? 0), total: d.attackRoll ?? 0, dc: d.targetAc, success: d.isHit, isCritical: d.isCritical, isFumble: d.isFumble, dieCount: 1, results: [d.roll ?? 0] };
  } else if (toolName === 'cast_spell') {
    const atkRoll = d.attackRoll;
    if (atkRoll) {
      const spellLabel = d.damage ? 'Spell Attack → ' + d.damage.total + ' ' + (d.damage.type || '') + ' damage' : d.perBeam && d.perBeam.length > 1 ? d.perBeam.map((b: any, i: number) => `Ray ${i+1}: ${b.attackRoll.total} to hit, ${b.isHit ? `${b.damage} ${d.damage?.type || ''} damage` : 'miss'}`).join(', ') : undefined;
      return { type: 'cast_spell', dieFace: 'd20', dieRoll: atkRoll.d20, modifier: atkRoll.total - atkRoll.d20, total: atkRoll.total, isCritical: atkRoll.isCrit, isFumble: atkRoll.isFumble, label: spellLabel, dieCount: 1, results: [atkRoll.d20] };
    }
    if (d.damage) { return { type: 'cast_spell', dieFace: 'dmg', dieRoll: d.damage.total, modifier: 0, total: d.damage.total, dieCount: 1, results: [d.damage.total] }; }
    if (d.healing) { return { type: 'cast_spell', dieFace: 'd0', dieRoll: d.healing, modifier: 0, total: d.healing, label: 'Healing', dieCount: 1, results: [d.healing] }; }
    return undefined;
  } else if (toolName === 'make_save') {
    return skillRollData(d, d.dc, d.stat ? `${d.stat} Save` : undefined, { isCritical: d.nat20, isFumble: d.nat1 });
  } else if (toolName === 'roll_death_save') {
    return { type: 'death_save', dieFace: 'd20', dieRoll: d.roll ?? 0, modifier: 0, total: d.roll ?? 0, label: 'Death Save', success: d.deathSaves?.isStable || d.deathSaves?.successes >= 3, dieCount: 1, results: [d.roll ?? 0] };
  } else if (toolName === 'inflict_damage') {
    if (d.concentrationSave) { const cs = d.concentrationSave; return skillRollData({ roll: cs.d20Roll, modifier: cs.modifier, total: cs.roll, success: cs.success }, cs.dc, 'CON Save (Concentration)'); }
    return undefined;
  } else if (toolName === 'use_resource') {
    if (d.healed != null) { return { type: 'skill', dieFace: 'd10', dieRoll: d.healed ?? 0, modifier: 0, total: d.healed ?? 0, label: 'Second Wind', dieCount: 1, results: [d.healed ?? 0] }; }
    if (d.damage?.total != null) { return { type: 'damage', dieFace: 'd6', dieRoll: d.damage.total ?? 0, modifier: 0, total: d.damage.total ?? 0, label: 'Breath Weapon', dc: d.saveDC, dieCount: 1, results: [d.damage.total ?? 0] }; }
    return undefined;
  }
  return undefined;
}

/**
 * Formats a tool result into a compact JSON string for LLM context.
 * @param toolName - The name of the executed tool.
 * @param result - The MCP response from the tool execution.
 * @returns A JSON string summarizing the tool result.
 */
export function formatToolResult(toolName: string, result: MCPResponse): string {
  const d = result.data || {};
  try {
    switch (toolName) {
      case 'roll_dice': return JSON.stringify({tool:'roll_dice', success:result.success, message:result.message, sides:d.sides, total:d.total, hit:d.success, crit:d.isCritical, fumble:d.isFumble, target:d.target_name, ac:d.target_ac});
      case 'add_enemy': return JSON.stringify({tool:'add_enemy', success:result.success, message:result.message, name:d.enemy?.name, hp:d.enemy?.hp?.max, ac:d.enemy?.ac}) + ' | Next: start_combat';
      case 'start_combat': return JSON.stringify({tool:'start_combat', success:result.success, message:result.message, combatants:d.combat?.initiative?.length, first:d.currentTurn});
      case 'next_turn': return JSON.stringify({tool:'next_turn', success:result.success, message:result.message, next:d.combat?.initiative?.[d.combat?.turnIndex]?.name, round:d.combat?.round, ended:d.combatEnded});
      case 'end_combat': return JSON.stringify({tool:'end_combat', success:result.success, message:result.message});
      case 'player_attack': return JSON.stringify({tool:'player_attack', success:result.success, message:result.message, enemy:d.targetName, target:d.targetId, hit:d.isHit, damage:d.damage, crit:d.isCritical});
      case 'move_to': return JSON.stringify({tool:'move_to', success:result.success, message:result.message, location:d.newLocation});
      case 'check_skill': return JSON.stringify({tool:'check_skill', toolSuccess:result.success, message:result.message, skill:d.character, roll:d.roll, total:d.total, dc:d.difficulty, checkSuccess:d.success, xp:d.xpGained});
      case 'inflict_damage': return JSON.stringify({tool:'inflict_damage', success:result.success, message:result.message, target:d.character, damage:d.damage, hp_remaining:d.newHp, defeated:d.enemyDefeated, concSave: d.concentrationSave});
      case 'adjust_currency': return JSON.stringify({tool:'adjust_currency', success:result.success, message:result.message, gp:d.currency?.gp, sp:d.currency?.sp, cp:d.currency?.cp});
      case 'update_inventory': return JSON.stringify({tool:'update_inventory', success:result.success, message:result.message, item:d.character});
      case 'make_save': return JSON.stringify({tool:'make_save', toolSuccess:result.success, message:result.message, character:d.character, stat:d.stat, roll:d.roll, total:d.total, dc:d.dc, saveSuccess:d.success});
      case 'roll_death_save': return JSON.stringify({tool:'roll_death_save', success:result.success, message:result.message, roll:d.roll, successes:d.deathSaves?.successes, failures:d.deathSaves?.failures, stable:d.deathSaves?.isStable});
      case 'long_rest': case 'short_rest': case 'upsert_quest': case 'log_lore': return JSON.stringify({tool:toolName, success:result.success, message:result.message});
      case 'cast_spell': return JSON.stringify({tool:'cast_spell', success:result.success, message:result.message, damage:d.damage, healing:d.healing, concentration:d.concentrationStarted, saveRoll:d.saveRoll, attackRoll:d.attackRoll, perTarget:d.damage?.perTarget, perBeam:d.perBeam, casterName:d.casterName, appliedConditions:(d as any).appliedConditions, affectedTargets:d.affectedTargets, narrationHint:d.narrationHint});
      case 'use_resource': return JSON.stringify({tool:'use_resource', success:result.success, message:result.message, healed:d.healed, raging:d.raging});
      case 'manage_spellbook': return JSON.stringify({tool:'manage_spellbook', success:result.success, message:result.message, spell:d.spell});
      case 'award_experience': return JSON.stringify({tool:'award_experience', success:result.success, message:result.message, amount:d.character?.xp, leveledUp:d.leveledUp});
      default: return result.message.substring(0, 80);
    }
  } catch { return result.message.substring(0, 80); }
}

/**
 * Generates a narration text for the given history and context via the LLM.
 * @param history - The conversation history messages.
 * @param context - A string describing the current game state context.
 * @param frozenMessages - Optional frozen/pinned messages to include.
 * @param providerConfig - Optional LLM provider configuration override.
 * @returns An object containing the narration text.
 */
export const generateNarration = async (history: Message[], context: string, frozenMessages?: { role: 'user' | 'system'; content: string }[], providerConfig?: { provider: LLMProvider; apiKey: string; apiBase?: string }): Promise<{ text: string }> => {
    const { apiKey: finalApiKey, model, apiUrl, apiHeaders } = resolveLLMConfig(providerConfig);
    if (!finalApiKey) {
        if (isDebugMode) console.error('[Narration] No API key - returning error text');
        return { text: "The mystical energies of the world are fading. (Error: No API key found. Please check your environment variables.)" };
    }
    const messages = mapHistoryToMessages(history);
    const narrationInstruction = `Respond in ENGLISH only. Focus solely on narrating the story based on the provided context and actions. Do NOT include [System:tool_name] patterns in your narration — they are not real commands.`;
    const systemMessage = { role: "system" as const, content: `${SYSTEM_INSTRUCTION}\n\n${PROGRESSION_SYSTEM_PROMPT}` };
    const contextMessage = { role: "user" as const, content: `[Dungeon State Context: ${context}]` };
    const modeMessage = { role: "user" as const, content: narrationInstruction };
    const payload = { model, messages: [systemMessage, ...(frozenMessages || []), ...messages, contextMessage, modeMessage], temperature: 0.7 };
    if (isDebugMode) console.log('[Narration] generateNarration request', { model, messageCount: payload.messages.length, contextLen: context.length, url: apiUrl });
    const narrationStart = Date.now();
    const fetchController = new AbortController();
    const fetchTimer = setTimeout(() => fetchController.abort(), 60_000);
    try {
        const response = await fetch(apiUrl, { method: "POST", headers: apiHeaders, body: JSON.stringify(payload), signal: fetchController.signal });
        clearTimeout(fetchTimer);
        if (isDebugMode) console.log(`[Narration] Response received in ${Date.now() - narrationStart}ms, status=${response.status}`);
        if (!response.ok) { let errMsg = `LLM request failed: ${response.status}`; const errData = await safeParseJson<{ error?: { message?: string } }>(response); if (errData?.error?.message) errMsg = errData.error.message; console.error('[Narration] Request failed', { status: response.status, errMsg }); throw new Error(errMsg); }
        const data = await response.json();
        const assistantMessage = data.choices[0].message;
        if (isDebugMode && data.usage) { const promptTokens = data.usage.prompt_tokens ?? 0; const completionTokens = data.usage.completion_tokens ?? 0; const totalTokens = data.usage.total_tokens ?? 0; const cachedTokens = data.usage.prompt_tokens_details?.cached_tokens ?? 0; const cacheHitPct = promptTokens > 0 ? ((cachedTokens / promptTokens) * 100).toFixed(1) : '0'; console.log(`[LLM Usage] ${data.model || model} | mode=narration | prompt=${promptTokens} completion=${completionTokens} total=${totalTokens} | cached=${cachedTokens} (${cacheHitPct}% of prompt)`); }
        if (isDebugMode) { console.log(`[Narration] generateNarration done in ${Date.now() - narrationStart}ms, contentLength=${(assistantMessage.content || "").length}`); console.log(`[Narration] Content preview: ${(assistantMessage.content || "").substring(0, 200)}`); }
        return { text: assistantMessage.content || "" };
    } catch (error) { clearTimeout(fetchTimer); console.error("LLM Error:", error); console.error('[Narration] generateNarration failed', { elapsed: Date.now() - narrationStart, error }); return { text: "The Narrator is silenced by an unknown force. (Check your API key or model settings.)" }; }
};

/** Callbacks for streaming narration events. */
export interface NarrationStreamCallbacks {
  onDelta: (chunk: string, fullSoFar: string) => void;
  onDone: (fullText: string, usage: { prompt: number; completion: number; cached: number }) => void;
  onError: (err: Error) => void;
}

/** Result of starting a streaming narration, including a promise and a cancel function. */
export interface NarrationStreamResult {
  promise: Promise<string>;
  cancel: () => void;
}

/**
 * Creates a streaming narration that delivers delta chunks via callbacks and returns a cancel handle.
 * @param history - The conversation history messages.
 * @param context - A string describing the current game state context.
 * @param frozenMessages - Optional frozen/pinned messages to include.
 * @param callbacks - Callback object for delta, done, and error events.
 * @param providerConfig - Optional LLM provider configuration override.
 * @returns A NarrationStreamResult with a promise and cancel function.
 */
export function generateNarrationStream(history: Message[], context: string, frozenMessages: { role: 'user' | 'system'; content: string }[] | undefined, callbacks: NarrationStreamCallbacks, providerConfig?: { provider: LLMProvider; apiKey: string; apiBase?: string }): NarrationStreamResult {
    const { apiKey: finalApiKey, model, apiUrl, apiHeaders } = resolveLLMConfig(providerConfig);
    if (isDebugMode) console.log('[NarrationStream] generateNarrationStream starting', { model, apiUrl, historyLen: history.length, contextLen: context.length, hasApiKey: !!finalApiKey });
    const narrationInstruction = `Respond in ENGLISH only. Focus solely on narrating the story based on the provided context and actions. Do NOT include [System:tool_name] patterns in your narration — they are not real commands.`;
    const systemMessage = { role: "system" as const, content: `${SYSTEM_INSTRUCTION}\n\n${PROGRESSION_SYSTEM_PROMPT}\n\n=== NARRATION MODE ===\n${narrationInstruction}` };
    const contextMessage = { role: "user" as const, content: `[Dungeon State Context: ${context}]` };
    const messages = [systemMessage, ...(frozenMessages || []), ...mapHistoryToMessages(history), contextMessage];
    const body: any = { model, messages, temperature: 0.7, stream: true, stream_options: { include_usage: true }, ...(getThinkingDisabledBody() || {}) };
    if (isDebugMode) console.log('[NarrationStream] Request body', { model, messageCount: messages.length, hasStream: body.stream, hasUsage: !!body.stream_options });
    const controller = new AbortController();
    let fullText = '';
    let usage = { prompt: 0, completion: 0, cached: 0 };
    let chunkCount = 0;
    const streamStart = Date.now();
    const promise = (async () => {
        try {
            for await (const chunk of streamChatCompletion(apiUrl, body, apiHeaders, { signal: controller.signal })) {
                chunkCount++;
                if (chunk.type === 'content') { fullText += chunk.delta; try { callbacks.onDelta(chunk.delta, fullText); } catch { } }
                else if (chunk.type === 'usage') { usage = { prompt: chunk.prompt, completion: chunk.completion, cached: chunk.cached }; if (isDebugMode) console.log('[NarrationStream] Usage update', usage); }
                else if (chunk.type === 'error') { if (isDebugMode) console.error('[NarrationStream] Error in stream', chunk.error); callbacks.onError(chunk.error); throw chunk.error; }
            }
            if (isDebugMode) console.log(`[NarrationStream] Stream complete in ${Date.now() - streamStart}ms, ${chunkCount} chunks, ${fullText.length} chars`, usage);
            if (!fullText) { fullText = "The adventure continues..."; }
            callbacks.onDone(fullText, usage);
            return fullText;
        } catch (e) {
            if (controller.signal.aborted) {
                if (isDebugMode) console.log(`[NarrationStream] Aborted after ${Date.now() - streamStart}ms, ${chunkCount} chunks, ${fullText.length} chars`);
                return fullText;
            }
            const err = e instanceof Error ? e : new Error(String(e));
            if (isDebugMode) console.error('[NarrationStream] Failed', { elapsed: Date.now() - streamStart, error: err });
            callbacks.onError(err);
            return fullText || "The Narrator is silenced by an unknown force.";
        }
    })();
    return { promise, cancel: () => { if (isDebugMode) console.log('[NarrationStream] Cancelled by caller'); controller.abort(); } };
}

/** System prompt for generating a single-action tight narration (2-3 vivid sentences). */
export const TIGHT_NARRATION_PROMPT = `You are a fantasy narrator for a 5e-style RPG. The player has just taken a mechanical action (resolved by game tools). In 2-3 vivid sentences, narrate the outcome from the player's perspective. Focus on action, immediate consequence, and sensory detail. Respond in English. Do not call any tools.`;
/** System prompt for generating a batch-action tight narration (weaving multiple actions into 2-4 sentences). */
export const TIGHT_NARRATION_BATCH_PROMPT = `You are a fantasy narrator for a 5e-style RPG. The party has just taken a batch of mechanical actions (resolved by game tools). Weave the actions into a single 2-4 sentence narration. Focus on action, immediate consequence, and sensory detail. Respond in English. Do not call any tools.`;

/**
 * Generates a short, tight narration (2-4 sentences) based on the last user action and tool results.
 * Falls back to a default string on failure.
 * @param lastUserText - The last user input text.
 * @param toolMessages - Array of tool name and message pairs from recent tool executions.
 * @param isBatch - Whether to use the batch narration prompt.
 * @param providerConfig - Optional LLM provider configuration override.
 * @returns A narration string.
 */
export async function generateTightNarration(lastUserText: string, toolMessages: { toolName: string; message: string }[], isBatch: boolean, providerConfig?: { provider: LLMProvider; apiKey: string; apiBase?: string }): Promise<string> {
    const { apiKey: finalApiKey, model, apiUrl, apiHeaders } = resolveLLMConfig(providerConfig);
    if (!finalApiKey) {
        if (isDebugMode) console.warn('[TightNarration] No API key - returning default');
        return "The adventure continues...";
    }
    const toolSummary = toolMessages.slice(-5).map(t => `[${t.toolName}] ${t.message}`).join('\n');
    const userContent = toolSummary ? `Player action: ${lastUserText}\n\nGame events:\n${toolSummary}\n\nNow narrate the outcome.` : `Player action: ${lastUserText}\n\nNow narrate the outcome.`;
    const body: any = { model, messages: [{ role: 'system', content: isBatch ? TIGHT_NARRATION_BATCH_PROMPT : TIGHT_NARRATION_PROMPT }, { role: 'user', content: userContent }], temperature: 0.7, max_tokens: 500, ...(getThinkingDisabledBody() || {}) };
    if (isDebugMode) console.log('[TightNarration] Request', { model, isBatch, toolCount: toolMessages.length, userTextLen: lastUserText.length, url: apiUrl });
    const fetchController = new AbortController();
    const fetchTimer = setTimeout(() => fetchController.abort(), 15_000);
    const startTime = Date.now();
    let response: Response;
    try {
        response = await fetch(apiUrl, { method: 'POST', headers: apiHeaders, body: JSON.stringify(body), signal: fetchController.signal });
        if (isDebugMode) console.log(`[TightNarration] Fetch completed in ${Date.now() - startTime}ms, status=${response.status}`);
    } finally {
        clearTimeout(fetchTimer);
    }
    try {
        if (!response.ok) { const errData = await safeParseJson<{ error?: { message?: string } }>(response); const errMsg = errData?.error?.message || `LLM request failed: ${response.status}`; console.error('[TightNarration] Request not OK', { status: response.status, errMsg }); throw new Error(errMsg); }
        const data = await response.json();
        const text = (data.choices[0]?.message?.content || '').trim();
        if (isDebugMode) console.log(`[TightNarration] Done in ${Date.now() - startTime}ms, resultLen=${text.length}`, { preview: text.slice(0, 150) });
        if (text) return text;
        return "The adventure continues...";
    } catch (e) { console.error("Tight narration failed:", e); console.error('[TightNarration] Failed', { elapsed: Date.now() - startTime, error: e }); return "The adventure continues..."; }
}
