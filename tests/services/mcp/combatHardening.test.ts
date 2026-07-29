import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockMCPServer } from '../../../services/mcpService';
import { makeCharacter, makeWizard } from '../../helpers/characters';
import { createTestServer } from '../../helpers/testServer';
import { applyCondition } from '../../../services/conditionEngine';
import { extractRollData } from '../../../services/llm/narration';

vi.mock('../../../utils/random', () => ({
  cryptoRoll: vi.fn(),
}));

vi.mock('../../../utils/debug', () => ({
  isDebugMode: false,
}));

vi.mock('../../../services/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        ilike: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    })),
  },
}));

const { cryptoRoll } = await import('../../../utils/random');

function mockRoll(value: number) {
  vi.mocked(cryptoRoll).mockReturnValue(value);
}

function mockRollSequence(...values: number[]) {
  values.forEach((v) => {
    vi.mocked(cryptoRoll).mockReturnValueOnce(v);
  });
}

describe('combat hardening (sleep race, death-save flag, save-spell breakdown)', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    server = createTestServer();
  });

  describe('resolveEnemyTurn — incapacitated/unconscious defense-in-depth', () => {
    it('an unconscious enemy skips its turn and deals no damage', async () => {
      mockRoll(10);
      const hero = makeCharacter({ hp: { current: 20, max: 20 } });
      server.joinParty(hero);
      await server.add_enemy('Goblin');
      await server.start_combat();

      const state = server.getFullState();
      expect(state.combat).toBeDefined();
      const combat = state.combat;
      if (!combat) throw new Error('Expected combat');
      const enemy = combat.enemies[0];

      // Drive the initiative pointer to the enemy and put it to sleep (as the
      // Sleep spell would). This is the exact situation the parallel-batch race
      // creates: the enemy is unconscious but next_turn's skip check already ran.
      const enemyInitIdx = combat.initiative.findIndex(e => e.id === enemy.id);
      expect(enemyInitIdx).toBeGreaterThanOrEqual(0);
      combat.turnIndex = enemyInitIdx;
      combat.initiative[enemyInitIdx].hasActedThisTurn = false;
      applyCondition(enemy, { id: 'unconscious', source: 'sleep', duration: 1, durationUnit: 'minute', saveEnd: undefined, saveDC: 0 });

      const hpBefore = hero.hp.current;
      const result = await server.resolveEnemyTurn();

      expect(result.success).toBe(true);
      expect(result.message).toMatch(/unconscious and skips its turn/i);
      // No attack was resolved against the hero.
      const stateAfter = server.getFullState();
      const heroAfter = stateAfter.party.find(c => c.id === hero.id);
      expect(heroAfter?.hp.current).toBe(hpBefore);
    });

    it('a paralyzed (incapacitated) enemy skips its turn', async () => {
      mockRoll(10);
      server.joinParty(makeCharacter({ hp: { current: 20, max: 20 } }));
      await server.add_enemy('Orc');
      await server.start_combat();

      const state = server.getFullState();
      expect(state.combat).toBeDefined();
      const combat = state.combat;
      if (!combat) throw new Error('Expected combat');
      const enemy = combat.enemies[0];
      const idx = combat.initiative.findIndex(e => e.id === enemy.id);
      combat.turnIndex = idx;
      combat.initiative[idx].hasActedThisTurn = false;
      applyCondition(enemy, { id: 'paralyzed', source: 'hold-person', duration: 1, durationUnit: 'minute', saveEnd: undefined, saveDC: 0 });

      const result = await server.resolveEnemyTurn();
      expect(result.success).toBe(true);
      expect(result.message).toMatch(/incapacitated and skips its turn/i);
    });
  });

  describe('roll_death_save — per-roll success flag', () => {
    it('marks a successful roll (>=10) as success and persists the count', async () => {
      const wizard = makeWizard({ hp: { current: 0, max: 32 } });
      server.joinParty(wizard);

      mockRoll(11); // single d20
      const result = await server.roll_death_save('wizard-1');

      expect(result.success).toBe(true);
      expect(result.message).toMatch(/Success \(1\/3\)/);
      // New per-roll flag threaded through the dispatch data.
      expect(result.data?.rollSuccess).toBe(true);
      // Persistence: the mutation landed on the shared state object (reproduces
      // the reported successes=0-after-success symptom).
      const state = server.getFullState();
      const w = state.party.find(c => c.id === 'wizard-1');
      expect(w?.deathSaves?.successes).toBe(1);

      // extractRollData feeds the DiceRollCard; it must read this roll as a success.
      const rollData = extractRollData('roll_death_save', result);
      expect(rollData?.success).toBe(true);
    });

    it('marks a failed roll (<10) as not success', async () => {
      const wizard = makeWizard({ hp: { current: 0, max: 32 } });
      server.joinParty(wizard);

      mockRoll(5);
      const result = await server.roll_death_save('wizard-1');

      expect(result.success).toBe(true);
      expect(result.data?.rollSuccess).toBe(false);
      expect(result.data?.deathSaves?.failures).toBe(1);
      const rollData = extractRollData('roll_death_save', result);
      expect(rollData?.success).toBe(false);
    });
  });

  describe('cast_spell — save-spell per-target damage breakdown', () => {
    it('burning hands reports per-target dealt damage (with save outcomes) and an accurate total', async () => {
      const wizard = makeWizard();
      server.joinParty(wizard);
      await server.add_enemy('Goblin');
      await server.add_enemy('Orc');
      await server.start_combat();

      const state0 = server.getFullState();
      expect(state0.combat).toBeDefined();
      const combat0 = state0.combat;
      if (!combat0) throw new Error('Expected combat');
      const goblin = combat0.enemies.find(e => e.name === 'Goblin');
      const orc = combat0.enemies.find(e => e.name === 'Orc');
      if (!goblin || !orc) throw new Error('Expected Goblin and Orc');
      // Give enough HP that the 12/6 damage isn't clamped at death.
      goblin.hp.max = 30; goblin.hp.current = 30;
      orc.hp.max = 30; orc.hp.current = 30;
      const goblinHpBefore = goblin.hp.current;
      const orcHpBefore = orc.hp.current;

      // Roll order for a 2-target save spell (no attack roll / no scaling):
      //   3× d6 (Goblin damage) + 3× d6 (Orc damage) + d20 (Goblin save) + d20 (Orc save)
      // Each target's 3d6 sums to 12. Goblin fails the save (full 12); Orc saves (half = 6).
      mockRollSequence(4, 4, 4, 4, 4, 4, 2, 20);
      vi.mocked(cryptoRoll).mockReturnValue(10);

      const result = await server.cast_spell('wizard-1', 'burning-hands', 1, ['Goblin', 'Orc']);

      expect(result.success).toBe(true);
      // Per-target breakdown with save outcome annotations.
      expect(result.message).toContain('Goblin 12 fire');
      expect(result.message).toContain('Orc 6 fire (saved)');
      // Accurate actually-dealt total (NOT the pre-save Σ-perTarget of 24).
      expect(result.message).toContain('(18 fire total)');
      expect(result.message).not.toContain('24 fire total');

      // The reported total matches the real HP lost across targets.
      const state1 = server.getFullState();
      const goblinLost = goblinHpBefore - (state1.combat?.enemies.find(e => e.name === 'Goblin')?.hp.current ?? goblinHpBefore);
      const orcLost = orcHpBefore - (state1.combat?.enemies.find(e => e.name === 'Orc')?.hp.current ?? orcHpBefore);
      expect(goblinLost).toBe(12);
      expect(orcLost).toBe(6);
    });
  });
});
