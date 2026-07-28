import { LLMProvider, StartingLocation } from '../../types';
import { getEnv } from '../../utils/envHelper';
import { isDebugMode } from '../../utils/debug';
import { safeParseJson } from '../../utils/safeJson';
import {
    buildChatCompletionUrl,
    buildChatCompletionHeaders,
    resolveProvider,
    normalizeModelName
} from '../llmClient';
import { estimateTokens } from './tokenEstimation';
import { fetchWithTimeout } from './llmApiClient';

/**
 * Generates an atmosphere image URL based on a textual description using the ImageRouter API.
 * @param description - A text description of the scene to visualize.
 * @returns A URL string of the generated image, or undefined on failure.
 */
export async function generateAtmosphere(
    description: string
): Promise<string | undefined> {
    const apiKey = getEnv("VITE_IMAGE_ROUTER_API_KEY");
    const model = getEnv("VITE_IMAGE_MODEL") || "stabilityai/sdxl-turbo";

    if (!apiKey) {
        if (isDebugMode) console.warn("Atmosphere fetch aborted: No ImageRouter API Key provided in environment variables.");
        return undefined;
    }

    try {
        const qualityPrompt = `Epic dark fantasy, cinematic concept art, fantasy RPG scenery, highly detailed, masterpiece lighting, ${description}`;

        const response = await fetchWithTimeout("https://api.imagerouter.io/v1/openai/images/generations", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                prompt: qualityPrompt,
                size: "1024x1024",
                n: 1
            })
        });

        const contentType = response.headers.get("content-type");

        if (!response.ok) {
            let errorMessage = `ImageRouter Error: ${response.status}`;
            try {
                if (contentType && contentType.includes("application/json")) {
                    const errData = await response.json();
                    errorMessage = errData.error?.message || errorMessage;
                } else {
                    const text = await response.text();
                    errorMessage = `Non-JSON Response (${response.status}): ${text.substring(0, 100)}`;
                }
            } catch {
                errorMessage = `Failed to parse error response: ${response.status}`;
            }
            throw new Error(errorMessage);
        }

        if (contentType && contentType.includes("application/json")) {
            const data = await response.json();

            const url = data.data?.[0]?.url || data.images?.[0]?.url || data.url;
            if (!url) throw new Error("ImageRouter returned success but no image URL was found.");
            return url;
        } else {
            throw new Error("ImageRouter returned a successful status but a non-JSON content type.");
        }
    } catch (e) {
        if (isDebugMode) console.error("Atmosphere generation failed:", e);
        return undefined;
    }
}

/** System prompt used to generate fantasy starting locations (taverns/inns/waypoints). */
export const STARTING_LOCATIONS_PROMPT = `You are a fantasy world-building assistant for a 5e-style RPG. Generate exactly 4 unique, safe starting locations (taverns, inns, or roadside waypoints) for a new adventurer. Each must be a welcoming place where a hero begins their journey.

Return a valid JSON array with exactly 4 objects. Each object must have:
- "name": a creative fantasy tavern or inn name (string)
- "description": a vivid 2-3 sentence atmosphere description focusing on sensory details like lighting, sounds, smells, architecture, and mood (string)
- "introHook": MANDATORY — a non-empty 2-3 sentence atmospheric scene that paints a picture of the surroundings. Describe a specific NPC interaction, a notable detail in the room, the weather outside, ambient sounds, or a mysterious presence. Make it feel alive and immersive. NEVER leave this field empty or omit it. (string)

Make each location feel distinct in architecture, atmosphere, and implied region. Vary the names tonally (some warm and rustic, some mysterious, some bustling). The introHook must always be present and feel like the opening of a story, drawing the player in with vivid sensory detail. Do not return a location with an empty or missing introHook.`;

/**
 * Generates up to 4 unique starting locations for a new character via the LLM.
 * @param character - The character descriptor (name, race, class).
 * @param apiKey - The LLM API key.
 * @param provider - Optional LLM provider type.
 * @param apiBase - Optional custom API base URL.
 * @param sessionId - Optional OpenRouter sticky routing session ID for prompt caching.
 * @returns An array of up to 4 StartingLocation objects.
 */
export async function generateStartingLocations(
  character: { name: string; race: string; class: string },
  apiKey: string,
  provider?: LLMProvider,
  apiBase?: string,
  sessionId?: string
): Promise<StartingLocation[]> {
  const effProvider = resolveProvider(provider, apiBase);
  const url = buildChatCompletionUrl(effProvider, apiBase);
  const headers = buildChatCompletionHeaders(effProvider, apiKey);
  const model = normalizeModelName(getEnv("VITE_LLM_MODEL") || "deepseek/deepseek-v4-flash", apiBase);

    const messages = [
    { role: 'system' as const, content: STARTING_LOCATIONS_PROMPT },
    { role: 'user' as const, content: `Generate 4 starting locations for a ${character.race} ${character.class} named ${character.name}.` }
  ];

  const requestBody: Record<string, unknown> = {
    model,
    messages,
    temperature: 1.0,
    max_tokens: 8000
  };
  if (sessionId) requestBody.session_id = sessionId;

  try {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      console.warn("[generateStartingLocations] API error:", response.status, await response.text());
      return [];
    }

    const data = await response.json();

    const raw = data.choices?.[0]?.message?.content
      || data.choices?.[0]?.text
      || data.response
      || (typeof data.output === 'string' ? data.output : data.output ? JSON.stringify(data.output) : '');

    if (!raw) {
      console.warn("[generateStartingLocations] Empty response content. Response keys:", Object.keys(data), "finish_reason:", data.choices?.[0]?.finish_reason);
      return [];
    }

    const cleaned = raw.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, '$1').trim();
    const parsed = JSON.parse(cleaned);
    const locations = parsed.locations || parsed.starting_locations || (Array.isArray(parsed) ? parsed : [parsed]);

    return locations.slice(0, 4).map((l: { name: string; imageUrl?: string }, i: number) => ({
      name: l.name || `Unnamed Location ${i + 1}`,
      description: l.description || "",
      // Guarantee a non-empty hook: prefer the LLM introHook, then the alias,
      // then fall back to the description (also thematic) rather than empty.
      introHook: l.introHook || l.hook || l.description || "",
    }));
  } catch (e) {
    console.warn("[generateStartingLocations] Failed:", e);
    return [];
  }
}

