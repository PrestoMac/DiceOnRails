import { useEffect, useRef } from 'react';
import { GameState, AppSettings, Quest } from '../types';
import { mcpServer } from '../services/mcpService';
import { generateAtmosphere } from '../services/llm';

const COMMON_LOCATIONS = [
  'tavern', 'inn', 'dungeon entrance', 'forest path', 'cave',
  'town square', 'castle hall', 'temple', 'bridge', 'road',
];

const MAX_CONCURRENT = 2;
const COOLDOWN_MS = 30_000;

interface PrewarmState {
  inflight: Set<string>;
  lastFiredAt: Map<string, number>;
}

export function useAtmospherePrewarm(
  gameState: GameState,
  settings: AppSettings,
  enabled: boolean
) {
  const stateRef = useRef<PrewarmState>({
    inflight: new Set(),
    lastFiredAt: new Map(),
  });

  useEffect(() => {
    if (!enabled || !settings.enableAtmosphere || !gameState.party?.length) return;

    const currentLocation = gameState.party[0]?.location;
    const candidates = new Set(COMMON_LOCATIONS.filter(loc => loc !== currentLocation));
    for (const q of gameState.quests as Quest[]) {
      if (q.status !== 'active') continue;
      const m = q.description.match(/to\s+(?:the\s+)?([A-Z][\w'\- ]{2,30})/);
      if (m?.[1]) candidates.add(m[1]);
    }

    const st = stateRef.current;
    const now = Date.now();
    for (const loc of candidates) {
      if (st.inflight.size >= MAX_CONCURRENT) break;
      if (st.inflight.has(loc)) continue;
      if (now - (st.lastFiredAt.get(loc) ?? 0) < COOLDOWN_MS) continue;
      if (mcpServer.getCachedLocationImage(loc)) continue;

      st.inflight.add(loc);
      st.lastFiredAt.set(loc, now);
      generateAtmosphere(`${loc}: a moody, atmospheric fantasy scene`)
        .then((url) => { if (url) mcpServer.cacheLocationImage(loc, url); })
        .catch(e => console.warn('[Prewarm] failed:', e))
        .finally(() => { st.inflight.delete(loc); });
    }
  }, [gameState, settings, enabled]);
}
