/**
 * services/llm/mapGeneration.ts
 * Generates a top-down battle map image using the existing ImageRouter API.
 * Follows the exact same pattern as atmosphere.ts / portrait.ts — no new packages.
 */

import { getEnv } from '../../utils/envHelper';
import { isDebugMode } from '../../utils/debug';
import { fetchWithTimeout } from './llmApiClient';
import { GameState } from '../../types/game';

/**
 * Builds a descriptive prompt for a top-down tactical battle map based on the
 * current world description, party location, and enemies present.
 */
function buildMapPrompt(state: GameState, label?: string): string {
  const location = state.party[0]?.location || label || 'dungeon room';
  const worldDesc = state.worldDescription
    ? state.worldDescription.slice(0, 200)
    : '';

  const enemyNames = (state.combat?.enemies || [])
    .filter(e => !e.isDead)
    .map(e => e.name)
    .join(', ');

  const enemyDesc = enemyNames ? ` Enemies present: ${enemyNames}.` : '';

  return (
    `Top-down tactical battle map, ${location}, ${worldDesc}.${enemyDesc} ` +
    'Fantasy RPG grid map, birds-eye view, detailed dungeon floor, stone tiles visible, ' +
    'atmospheric lighting, concept art style, dark fantasy, no tokens or counters on the map, ' +
    'just the environment and terrain, high quality, 1024x1024.'
  );
}

/**
 * Generates a battle map background image using the ImageRouter API.
 * Returns the image URL on success, or undefined on failure.
 * Uses the same VITE_IMAGE_ROUTER_API_KEY and VITE_IMAGE_MODEL env vars as atmosphere.ts.
 */
export async function generateMapImage(
  state: GameState,
  label?: string,
): Promise<string | undefined> {
  const apiKey = getEnv('VITE_IMAGE_ROUTER_API_KEY');
  const model  = getEnv('VITE_IMAGE_MODEL') || 'stabilityai/sdxl-turbo';

  if (!apiKey) {
    if (isDebugMode) {
      console.warn('[MapGeneration] Aborted: no VITE_IMAGE_ROUTER_API_KEY set.');
    }
    return undefined;
  }

  const prompt = buildMapPrompt(state, label);
  if (isDebugMode) {
    console.log('[MapGeneration] Generating map with prompt:', prompt.slice(0, 120) + '…');
  }

  try {
    const response = await fetchWithTimeout(
      'https://api.imagerouter.io/v1/openai/images/generations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          prompt,
          size: '1024x1024',
          n: 1,
        }),
      },
      30_000, // 30s timeout — image gen can be slow
    );

    if (!response.ok) {
      if (isDebugMode) {
        console.warn(`[MapGeneration] ImageRouter error: ${response.status}`);
      }
      return undefined;
    }

    const data = await response.json() as { data?: { url?: string }[] };
    const url = data?.data?.[0]?.url;
    if (isDebugMode) {
      console.log('[MapGeneration] Generated map URL:', url?.slice(0, 60) + '…');
    }
    return url;
  } catch (err) {
    if (isDebugMode) {
      console.error('[MapGeneration] Failed:', err);
    }
    return undefined;
  }
}
