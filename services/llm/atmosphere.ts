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
- "introHook": a 2-3 sentence atmospheric scene that paints a picture of the surroundings — describe an NPC interaction, a notable detail in the room, the weather outside, ambient sounds, or a mysterious presence. Make it feel alive and immersive. (string)

Make each location feel distinct in architecture, atmosphere, and implied region. Vary the names tonally (some warm and rustic, some mysterious, some bustling). The introHook should feel like the opening of a story, drawing the player in with vivid sensory detail.`;

/**
 * Generates up to 4 unique starting locations for a new character via the LLM.
 * @param character - The character descriptor (name, race, class).
 * @param apiKey - The LLM API key.
 * @param provider - Optional LLM provider type.
 * @param apiBase - Optional custom API base URL.
 * @returns An array of up to 4 StartingLocation objects.
 */
export async function generateStartingLocations(
  character: { name: string; race: string; class: string },
  apiKey: string,
  provider?: LLMProvider,
  apiBase?: string
): Promise<StartingLocation[]> {
  const effProvider = resolveProvider(provider, apiBase);
  const url = buildChatCompletionUrl(effProvider, apiBase);
  const headers = buildChatCompletionHeaders(effProvider, apiKey);
  const model = normalizeModelName(getEnv("VITE_LLM_MODEL") || "deepseek/deepseek-v4-flash", apiBase);

    const messages = [
    { role: 'system' as const, content: STARTING_LOCATIONS_PROMPT },
    { role: 'user' as const, content: `Generate 4 starting locations for a ${character.race} ${character.class} named ${character.name}.` }
  ];

  try {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages,
        temperature: 1.0,
        max_tokens: 8000
      })
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
      introHook: l.introHook || l.hook || "",
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
 * @returns The compressed checkpoint string, or an empty string on failure.
 */
export async function compressRawToCheckpoint(
    rawText: string,
    apiKey: string,
    model: string,
    provider?: LLMProvider,
    apiBase?: string
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

    try {
        const response = await fetchWithTimeout(url, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: effModel,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: rawText }
                ],
                temperature: 0.3,
                max_tokens: 8000
            })
        });

        if (!response.ok) {
            const errData = await safeParseJson<{ error?: { message?: string } }>(response) || {};
            throw new Error(errData.error?.message || `Checkpoint compression failed: ${response.status}`);
        }

        const data = await response.json();
        const checkpoint = data.choices?.[0]?.message?.content || "";
        const finishReason = data.choices?.[0]?.finish_reason;
        const outputTokens = data.usage?.completion_tokens ?? estimateTokens(checkpoint);
        if (!checkpoint || checkpoint.trim().length < 100 || finishReason === 'length') {
            console.warn(`[Context Pipeline] Checkpoint rejected: len=${checkpoint.length} finish=${finishReason}`);
            return "";
        }
        console.log(`[Context Pipeline] Checkpoint: ${estimateTokens(rawText)} raw → ${outputTokens} chk`);
        return checkpoint;
    } catch (e) {
        console.error("[Context Pipeline] Checkpoint compression failed:", e);
        return "";
    }
}