/**
 * Compresses raw session text into a dense episode checkpoint summary via the LLM.
 * @param rawText - The raw session history text to compress.
 * @param apiKey - The LLM API key.
 * @param model - The model name to use for compression.
 * @param provider - Optional LLM provider type.
 * @param apiBase - Optional custom API base URL.
 * @param sessionId - Optional OpenRouter sticky routing session ID for prompt caching.
 * @returns The compressed checkpoint string, or an empty string on failure.
 */
export async function compressRawToCheckpoint(
    rawText: string,
    apiKey: string,
    model: string,
    provider?: LLMProvider,
    apiBase?: string,
    sessionId?: string
): Promise<string> {
    const systemPrompt = `You are a game record archivist. Summarize the following RPG session events into a dense, factual episode checkpoint.

PRESERVE EVERY instance of:
- NPCs: every named character, their role, relationship to the party, key info or dialogue they provided
- Quests: every quest (title, status=active/completed/failed, giver, rewards, objectives)
- Items: every item gained, lost, used, or purchased (name, quantity, context)
- Locations: every location visited or described as significant
- Currency: every transaction (amount in GP/SP/CP, reason, payer/recipient)
- Combat: every fight (enemy, method, damage dealt/taken, outcome, loot)
- Skill Checks: every check (skill name, DC, result, consequence)
- XP Awards: every award (amount, reason)
- Lore: every lore entry (title, category)
- Player Decisions: every significant choice and its narrative consequence
- Character Development: level-ups, stat changes, HP changes, new abilities

FORMAT: Write as a dense single block of text. Use this structure for every event:
[T#] Type: Factual description.

Be thorough. Do not omit details. This checkpoint is the sole record of these turns. Write approximately 1000 words.`;

    const effProvider = resolveProvider(provider, apiBase);
    const url = buildChatCompletionUrl(effProvider, apiBase);
    const headers = buildChatCompletionHeaders(effProvider, apiKey);
    const effModel = normalizeModelName(model, apiBase);

    // Summaries are long-running (~1000 words of dense output). The default 30s
    // timeout is too short for slower summarizers and surfaces as
    // "AbortError: signal is aborted without reason". Use a generous timeout and
    // retry once on AbortError with an even longer leash before giving up.
    const PRIMARY_TIMEOUT = 120_000;
    const RETRY_TIMEOUT = 180_000;

    const attempt = async (timeoutMs: number): Promise<string> => {
        const requestBody: Record<string, unknown> = {
            model: effModel,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: rawText }
            ],
            temperature: 0.3,
            max_tokens: 8000
        };
        // Sticky routing: pin compression calls to the same provider endpoint so
        // the long archivist system prompt is cached on repeated compressions.
        if (sessionId) requestBody.session_id = sessionId;
        const response = await fetchWithTimeout(url, {
            method: "POST",
            headers,
            body: JSON.stringify(requestBody)
        }, timeoutMs);

        if (!response.ok) {
            const errData = await safeParseJson<{ error?: { message?: string } }>(response) || {};
            throw new Error(errData.error?.message || `Checkpoint compression failed: ${response.status}`);
        }

        const data = await response.json();
        // Reasoning models may emit the summary in reasoning_content while leaving
        // content empty — fall back to it so a successful compression isn't dropped.
        const msg = data.choices?.[0]?.message || {};
        const checkpoint = (typeof msg.content === 'string' && msg.content.trim())
            ? msg.content
            : (typeof msg.reasoning_content === 'string' ? msg.reasoning_content : "");
        const finishReason = data.choices?.[0]?.finish_reason;
        const outputTokens = data.usage?.completion_tokens ?? estimateTokens(checkpoint);
        if (!checkpoint || checkpoint.trim().length < 100 || finishReason === 'length') {
            console.warn(`[Context Pipeline] Checkpoint rejected: len=${checkpoint.length} finish=${finishReason} contentEmpty=${!msg.content} usedReasoning=${!!(!msg.content && msg.reasoning_content)}`);
            return "";
        }
        console.log(`[Context Pipeline] Checkpoint: ${estimateTokens(rawText)} raw → ${outputTokens} chk`);
        return checkpoint;
    };

    try {
        const first = await attempt(PRIMARY_TIMEOUT);
        return first;
    } catch (e) {
        const isAbort = e instanceof DOMException && e.name === 'AbortError';
        if (!isAbort) {
            console.error("[Context Pipeline] Checkpoint compression failed:", e);
            return "";
        }
        console.warn(`[Context Pipeline] Checkpoint compression timed out after ${PRIMARY_TIMEOUT}ms; retrying once with ${RETRY_TIMEOUT}ms leash`);
        try {
            const retried = await attempt(RETRY_TIMEOUT);
            if (retried) console.log(`[Context Pipeline] Checkpoint compression succeeded on retry (${RETRY_TIMEOUT}ms)`);
            return retried;
        } catch (e2) {
            console.error(`[Context Pipeline] Checkpoint compression failed after retry:`, e2);
            return "";
        }
    }
}


