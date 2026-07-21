import { Message } from '../../types';
import { mcpServer } from '../mcpService';
import { resolveLLMConfig } from './llmApiClient';
import { getThinkingDisabledBody } from '../../utils/envHelper';
import { isDebugMode } from '../../utils/debug';

function parseSuggestions(content: string): string[] {
  // Strip markdown code fences if present.
  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  // Find the first {...} block.
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as { suggestions?: unknown };
    const arr = parsed.suggestions;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((s): s is string => typeof s === 'string')
      .map(s => s.slice(0, 80))
      .filter(s => s.trim().length > 0)
      .slice(0, 3);
  } catch {
    return [];
  }
}

/**
 * Lightweight per-turn suggested-actions generator.
 * Calls the LLM with a tiny prompt asking for 2-3 short action suggestions
 * reflecting the current game state. Designed to be cheap and non-blocking.
 *
 * Guardrails:
 * - 15s timeout per call
 * - max_tokens capped at 200
 * - Cheap model used when VITE_SUGGESTIONS_MODEL is set, else default model
 * - Returns empty array on any error
 */
export async function generateSuggestions(
  history: Message[],
  options?: { signal?: AbortSignal },
): Promise<string[]> {
  const state = mcpServer.getFullState();
  const lead = state.party[0];
  if (!lead) return [];

  // Tactical gate: only suggest in combat or when HP is low
  const inCombat = !!state.combat?.isActive;
  const lowHp = lead.hp.max > 0 && lead.hp.current < lead.hp.max * 0.3;
  if (!inCombat && !lowHp) return [];

  const { model: defaultModel, apiUrl, apiHeaders } = resolveLLMConfig(undefined);
  const model = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUGGESTIONS_MODEL
    || (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_LLM_MODEL
    || defaultModel;

  const lastUserMessages = history.slice(-6).map(m => `${m.role}: ${m.text.slice(0, 200)}`).join('\n');
  const hpStr = `HP ${lead.hp.current}/${lead.hp.max}`;
  const combatStr = inCombat ? ` | Combat active (round ${state.combat?.round})` : '';
  const prompt = `You are an assistant suggesting 2-3 short player actions for a 5e RPG.
Current state: ${lead.name} (${lead.class}, L${lead.level}) — ${hpStr}${combatStr}.
Recent context:
${lastUserMessages}

Respond ONLY with a JSON object: {"suggestions": ["short action 1", "short action 2", "short action 3"]}. Each suggestion must be <= 60 chars, in second person ("Attack the goblin", "Cast Healing Word").`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  const signal = options?.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;

  try {
    const thinking = getThinkingDisabledBody();
    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: 'You are a terse 5e combat advisor. Respond only with JSON.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5,
      max_tokens: 200,
      ...(thinking || {}),
    };
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: apiHeaders,
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) return [];
    const data = await response.json();
    const content = (data.choices?.[0]?.message?.content ?? '').toString().trim();
    return parseSuggestions(content);
  } catch (err) {
    if (isDebugMode) console.warn('[Suggestions] generation failed:', err);
    return [];
  } finally {
    clearTimeout(timer);
  }
}
