import { Message, LLMProvider, MCPResponse, RollData } from '../../types';
import { SYSTEM_INSTRUCTION, PROGRESSION_SYSTEM_PROMPT } from '../../constants';
import { getThinkingDisabledBody } from '../../utils/envHelper';
import { isDebugMode } from '../../utils/debug';
import { safeParseJson } from '../../utils/safeJson';
import { sanitizeNarration } from '../../utils/textSanitize';
import { streamChatCompletion } from '../streamingClient';
import { resolveLLMConfig, mapHistoryToMessages } from './llmApiClient';

function skillRollData(d: Record<string, unknown>, dc: number, label?: string, extra?: Partial<RollData>): RollData {
    return { type: 'skill', dieFace: 'd20', dieRoll: d.roll ?? 0, modifier: d.modifier ?? 0, total: d.total ?? 0, dc, success: d.success, label, dieCount: 1, results: [d.roll ?? 0], ...extra };
}

/**
 * Extracts structured RollData from a tool execution result for UI display.
 * @param toolName - The name of the executed tool.
 * @param result - The MCP response from the tool execution.
 * @returns A RollData object if the tool produces roll data, otherwise undefined.
 */
export function extractRollData(toolName: string, result: MCPResponse): RollData | RollData[] | undefined {
  const d = result.data || {};
  if (toolName === 'roll_dice') {
    const type: RollData['type'] = d.target_ac ? 'attack' : d.isDamageRoll ? 'damage' : 'skill';
    return { type, dieFace: `d${d.sides}`, dieRoll: d.results?.[0] ?? 0, modifier: d.modifier ?? 0, total: d.total ?? 0, dc: d.target_ac, success: d.success, label: d.roll_label, isCritical: d.isCritical, isFumble: d.isFumble, dieCount: d.count ?? 1, results: d.results ?? [d.results?.[0] ?? 0], rerolledIndices: d.rerolledIndices };
  } else if (toolName === 'check_skill') {
    return skillRollData(d, d.difficulty, d.character, { skillRank: d.skillRank ?? 0 });
  } else if (toolName === 'player_attack') {
    const attackCard: RollData = { type: 'attack', dieFace: 'd20', dieRoll: d.roll ?? 0, modifier: (d.attackRoll ?? 0) - (d.roll ?? 0), total: d.attackRoll ?? 0, dc: d.targetAc, success: d.isHit, isCritical: d.isCritical, isFumble: d.isFumble, dieCount: 1, results: [d.roll ?? 0] };
    if (d.isHit === true && d.damage != null) {
      const dmgResults = Array.isArray(d.damageResults) ? (d.damageResults as number[]) : [];
      const dmgSum = dmgResults.length > 0 ? dmgResults.reduce((a, b) => a + b, 0) : 0;
      const dm = String(d.damageDice ?? '').match(/d(\d+)/);
      const dmgTotal = Number(d.damage ?? 0);
      return [attackCard, {
        type: 'damage', dieFace: dm ? `d${dm[1]}` : 'dmg', dieRoll: dmgSum,
        modifier: dmgTotal - dmgSum, total: dmgTotal, success: true,
        dieCount: dmgResults.length || 1, results: dmgResults.length > 0 ? dmgResults : [dmgTotal],
        label: `${d.attacker ?? 'Player'} → ${d.enemy ?? d.target ?? 'Target'}`,
      }];
    }
    return attackCard;
  } else if (toolName === 'cast_spell') {
    const atkRoll = d.attackRoll;
    if (atkRoll) {
      const spellLabel = d.damage ? 'Spell Attack → ' + d.damage.total + ' ' + (d.damage.type || '') + ' damage' : d.perBeam && d.perBeam.length > 1 ? d.perBeam.map((b: { attackRoll: { total: number }; isHit: boolean; damage: number }, i: number) => `Ray ${i+1}: ${b.attackRoll.total} to hit, ${b.isHit ? `${b.damage} ${d.damage?.type || ''} damage` : 'miss'}`).join(', ') : undefined;
      const attackCard: RollData = { type: 'cast_spell', dieFace: 'd20', dieRoll: atkRoll.d20, modifier: atkRoll.total - atkRoll.d20, total: atkRoll.total, isCritical: atkRoll.isCrit, isFumble: atkRoll.isFumble, label: spellLabel, dieCount: 1, results: [atkRoll.d20] };
      if (d.damage && d.damage.total > 0) {
        return [attackCard, { type: 'cast_spell', dieFace: 'dmg', dieRoll: d.damage.total, modifier: 0, total: d.damage.total, label: `Spell Damage (${d.damage.type || 'damage'})`, dieCount: 1, results: [d.damage.total] }];
      }
      return attackCard;
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
  } else if (toolName === 'next_turn') {
    // Engine-resolved enemy attacks (auto-resolved during initiative). Each entry
    // produces an attack RollData (and, on a hit, a damage RollData) so every
    // enemy swing surfaces as its own animated card.
    const attacks = (d as { attackResults?: unknown }).attackResults as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(attacks) || attacks.length === 0) return undefined;
    const out: RollData[] = [];
    for (const a of attacks) {
      const roll = Number(a.roll ?? 0);
      const attackRoll = Number(a.attackRoll ?? 0);
      const enemyName = String(a.enemy ?? 'Enemy');
      const targetName = String(a.target ?? 'Hero');
      out.push({
        type: 'attack', dieFace: 'd20', dieRoll: roll,
        modifier: attackRoll - roll, total: attackRoll,
        dc: a.targetAc as number | undefined, success: a.isHit as boolean | undefined,
        isCritical: a.isCritical as boolean | undefined, isFumble: a.isFumble as boolean | undefined,
        dieCount: 1, results: [roll],
        label: `${enemyName} → ${targetName}`,
      });
      if (a.isHit === true) {
        const dmgResults = a.damageResults as number[] | undefined;
        const dmgTotal = Number(a.damage ?? 0);
        out.push({
          type: 'damage', dieFace: String(a.damageDice ?? 'dmg'), dieRoll: dmgTotal,
          modifier: 0, total: dmgTotal, success: true,
          dieCount: dmgResults?.length ?? 1, results: dmgResults ?? [dmgTotal],
          label: `${enemyName} → ${targetName}`,
        });
      }
    }
    return out;
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
      case 'player_attack': return JSON.stringify({tool:'player_attack', success:result.success, message:result.message, attacker:d.attacker, enemy:d.enemy, target:d.targetName, targetId:d.targetId, roll:d.roll, attackRoll:d.attackRoll, ac:d.targetAc, hit:d.isHit, damage:d.damage, crit:d.isCritical, fumble:d.isFumble, targetDefeated:d.targetDefeated, xpAwarded:d.xpAwarded});
      case 'move_to': return JSON.stringify({tool:'move_to', success:result.success, message:result.message, location:d.newLocation});
      case 'check_skill': return JSON.stringify({tool:'check_skill', toolSuccess:result.success, message:result.message, skill:d.character, roll:d.roll, total:d.total, dc:d.difficulty, checkSuccess:d.success, xp:d.xpGained});
      case 'inflict_damage': return JSON.stringify({tool:'inflict_damage', success:result.success, message:result.message, target:d.character, damage:d.damage, hp_remaining:d.newHp, defeated:d.enemyDefeated, xpAwarded:d.xpAwarded, concSave: d.concentrationSave});
      case 'adjust_currency': return JSON.stringify({tool:'adjust_currency', success:result.success, message:result.message, gp:d.currency?.gp, sp:d.currency?.sp, cp:d.currency?.cp});
      case 'update_inventory': return JSON.stringify({tool:'update_inventory', success:result.success, message:result.message, item:d.character});
      case 'make_save': return JSON.stringify({tool:'make_save', toolSuccess:result.success, message:result.message, character:d.character, stat:d.stat, roll:d.roll, total:d.total, dc:d.dc, saveSuccess:d.success});
      case 'roll_death_save': return JSON.stringify({tool:'roll_death_save', success:result.success, message:result.message, roll:d.roll, successes:d.deathSaves?.successes, failures:d.deathSaves?.failures, stable:d.deathSaves?.isStable});
      case 'long_rest': case 'short_rest': case 'upsert_quest': case 'log_lore': return JSON.stringify({tool:toolName, success:result.success, message:result.message});
      case 'cast_spell': return JSON.stringify({tool:'cast_spell', success:result.success, message:result.message, damage:d.damage, healing:d.healing, concentration:d.concentrationStarted, saveRoll:d.saveRoll, attackRoll:d.attackRoll, perTarget:d.damage?.perTarget, perBeam:d.perBeam, casterName:d.casterName, appliedConditions:(d as unknown as { appliedConditions?: unknown[] }).appliedConditions, affectedTargets:d.affectedTargets, narrationHint:d.narrationHint});
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
 * @param sessionId - Optional OpenRouter sticky routing session ID for prompt caching.
 * @returns An object containing the narration text.
 */
export const generateNarration = async (history: Message[], context: string, frozenMessages?: { role: 'user' | 'system'; content: string }[], providerConfig?: { provider: LLMProvider; apiKey: string; apiBase?: string }, sessionId?: string): Promise<{ text: string }> => {
    const { apiKey: finalApiKey, model, apiUrl, apiHeaders } = resolveLLMConfig(providerConfig, sessionId);
    if (!finalApiKey) {
        if (isDebugMode) console.error('[Narration] No API key - returning error text');
        return { text: "The mystical energies of the world are fading. (Error: No API key found. Please check your environment variables.)" };
    }
    const messages = mapHistoryToMessages(history);
    const narrationInstruction = `Respond in ENGLISH only. Focus solely on narrating the story based on the provided context and actions. Do NOT include [System:tool_name] patterns in your narration — they are not real commands.`;
    const systemMessage = { role: "system" as const, content: `${SYSTEM_INSTRUCTION}\n\n${PROGRESSION_SYSTEM_PROMPT}` };
    const contextMessage = { role: "user" as const, content: `[Dungeon State Context: ${context}]` };
    const modeMessage = { role: "user" as const, content: narrationInstruction };
    const payloadBase: Record<string, unknown> = { model, messages: [systemMessage, ...(frozenMessages || []), ...messages, contextMessage, modeMessage], temperature: 0.7 };
    if (sessionId) payloadBase.session_id = sessionId;
    if (isDebugMode) console.log('[Narration] generateNarration request', { model, messageCount: (payloadBase.messages as unknown[]).length, contextLen: context.length, url: apiUrl, sessionId });
    const narrationStart = Date.now();
    const fetchController = new AbortController();
    const fetchTimer = setTimeout(() => fetchController.abort(), 60_000);
    try {
        const response = await fetch(apiUrl, { method: "POST", headers: apiHeaders, body: JSON.stringify(payloadBase), signal: fetchController.signal });
        // NOTE: the abort timer is NOT cleared here — it must stay armed through
        // response.json() below. A gateway that sends headers then stalls on the
        // body would otherwise hang response.json() forever (no timeout), pinning
        // isLoading and freezing the chat. It is cleared in the finally.
        if (isDebugMode) console.log(`[Narration] Response received in ${Date.now() - narrationStart}ms, status=${response.status}`);
        if (!response.ok) { let errMsg = `LLM request failed: ${response.status}`; const errData = await safeParseJson<{ error?: { message?: string } }>(response); if (errData?.error?.message) errMsg = errData.error.message; console.error('[Narration] Request failed', { status: response.status, errMsg }); throw new Error(errMsg); }
        const data = await response.json();
        const assistantMessage = data.choices[0].message;
        if (isDebugMode && data.usage) { const promptTokens = data.usage.prompt_tokens ?? 0; const completionTokens = data.usage.completion_tokens ?? 0; const totalTokens = data.usage.total_tokens ?? 0; const cachedTokens = data.usage.prompt_tokens_details?.cached_tokens ?? 0; const cacheHitPct = promptTokens > 0 ? ((cachedTokens / promptTokens) * 100).toFixed(1) : '0'; console.log(`[LLM Usage] ${data.model || model} | mode=narration | prompt=${promptTokens} completion=${completionTokens} total=${totalTokens} | cached=${cachedTokens} (${cacheHitPct}% of prompt)`); }
        if (isDebugMode) { console.log(`[Narration] generateNarration done in ${Date.now() - narrationStart}ms, contentLength=${(assistantMessage.content || "").length}`); console.log(`[Narration] Content preview: ${(assistantMessage.content || "").substring(0, 200)}`); }
        // Use content ONLY. For a reasoning model (e.g. deepseek-v4-flash),
        // reasoning_content on a narration call is the model planning *what* to
        // narrate (meta: "I should describe the road, mention the time of
        // day..."), not the narration prose itself. Falling back to it caused
        // planning/thinking prose to bleed into the chat bubble. An empty content
        // result yields empty text and falls through the narration tier chain
        // (simple retry -> deterministic -> generic), which is safer than leaking
        // chain-of-thought.
        const narrationContent = (typeof assistantMessage.content === 'string' && assistantMessage.content.trim())
            ? assistantMessage.content
            : "";
        return { text: sanitizeNarration(narrationContent) };
    } catch (error) { console.error("LLM Error:", error); console.error('[Narration] generateNarration failed', { elapsed: Date.now() - narrationStart, error }); return { text: "The Narrator is silenced by an unknown force. (Check your API key or model settings.)" }; }
    finally { clearTimeout(fetchTimer); }
};

/**
 * Last-resort LLM narration with a minimal prompt and higher temperature. Intended
 * for the rare case where both inline narration and the primary generateNarration
 * retry produced empty/short/artifact-only text. Uses a simpler system prompt to
 * reduce the surface for another tool-calling-format failure.
 * @param history - The conversation history messages.
 * @param context - A string describing the current game state context.
 * @param frozenMessages - Optional frozen/pinned messages to include.
 * @param providerConfig - Optional LLM provider configuration override.
 * @param sessionId - Optional OpenRouter sticky routing session ID for prompt caching.
 * @returns An object containing the narration text.
 */
export const generateNarrationSimple = async (history: Message[], context: string, frozenMessages?: { role: 'user' | 'system'; content: string }[], providerConfig?: { provider: LLMProvider; apiKey: string; apiBase?: string }, sessionId?: string): Promise<{ text: string }> => {
    const { apiKey: finalApiKey, model, apiUrl, apiHeaders } = resolveLLMConfig(providerConfig, sessionId);
    if (!finalApiKey) {
        if (isDebugMode) console.error('[Narration] generateNarrationSimple: No API key');
        return { text: "" };
    }
    const messages = mapHistoryToMessages(history);
    const systemMessage = { role: "system" as const, content: "You are the narrator of a fantasy RPG. Narrate the most recent action in one or two vivid sentences. Plain prose only. Do NOT call any tools. Do NOT use markdown. Respond in English." };
    const contextMessage = { role: "user" as const, content: `[Dungeon State Context: ${context}]` };
    const payloadBase: Record<string, unknown> = { model, messages: [systemMessage, ...(frozenMessages || []), ...messages, contextMessage], temperature: 0.9 };
    if (sessionId) payloadBase.session_id = sessionId;
    if (isDebugMode) console.log('[Narration] generateNarrationSimple request', { model, messageCount: (payloadBase.messages as unknown[]).length });
    const fetchController = new AbortController();
    const fetchTimer = setTimeout(() => fetchController.abort(new Error('generateNarrationSimple timed out after 60s')), 60_000);
    try {
        const response = await fetch(apiUrl, { method: "POST", headers: apiHeaders, body: JSON.stringify(payloadBase), signal: fetchController.signal });
        if (!response.ok) { const errMsg = `LLM request failed: ${response.status}`; const errData = await safeParseJson<{ error?: { message?: string } }>(response); if (errData?.error?.message) throw new Error(errData.error.message); throw new Error(errMsg); }
        const data = await response.json();
        const msg = data.choices[0].message;
        // Content only — reasoning_content is planning meta, not narration prose
        // (see generateNarration rationale above).
        const c = (typeof msg.content === 'string' && msg.content.trim())
            ? msg.content
            : "";
        return { text: sanitizeNarration(c) };
    } catch (error) {
        if (isDebugMode) console.error('[Narration] generateNarrationSimple failed:', error instanceof Error ? error.message : String(error));
        return { text: "" };
    } finally { clearTimeout(fetchTimer); }
};

/**
 * Builds a zero-LLM deterministic one-liner from a turn's tool messages. Used as the
 * final fallback before the generic "The adventure continues..." string so the
 * narration bubble always carries *some* turn-specific information. Truthful by
 * construction — derived only from the structured rollData/result messages.
 * @param toolMessages - The tool result messages produced during the turn.
 * @returns A short narration string, or "" when nothing useful can be derived.
 */
export function buildDeterministicNarration(toolMessages: Message[]): string {
    if (!Array.isArray(toolMessages) || toolMessages.length === 0) return "";
    // Walk backwards so we describe the most recent meaningful action first.
    for (let i = toolMessages.length - 1; i >= 0; i--) {
        const m = toolMessages[i];
        const nameMatch = /^\[System:([a-zA-Z_]+)\]\s*/.exec(m.text);
        const toolName = nameMatch ? nameMatch[1] : "";
        const rest = nameMatch ? m.text.slice(nameMatch[0].length).trim() : m.text.trim();
        const roll = Array.isArray(m.rollData) ? m.rollData[0] : m.rollData;

        if (toolName === 'narrate_turn' || toolName === 'next_turn') continue;

        if (toolName === 'player_attack' || toolName === 'inflict_damage') {
            if (roll) {
                const dmg = toolMessages
                    .map(tm => (Array.isArray(tm.rollData) ? tm.rollData : [tm.rollData]))
                    .flat()
                    .filter((r): r is RollData => !!r && r.type === 'damage')
                    .reduce((s, r) => s + (r.total || 0), 0);
                if (roll.success === false) return `The attack on ${rest.split(' ')[0]} misses.`;
                if (dmg > 0) return `The strike lands for ${dmg} damage.`;
                return `The strike lands.`;
            }
        } else if (toolName === 'cast_spell') {
            if (roll && roll.type === 'cast_spell') return `The spell takes effect.`;
        } else if (toolName === 'check_skill') {
            if (roll) return roll.success ? `The skill check succeeds.` : `The skill check fails.`;
        } else if (toolName === 'make_save') {
            if (roll) return roll.success ? `The saving throw succeeds.` : `The saving throw fails.`;
        } else if (toolName === 'move_to') {
            return rest ? `You make your way onward.` : `You travel onward.`;
        } else if (toolName === 'long_rest' || toolName === 'short_rest') {
            return `The party takes a moment to recover.`;
        } else if (toolName === 'update_inventory' || toolName === 'adjust_currency') {
            return `Your belongings shift.`;
        }
    }
    return "";
}

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
    const body: Record<string, unknown> = { model, messages, temperature: 0.7, stream: true, stream_options: { include_usage: true }, ...(getThinkingDisabledBody() || {}) };
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
                if (chunk.type === 'content') { fullText += chunk.delta; try { callbacks.onDelta(chunk.delta, fullText); } catch { /* callback may throw */ } }
                else if (chunk.type === 'usage') { usage = { prompt: chunk.prompt, completion: chunk.completion, cached: chunk.cached }; if (isDebugMode) console.log('[NarrationStream] Usage update', usage); }
                else if (chunk.type === 'error') { if (isDebugMode) console.error('[NarrationStream] Error in stream', chunk.error); callbacks.onError(chunk.error); throw chunk.error; }
            }
            if (isDebugMode) console.log(`[NarrationStream] Stream complete in ${Date.now() - streamStart}ms, ${chunkCount} chunks, ${fullText.length} chars`, usage);
            fullText = sanitizeNarration(fullText);
            if (!fullText) { fullText = "The adventure continues..."; }
            callbacks.onDone(fullText, usage);
            return fullText;
        } catch (e) {
            if (controller.signal.aborted) {
                if (isDebugMode) console.log(`[NarrationStream] Aborted after ${Date.now() - streamStart}ms, ${chunkCount} chunks, ${fullText.length} chars`);
                return sanitizeNarration(fullText);
            }
            const err = e instanceof Error ? e : new Error(String(e));
            if (isDebugMode) console.error('[NarrationStream] Failed', { elapsed: Date.now() - streamStart, error: err });
            callbacks.onError(err);
            return sanitizeNarration(fullText) || "The Narrator is silenced by an unknown force.";
        }
    })();
    return { promise, cancel: () => { if (isDebugMode) console.log('[NarrationStream] Cancelled by caller'); controller.abort(); } };
}
