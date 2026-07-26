import { getEnv } from '../../utils/envHelper';
import { isDebugMode } from '../../utils/debug';
import { fetchWithTimeout } from './llmApiClient';

/** Minimal character shape needed to seed a portrait prompt. Kept narrow so the
 *  generator is decoupled from the full Character type and trivially testable. */
export interface PortraitSubject {
    name: string;
    race?: string;
    class?: string;
    appearance?: string;
}

/** Portrait-oriented style prefix. Deliberately distinct from the atmosphere
 *  prefix (which is scenery-focused): this emphasizes a single face/bust. */
const PORTRAIT_STYLE = 'Epic dark fantasy character portrait, head and shoulders, detailed face, character concept art, highly detailed, masterpiece lighting, dramatic shadows';

/** Title-cases a single word for prompt readability (race/class are stored
 *  lowercased in engine state). Falls back gracefully on empty input. */
function titleCase(word: string | undefined): string {
    if (!word) return '';
    return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Builds the image prompt from a character. Uses the free-text `appearance`
 *  description when present (highest fidelity), otherwise falls back to a
 *  minimal "name, a race class" seed (per the auto-on-creation decision). */
export function buildPortraitPrompt(subject: PortraitSubject): string {
    const appearance = subject.appearance?.trim();
    if (appearance) {
        return `${PORTRAIT_STYLE}, ${appearance}`;
    }
    const raceCls = [titleCase(subject.race), titleCase(subject.class)].filter(Boolean).join(' ');
    const npcClause = raceCls ? `, a ${raceCls} adventurer` : '';
    return `${PORTRAIT_STYLE}, "${subject.name}"${npcClause}`;
}

/**
 * Generates a character portrait image URL via the ImageRouter API.
 * @param subject - The character to portray (name/race/class/appearance).
 * @returns A URL string of the generated portrait, or undefined on failure
 *          (including when no ImageRouter API key is configured — fail-open).
 */
export async function generatePortrait(
    subject: PortraitSubject
): Promise<string | undefined> {
    const apiKey = getEnv("VITE_IMAGE_ROUTER_API_KEY");
    const model = getEnv("VITE_IMAGE_MODEL") || "stabilityai/sdxl-turbo";

    if (!apiKey) {
        if (isDebugMode) console.warn("Portrait generation aborted: No ImageRouter API Key provided in environment variables.");
        return undefined;
    }

    try {
        const prompt = buildPortraitPrompt(subject);

        const response = await fetchWithTimeout("https://api.imagerouter.io/v1/openai/images/generations", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                prompt,
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
        if (isDebugMode) console.error("Portrait generation failed:", e);
        return undefined;
    }
}
