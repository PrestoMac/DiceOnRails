import { describe, it, expect, beforeEach } from 'vitest';
import { MockMCPServer } from '../../services/mcpService';
import { makeCharacter } from '../helpers/characters';

describe('questingTools', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    server = new MockMCPServer();
  });

  describe('upsert_quest', () => {
    it('create new quest - appears in quests', async () => {
      const result = await server.upsert_quest('Save the Town', 'Defeat the goblins', 'active');
      expect(result.success).toBe(true);
      const state = server.getFullState();
      expect(state.quests).toHaveLength(1);
      expect(state.quests[0].title).toBe('Save the Town');
      expect(state.quests[0].status).toBe('active');
    });

    it('update existing (by title case-insensitive) - fields updated', async () => {
      await server.upsert_quest('Save the Town', 'Original', 'active');
      const result = await server.upsert_quest('save the town', 'Updated description', 'completed');
      expect(result.success).toBe(true);
      const state = server.getFullState();
      expect(state.quests).toHaveLength(1);
      expect(state.quests[0].description).toBe('Updated description');
      expect(state.quests[0].status).toBe('completed');
    });

    it('reputation changes on completion - factionReputations changes', async () => {
      await server.upsert_quest('Help Village', 'Protect the village from raiders', 'completed', [
        { faction: 'Villagers', delta: 15 },
        { faction: 'Raiders', delta: -10 },
      ]);
      const state = server.getFullState();
      expect(state.factionReputations).toBeDefined();
      expect(state.factionReputations?.['villagers']).toBe(15);
      expect(state.factionReputations?.['raiders']).toBe(-10);
    });

    it('duplicate title - updates existing quest silently', async () => {
      await server.upsert_quest('Quest A', 'First', 'active');
      const result = await server.upsert_quest('Quest A', 'Second', 'failed');
      expect(result.success).toBe(true);
      const state = server.getFullState();
      expect(state.quests).toHaveLength(1);
      expect(state.quests[0].status).toBe('failed');
    });

    it('empty title - creates quest with empty title', async () => {
      const result = await server.upsert_quest('', 'Desc', 'active');
      expect(result.success).toBe(true);
      const state = server.getFullState();
      expect(state.quests).toHaveLength(1);
    });
  });

  describe('log_lore', () => {
    it('add entry - appears in lore array', async () => {
      const result = await server.log_lore('Ancient Dragon', 'A great wyrm sleeps beneath the mountain', 'NPC');
      expect(result.success).toBe(true);
      const state = server.getFullState();
      expect(state.lore).toHaveLength(1);
      expect(state.lore[0].title).toBe('Ancient Dragon');
    });

    it('valid categories: NPC, Location, History, Item', async () => {
      const categories = ['NPC', 'Location', 'History', 'Item'] as const;
      for (const cat of categories) {
        const result = await server.log_lore(`Entry-${cat}`, `Content for ${cat}`, cat);
        expect(result.success).toBe(true);
      }
      const state = server.getFullState();
      expect(state.lore).toHaveLength(4);
    });

    it('duplicate title - adds duplicate (no uniqueness enforcement)', async () => {
      await server.log_lore('Same Title', 'First', 'NPC');
      const result = await server.log_lore('Same Title', 'Second', 'NPC');
      expect(result.success).toBe(true);
      const state = server.getFullState();
      expect(state.lore).toHaveLength(2);
    });

    it('empty content - entry created with empty content', async () => {
      const result = await server.log_lore('Empty Entry', '', 'History');
      expect(result.success).toBe(true);
      const state = server.getFullState();
      expect(state.lore).toHaveLength(1);
      expect(state.lore[0].content).toBe('');
    });
  });

  describe('narrate_turn', () => {
    it('advances gameTime by timePassed parameter', async () => {
      server.joinParty(makeCharacter());
      const before = server.getFullState().gameTime ?? 0;
      await server.narrate_turn('A moment passes...', 10);
      expect(server.getFullState().gameTime).toBe(before + 10);
    });

    it('zero time passed - no time advance', async () => {
      server.joinParty(makeCharacter());
      const before = server.getFullState().gameTime ?? 0;
      await server.narrate_turn('Nothing happens', 0);
      expect(server.getFullState().gameTime).toBe(before);
    });

    it('result message contains narration', async () => {
      server.joinParty(makeCharacter());
      const result = await server.narrate_turn('The party gazes at the stars.', 5);
      expect(result.success).toBe(true);
      expect(result.message).toContain('gazes at the stars');
    });

    it.each([
      { hoursAwake: 16, level: 1, totalMinutes: 1440 },
      { hoursAwake: 18, level: 2, totalMinutes: 1560 },
    ])('applies exhaustion level $level at $hoursAwake hours awake ($totalMinutes min)', async ({ totalMinutes, level }) => {
      server.joinParty(makeCharacter());
      await server.long_rest();
      await server.narrate_turn('Walking for hours...', totalMinutes);
      const { hasCondition } = await import('../../services/conditionEngine');
      const updated = server.getTarget();
      expect(updated).toBeDefined();
      expect(hasCondition(updated, `exhaustion-${level}`)).toBe(true);
    });

    it('caps travel-fatigue at MAX_SAFE_EXHAUSTION regardless of awake hours', async () => {
      server.joinParty(makeCharacter());
      await server.long_rest();
      await server.narrate_turn('An epic march...', 2880);
      const { hasCondition } = await import('../../services/conditionEngine');
      const updated = server.getTarget();
      expect(updated).toBeDefined();
      expect(hasCondition(updated, 'exhaustion-1')).toBe(true);
      expect(hasCondition(updated, 'exhaustion-2')).toBe(true);
      expect(hasCondition(updated, 'exhaustion-3')).toBe(false);
    });

    it.each([
      { hoursBefore: 1, totalMinutes: 1439, level: 1 },
      { hoursBefore: 1, totalMinutes: 1559, level: 2 },
    ])('does not apply exhaustion level $level at $hoursBefore min before threshold', async ({ totalMinutes, level }) => {
      server.joinParty(makeCharacter());
      await server.long_rest();
      await server.narrate_turn('Almost there...', totalMinutes);
      const { hasCondition } = await import('../../services/conditionEngine');
      const updated = server.getTarget();
      expect(updated).toBeDefined();
      expect(hasCondition(updated, `exhaustion-${level}`)).toBe(false);
    });

    it('negative timePassed clamped to 0', async () => {
      server.joinParty(makeCharacter());
      const before = server.getFullState().gameTime ?? 0;
      const result = await server.narrate_turn('Time stands still.', -50);
      expect(result.success).toBe(true);
      expect(result.data.timePassed).toBe(0);
      expect(server.getFullState().gameTime).toBe(before);
    });

    it('excessive timePassed handled gracefully', async () => {
      server.joinParty(makeCharacter());
      const result = await server.narrate_turn('Ages pass...', 10080);
      expect(result.success).toBe(true);
      expect(result.data.timePassed).toBe(10080);
    });

    it('mid-combat narrate_turn advances gameTime', async () => {
      server.joinParty(makeCharacter({ id: 'hero-1', name: 'Valerius', hp: { current: 12, max: 12 } }));
      await server.add_enemy('Goblin');
      await server.start_combat();
      const before = server.getFullState().gameTime ?? 0;
      await server.narrate_turn('Combat continues...', 10);
      expect(server.getFullState().gameTime).toBeGreaterThan(before);
    });
  });
});
