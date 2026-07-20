import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockMCPServer } from '../../services/mcpService';
import { makeCharacter, makeWizard, makeCleric, makeBarbarian } from '../helpers/characters';

vi.mock('../../utils/random', () => ({
  cryptoRoll: vi.fn(),
}));

vi.mock('../../utils/debug', () => ({
  isDebugMode: false,
}));

vi.mock('../../services/supabaseClient', () => ({
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

const { cryptoRoll } = await import('../../utils/random');

function mockRoll(value: number) {
  vi.mocked(cryptoRoll).mockReturnValue(value);
}

function mockRollSequence(...values: number[]) {
  values.forEach((v, i) => {
    vi.mocked(cryptoRoll).mockReturnValueOnce(v);
  });
}

describe('combatTools', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cryptoRoll).mockReset();
    server = new MockMCPServer();
  });

  describe('add_enemy', () => {
    it('happy path: adds Goblin to combat state', async () => {
      const result = await server.add_enemy('Goblin');
      expect(result.success).toBe(true);
      const state = server.getFullState();
      expect(state.combat).toBeDefined();
      expect(state.combat.enemies).toHaveLength(1);
      expect(state.combat.enemies[0].name).toBe('Goblin');
    });

    it('unknown name with custom AC and HP', async () => {
      const result = await server.add_enemy('Custom Monster', 18, 50);
      expect(result.success).toBe(true);
      const state = server.getFullState();
      expect(state.combat).toBeDefined();
      const enemy = state.combat.enemies[0];
      expect(enemy.ac).toBe(18);
      expect(enemy.hp.max).toBe(50);
      expect(enemy.hp.current).toBe(50);
    });

    it('mid-combat injection updates initiative', async () => {
      mockRoll(10);
      server.joinParty(makeCharacter());
      await server.add_enemy('Goblin');
      await server.start_combat();
      const stateBefore = server.getFullState();
      expect(stateBefore.combat).toBeDefined();
      const initBefore = stateBefore.combat.initiative.length;
      await server.add_enemy('Orc');
      const stateAfter = server.getFullState();
      expect(stateAfter.combat).toBeDefined();
      expect(stateAfter.combat.enemies).toHaveLength(2);
      expect(stateAfter.combat.initiative.length).toBeGreaterThan(initBefore);
    });

    it('rejects empty name', async () => {
      const result = await server.add_enemy('');
      expect(result.success).toBe(false);
    });
  });

  describe('start_combat', () => {
    it('happy path: add_enemy then start_combat sets combat active', async () => {
      server.joinParty(makeCharacter());
      await server.add_enemy('Goblin');
      const result = await server.start_combat();
      expect(result.success).toBe(true);
      expect(server.getFullState().combat?.isActive).toBe(true);
    });

    it('rejects start_combat with no enemies', async () => {
      server.joinParty(makeCharacter());
      const result = await server.start_combat();
      expect(result.success).toBe(false);
    });

    it('rejects starting combat when already in combat (B7 fix)', async () => {
      server.joinParty(makeCharacter());
      await server.add_enemy('Goblin');
      await server.start_combat();
      const result = await server.start_combat();
      expect(result.success).toBe(false);
    });

    it('accepts enemies array parameter', async () => {
      server.joinParty(makeCharacter());
      const result = await server.start_combat(undefined, [
        { name: 'Goblin', ac: 15, hp: 7 },
        { name: 'Orc', ac: 13, hp: 15 },
      ]);
      expect(result.success).toBe(true);
      const finalState = server.getFullState();
      expect(finalState.combat).toBeDefined();
      expect(finalState.combat.enemies).toHaveLength(2);
    });
  });

  describe('next_turn', () => {
    it('happy path: advance turn after adding enemy and starting combat', async () => {
      mockRoll(10);
      server.joinParty(makeCharacter());
      await server.add_enemy('Goblin');
      await server.start_combat();
      const stateBefore = server.getFullState();
      expect(stateBefore.combat).toBeDefined();
      const turnBefore = stateBefore.combat.turnIndex;
      const result = await server.next_turn();
      expect(result.success).toBe(true);
      const stateAfter = server.getFullState();
      expect(stateAfter.combat).toBeDefined();
      expect(stateAfter.combat.turnIndex).not.toBe(turnBefore);
    });

    it('rejects next_turn outside combat', async () => {
      const result = await server.next_turn();
      expect(result.success).toBe(false);
    });

    it('round wraps when all combatants have acted', async () => {
      mockRoll(10);
      server.joinParty(makeCharacter());
      server.joinParty(makeCharacter({ id: 'hero-2', name: 'Sid' }));
      await server.add_enemy('Goblin');
      await server.start_combat();
      const state1 = server.getFullState();
      expect(state1.combat).toBeDefined();
      const round1 = state1.combat.round;
      for (let i = 0; i < 4; i++) {
        await server.next_turn();
      }
      const state2 = server.getFullState();
      expect(state2.combat).toBeDefined();
      const round2 = state2.combat.round;
      expect(round2).toBeGreaterThan(round1);
    });

    it('ends combat when all enemies are dead', async () => {
      server.joinParty(makeCharacter());
      await server.add_enemy('Goblin');
      await server.start_combat();
      const state = server.getFullState();
      expect(state.combat).toBeDefined();
      state.combat.enemies[0].isDead = true;
      state.combat.enemies[0].hp.current = 0;
      const initEntry = state.combat.initiative.find(e => e.id === state.combat.enemies[0].id);
      if (initEntry) initEntry.isDead = true;
      await server.next_turn();
      expect(server.getFullState().combat?.isActive).toBe(false);
    });
  });

  describe('player_attack', () => {
    it('hit reduces enemy HP', async () => {
      mockRoll(20);
      server.joinParty(makeCharacter());
      await server.add_enemy('Goblin');
      await server.start_combat();
      const stateBefore = server.getFullState();
      expect(stateBefore.combat).toBeDefined();
      const enemyBefore = stateBefore.combat.enemies[0].hp.current;
      await server.player_attack('Valerius', 'Longsword', 'Goblin');
      const stateAfter = server.getFullState();
      expect(stateAfter.combat).toBeDefined();
      const enemyAfter = stateAfter.combat.enemies[0].hp.current;
      expect(enemyAfter).toBeLessThan(enemyBefore);
    });

    it('uses unarmed attack when character has no weapon', async () => {
      mockRoll(20);
      server.joinParty(makeCharacter({ inventory: [] }));
      await server.add_enemy('Goblin');
      await server.start_combat();
      const stateBefore = server.getFullState();
      expect(stateBefore.combat).toBeDefined();
      const hpBefore = stateBefore.combat.enemies[0].hp.current;
      const result = await server.player_attack('Valerius', 'Unarmed', 'Goblin');
      expect(result.success).toBe(true);
      const stateAfter = server.getFullState();
      expect(stateAfter.combat).toBeDefined();
      expect(stateAfter.combat.enemies[0].hp.current).toBeLessThan(hpBefore);
    });

    it('applies sharpshooter and sneak attack feat flags', async () => {
      mockRoll(20);
      server.joinParty(makeCharacter({
        inventory: [{
          name: 'Shortbow', quantity: 1, type: 'weapon',
          stats: { damage: '1d6', damageType: 'piercing', properties: ['ranged', 'ammunition'] },
          equipped: true,
        }],
      }));
      await server.add_enemy('Goblin');
      await server.start_combat();
      const stateBefore = server.getFullState();
      expect(stateBefore.combat).toBeDefined();
      const hpBefore = stateBefore.combat.enemies[0].hp.current;
      const result = await server.player_attack('Valerius', 'Shortbow', 'Goblin', false, true, true, false);
      expect(result.success).toBe(true);
      const stateAfter = server.getFullState();
      expect(stateAfter.combat).toBeDefined();
      const damageDealt = hpBefore - stateAfter.combat.enemies[0].hp.current;
      expect(damageDealt).toBeGreaterThan(6);
    });
  });

  describe('inflict_damage', () => {
    it('reduces target HP by the given amount', async () => {
      server.joinParty(makeCharacter());
      const hpBefore = server.getFullState().party[0].hp.current;
      await server.inflict_damage(5, 'Valerius');
      const hpAfter = server.getFullState().party[0].hp.current;
      expect(hpAfter).toBe(hpBefore - 5);
    });

    it('accumulates death save failures when already at 0 HP (B6)', async () => {
      server.joinParty(makeCharacter({
        hp: { current: 0, max: 12 },
        deathSaves: { successes: 0, failures: 0, isStable: false },
      }));
      await server.inflict_damage(1, 'Valerius');
      const state = server.getFullState();
      expect(state.party[0].deathSaves?.failures).toBe(1);
    });

    it('clamps damage so HP does not go below 0', async () => {
      server.joinParty(makeCharacter({ hp: { current: 3, max: 12 } }));
      await server.inflict_damage(100, 'Valerius');
      expect(server.getFullState().party[0].hp.current).toBe(0);
    });

    it('respects damage immunity (damage becomes 0)', async () => {
      await server.add_enemy('FireElemental', 13, 30, undefined, undefined, undefined, undefined, undefined, ['fire'], ['fire']);
      const result = await server.inflict_damage(20, 'FireElemental', 'fire');
      expect(result.data.newHp).toBe(30);
    });
  });

  describe('enemy_attack', () => {
    it('hit deals damage to player', async () => {
      mockRoll(20);
      server.joinParty(makeCharacter());
      await server.add_enemy('Goblin');
      await server.start_combat();
      const hpBefore = server.getFullState().party[0].hp.current;
      await server.enemy_attack('Goblin', 'Valerius');
      const hpAfter = server.getFullState().party[0].hp.current;
      expect(hpAfter).toBeLessThan(hpBefore);
    });

    it('misses when rolling a natural 1', async () => {
      mockRoll(1);
      server.joinParty(makeCharacter());
      await server.add_enemy('Goblin');
      await server.start_combat();
      const result = await server.enemy_attack('Goblin', 'Valerius');
      expect(result.data?.isFumble).toBe(true);
    });

    it('breaks concentration when damage is taken (B4 fix)', async () => {
      mockRollSequence(15, 15, 15, 1, 2);
      server.joinParty(makeWizard());
      await server.add_enemy('Goblin');
      await server.start_combat();
      const wizard = server.getFullState().party[0];
      wizard.concentrationSpellId = 'bless';
      await server.enemy_attack('Goblin', 'Magus');
      expect(server.getFullState().party[0].concentrationSpellId).toBeUndefined();
    });

    it('skips dead enemies', async () => {
      await server.add_enemy('Goblin');
      const state = server.getFullState();
      expect(state.combat).toBeDefined();
      const goblin = state.combat.enemies[0];
      goblin.isDead = true;
      const result = await server.enemy_attack('Goblin', 'Valerius');
      expect(result.success).toBe(false);
    });
  });

  describe('integration chains', () => {
    it('cast_spell deals damage to enemies via inflict_damage', async () => {
      mockRoll(15);
      server.joinParty(makeWizard());
      await server.add_enemy('Goblin');
      await server.start_combat();
      const stateBefore = server.getFullState();
      expect(stateBefore.combat).toBeDefined();
      const hpBefore = stateBefore.combat.enemies[0].hp.current;
      await server.cast_spell('Magus', 'magic-missile', 1, ['Goblin'], { Goblin: false });
      const stateAfter = server.getFullState();
      expect(stateAfter.combat).toBeDefined();
      const hpAfter = stateAfter.combat.enemies[0].hp.current;
      expect(hpAfter).toBeLessThan(hpBefore);
    });

    it('next_turn auto-resolves enemy attacks', async () => {
      mockRoll(15);
      server.joinParty(makeCharacter());
      await server.add_enemy('Goblin');
      await server.start_combat();
      const hpBefore = server.getFullState().party[0].hp.current;
      await server.player_attack('Valerius', 'Longsword', 'Goblin');
      await server.next_turn();
      const hpAfter = server.getFullState().party[0].hp.current;
      expect(hpAfter).toBeLessThanOrEqual(hpBefore);
    });

    it('long_rest clears concentration', async () => {
      server.joinParty(makeWizard());
      const wizard = server.getFullState().party[0];
      wizard.concentrationSpellId = 'bless';
      await server.long_rest();
      expect(server.getFullState().party[0].concentrationSpellId).toBeUndefined();
    });

    it('use_resource rage breaks concentration', async () => {
      server.joinParty(makeBarbarian());
      const barb = server.getFullState().party[0];
      barb.concentrationSpellId = 'bless';
      const result = await server.use_resource('Grishnak', 'rage');
      expect(result.success).toBe(true);
      expect(server.getFullState().party[0].concentrationSpellId).toBeUndefined();
    });
  });
});
