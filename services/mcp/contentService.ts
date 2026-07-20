import { GameState, LoreEntry, MCPResponse } from '../../types';
import { generateId, ok } from './_shared';

export interface ContentService {
  upsert_quest(title: string, description: string, status: 'active' | 'completed' | 'failed', reputationChanges?: Array<{ faction: string; delta: number }>): Promise<MCPResponse>;
  log_lore(title: string, content: string, category: LoreEntry['category']): Promise<MCPResponse>;
}

export function createContentService(state: GameState): ContentService {
  return {
    async upsert_quest(title, description, status, reputationChanges) {
      const existingIdx = state.quests.findIndex(q => q.title.toLowerCase() === title.toLowerCase());
      if (existingIdx > -1) {
        state.quests[existingIdx] = { ...state.quests[existingIdx], description, status };
      } else {
        state.quests.push({ id: generateId(), title, description, status });
      }

      let repMsg = '';
      if (reputationChanges && (status === 'completed' || status === 'failed')) {
        const repLogs: string[] = [];
        for (const change of reputationChanges) {
          const key = change.faction.toLowerCase().trim();
          const current = state.factionReputations?.[key] ?? 0;
          const updated = Math.max(-100, Math.min(100, current + change.delta));
          if (!state.factionReputations) state.factionReputations = {};
          state.factionReputations[key] = updated;
          repLogs.push(`${change.faction}: ${current} → ${updated}`);
        }
        if (repLogs.length > 0) {
          const repStr = `Reputation changes: ${repLogs.join(', ')}`;
          state.sessionLogs.push(repStr);
          repMsg = ` [${repStr}]`;
        }
      }

      return ok({ quests: state.quests }, `Quest Log Updated: ${title} (${status})${repMsg}`);
    },

    async log_lore(title, content, category) {
      const entry: LoreEntry = { id: generateId(), title, content, category };
      state.lore.push(entry);
      return ok({ lore: state.lore }, `New Lore Entry Recorded: ${title}`);
    },
  };
}
