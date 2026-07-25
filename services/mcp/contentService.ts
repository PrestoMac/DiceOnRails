import { GameState, LoreEntry, MCPResponse, QuestDifficulty } from '../../types';
import { generateId, ok } from './_shared';
import { computeXp, awardXpToParty, formatXpAwardLine } from '../xpEngine';

/** Service interface for managing quests and lore entries. */
export interface ContentService {
  upsert_quest(title: string, description: string, status: 'active' | 'completed' | 'failed', difficulty?: QuestDifficulty, reputationChanges?: Array<{ faction: string; delta: number }>): Promise<MCPResponse>;
  log_lore(title: string, content: string, category: LoreEntry['category']): Promise<MCPResponse>;
}

/** Creates a new ContentService instance operating on the given GameState. */
export function createContentService(state: GameState): ContentService {
  return {
    async upsert_quest(title, description, status, difficulty, reputationChanges) {
      const existingIdx = state.quests.findIndex(q => q.title.toLowerCase() === title.toLowerCase());
      let quest = existingIdx > -1 ? state.quests[existingIdx] : null;

      if (existingIdx > -1) {
        state.quests[existingIdx] = {
          ...state.quests[existingIdx],
          description,
          status,
          difficulty: difficulty ?? state.quests[existingIdx].difficulty,
        };
        quest = state.quests[existingIdx];
      } else {
        const newQuest = { id: generateId(), title, description, status, difficulty };
        state.quests.push(newQuest);
        quest = newQuest;
      }

      let xpMsg = '';
      if (status === 'completed' && quest && !quest.xpAwarded) {
        quest.xpAwarded = true;
        const amount = computeXp('quest', { difficulty: quest.difficulty ?? difficulty });
        const xpResult = awardXpToParty(state, amount);
        xpMsg = ' ' + formatXpAwardLine('quest', xpResult);
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

      return ok({ quests: state.quests }, `Quest Log Updated: ${title} (${status})${repMsg}${xpMsg}`);
    },

    async log_lore(title, content, category) {
      const titleKey = title.toLowerCase().trim();
      const existing = state.lore.find(e => e.title.toLowerCase().trim() === titleKey);
      if (existing) {
        return ok({ lore: state.lore, duplicate: true }, `Lore entry "${title}" already recorded.`);
      }

      const entry: LoreEntry = { id: generateId(), title, content, category };
      state.lore.push(entry);

      const amount = computeXp('lore', {});
      const xpResult = awardXpToParty(state, amount);
      const xpMsg = ' ' + formatXpAwardLine('lore', xpResult);

      return ok({ lore: state.lore }, `New Lore Entry Recorded: ${title}${xpMsg}`);
    },
  };
}
