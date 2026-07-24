import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockMCPServer } from '../../services/mcpService';
import { makeCharacter, makeWizard, makeBarbarian } from '../helpers/characters';
import { createTestServer } from '../helpers/testServer';
import { extractRollData } from '../../services/llm/narration';
import type { Character } from '../../types';

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
  values.forEach((v) => {
    vi.mocked(cryptoRoll).mockReturnValueOnce(v);
  });
}

describe('combatTools', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    server = createTestServer();
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

    it('message contains no literal "NaN" when stats are malformed (regression)', async () => {
      mockRoll(10);
      server.joinParty(makeCharacter({ stats: { str: undefined as unknown as number, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } }));
      await server.add_enemy('Goblin');
      await server.start_combat();
      const result = await server.player_attack('Valerius', 'Longsword', 'Goblin');
      expect(result.success).toBe(true);
      expect(result.message).not.toMatch(/\bNaN\b/);
    });

    it('message contains no literal "NaN" when stats object is missing (regression)', async () => {
      mockRoll(10);
      server.joinParty(makeCharacter({ stats: {} as Character['stats'] }));
      await server.add_enemy('Goblin');
      await server.start_combat();
      const result = await server.player_attack('Valerius', 'Longsword', 'Goblin');
      expect(result.success).toBe(true);
      expect(result.message).not.toMatch(/\bNaN\b/);
    });

    it('message contains no "undefined" AC when enemy AC missing (regression)', async () => {
      mockRoll(10);
      server.joinParty(makeCharacter());
      await server.start_combat(undefined, [{ name: 'Weird Golem', hp: 20 }]);
      const state = server.getFullState();
      expect(state.combat).toBeDefined();
      state.combat.enemies[0].ac = undefined as unknown as number;
      const result = await server.player_attack('Valerius', 'Longsword', 'Weird Golem');
      expect(result.success).toBe(true);
      expect(result.message).not.toMatch(/undefined/i);
      expect(result.message).not.toMatch(/\bNaN\b/);
    });

    it('target_name arg resolves via executeToolCall (regression)', async () => {
      mockRoll(20);
      server.joinParty(makeCharacter());
      await server.add_enemy('Goblin');
      await server.start_combat();
      const result = await server.executeToolCall('player_attack', {
        attackerId: 'Valerius',
        weaponName: 'Longsword',
        target_name: 'Goblin',
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain('Goblin');
    });

    it('target arg (third alias) resolves via executeToolCall (regression)', async () => {
      mockRoll(20);
      server.joinParty(makeCharacter());
      await server.add_enemy('Goblin');
      await server.start_combat();
      const result = await server.executeToolCall('player_attack', {
        attackerId: 'Valerius',
        weaponName: 'Longsword',
        target: 'Goblin',
      });
      expect(result.success).toBe(true);
    });

    it('empty targetId returns clean failure (regression: no silent first-enemy hit)', async () => {
      mockRoll(20);
      server.joinParty(makeCharacter());
      await server.add_enemy('Goblin');
      await server.add_enemy('Orc');
      await server.start_combat();
      const hpBeforeGoblin = server.getFullState().combat?.enemies[0].hp.current;
      const result = await server.executeToolCall('player_attack', {
        attackerId: 'Valerius',
        weaponName: 'Longsword',
        targetId: '',
      });
      expect(result.success).toBe(false);
      const stateAfter = server.getFullState();
      expect(stateAfter.combat).toBeDefined();
      expect(stateAfter.combat.enemies[0].hp.current).toBe(hpBeforeGoblin);
    });

    it('returns unified data shape with roll/attackRoll/targetAc/isHit on hit (regression)', async () => {
      mockRoll(15);
      server.joinParty(makeCharacter());
      await server.add_enemy('Goblin');
      await server.start_combat();
      const result = await server.player_attack('Valerius', 'Longsword', 'Goblin');
      expect(result.success).toBe(true);
      const d = result.data as Record<string, unknown>;
      expect(d.roll).toBe(15);
      expect(typeof d.attackRoll).toBe('number');
      expect(typeof d.targetAc).toBe('number');
      expect(d.isHit).toBe(true);
      expect(d.hit).toBe(true);
      expect(d.enemy).toBe('Goblin');
      expect(d.target).toBe('Goblin');
      expect(d.targetName).toBe('Goblin');
      expect(typeof d.targetId).toBe('string');
      expect(d.attacker).toBe('Valerius');
      expect(typeof d.damage).toBe('number');
    });

    it('returns unified data shape on miss (regression)', async () => {
      mockRoll(2);
      server.joinParty(makeCharacter({ stats: { str: 3, dex: 3, con: 10, int: 10, wis: 10, cha: 10 } }));
      await server.start_combat(undefined, [{ name: 'Heavy Knight', ac: 20, hp: 30 }]);
      const result = await server.player_attack('Valerius', 'Longsword', 'Heavy Knight');
      expect(result.success).toBe(true);
      const d = result.data as Record<string, unknown>;
      expect(d.roll).toBe(2);
      expect(typeof d.attackRoll).toBe('number');
      expect(typeof d.targetAc).toBe('number');
      expect(d.isHit).toBe(false);
      expect(d.hit).toBe(false);
      expect(d.enemy).toBe('Heavy Knight');
      expect(d.attacker).toBe('Valerius');
      expect(d.isFumble).toBe(false);
    });

    it('returns unified data shape on fumble (regression)', async () => {
      mockRoll(1);
      server.joinParty(makeCharacter());
      await server.add_enemy('Goblin');
      await server.start_combat();
      const result = await server.player_attack('Valerius', 'Longsword', 'Goblin');
      expect(result.success).toBe(true);
      const d = result.data as Record<string, unknown>;
      expect(d.roll).toBe(1);
      expect(d.isFumble).toBe(true);
      expect(d.isHit).toBe(false);
      expect(d.enemy).toBe('Goblin');
    });

    it('extractRollData produces well-formed RollData (no NaN) (regression)', async () => {
      mockRoll(15);
      server.joinParty(makeCharacter());
      await server.add_enemy('Goblin');
      await server.start_combat();
      const result = await server.player_attack('Valerius', 'Longsword', 'Goblin');
      const rollData = extractRollData('player_attack', result);
      expect(rollData).toBeDefined();
      expect(rollData?.type).toBe('attack');
      expect(rollData?.dieFace).toBe('d20');
      expect(rollData?.dieRoll).toBe(15);
      expect(Number.isNaN(rollData?.dieRoll ?? NaN)).toBe(false);
      expect(Number.isNaN(rollData?.total ?? NaN)).toBe(false);
      expect(Number.isNaN(rollData?.modifier ?? NaN)).toBe(false);
      expect(Number.isNaN(rollData?.dc ?? NaN)).toBe(false);
      expect(rollData?.success).toBe(true);
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

  describe('next_turn enemy narration, suggestions & rollData', () => {
    function loadEnemyTurnCombat(playerHp = { current: 50, max: 50 }) {
      server.loadState({
        party: [makeCharacter({ hp: playerHp })],
        worldDescription: 't', sessionLogs: [], quests: [], lore: [], actionQueue: [],
        combat: {
          isActive: true, round: 1, turnIndex: 0,
          initiative: [
            { id: 'hero-1', name: 'Valerius', initiative: 18, type: 'player', isDead: false, hasActedThisTurn: true },
            { id: 'gob-1', name: 'Goblin', initiative: 10, type: 'enemy', isDead: false, hasActedThisTurn: false },
          ],
          enemies: [{
            id: 'gob-1', name: 'Goblin', ac: 12, hp: { current: 7, max: 7 },
            attacks: [{ name: 'Scimitar', toHit: 4, damageDice: '1d6+2', damageType: 'slashing' }],
            isDead: false,
          }],
        },
      });
    }

    it('next_turn result carries engine narration, suggestions and attackResults', async () => {
      mockRoll(15); // goblin to-hit 15+4=19 vs AC 18 -> HIT; damage 15+2=17
      loadEnemyTurnCombat();
      const result = await server.next_turn();
      expect(result.success).toBe(true);
      const d = result.data as Record<string, unknown>;
      expect(typeof d.narration).toBe('string');
      expect((d.narration as string).length).toBeGreaterThan(0);
      expect((d.narration as string).toLowerCase()).toContain('goblin');
      expect(Array.isArray(d.suggestions)).toBe(true);
      expect((d.suggestions as string[]).length).toBeGreaterThan(0);
      expect(Array.isArray(d.attackResults)).toBe(true);
      expect((d.attackResults as unknown[]).length).toBeGreaterThan(0);
    });

    it('extractRollData(next_turn) returns attack + damage cards array', async () => {
      mockRoll(15);
      loadEnemyTurnCombat();
      const result = await server.next_turn();
      const rollData = extractRollData('next_turn', result);
      expect(Array.isArray(rollData)).toBe(true);
      const cards = rollData as import('../../types').RollData[];
      const attackCard = cards.find(c => c.type === 'attack');
      expect(attackCard).toBeDefined();
      expect(attackCard?.dieFace).toBe('d20');
      expect(attackCard?.dieRoll).toBe(15);
      expect(attackCard?.success).toBe(true);
      const damageCard = cards.find(c => c.type === 'damage');
      expect(damageCard).toBeDefined();
      expect(damageCard?.total).toBe(17);
    });

    it('extractRollData(next_turn) returns undefined when no enemies acted', async () => {
      // Player-to-player advance: no attackResults
      server.loadState({
        party: [makeCharacter()],
        worldDescription: 't', sessionLogs: [], quests: [], lore: [], actionQueue: [],
        combat: {
          isActive: true, round: 1, turnIndex: 0,
          initiative: [
            { id: 'hero-1', name: 'Valerius', initiative: 18, type: 'player', isDead: false, hasActedThisTurn: true },
            { id: 'hero-2', name: 'Lyra', initiative: 10, type: 'player', isDead: false, hasActedThisTurn: false },
          ],
          enemies: [],
        },
      });
      const result = await server.next_turn();
      const rollData = extractRollData('next_turn', result);
      expect(rollData).toBeUndefined();
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

  describe('concentration & condition fixes (C6/C7/M8/H3)', () => {
    it('inflict_damage breaks concentration when target drops to 0 HP (C7)', async () => {
      server.joinParty(makeWizard());
      server.getFullState().party[0].concentrationSpellId = 'bless';
      const result = await server.inflict_damage(100, 'wizard-1', 'slashing');
      expect(result.success).toBe(true);
      const after = server.getFullState().party[0];
      expect(after.hp.current).toBe(0);
      expect(after.concentrationSpellId).toBeUndefined();
    });

    it('long_rest clears concentration for an unconscious (0 HP) caster (M8)', async () => {
      server.joinParty(makeWizard({ hp: { current: 0, max: 32 } }));
      server.getFullState().party[0].concentrationSpellId = 'bless';
      await server.long_rest();
      const after = server.getFullState().party[0];
      expect(after.concentrationSpellId).toBeUndefined();
      expect(after.hp.current).toBe(0);
    });

    it('end_combat clears combat-only conditions but keeps minute/permanent (C6)', async () => {
      const char = makeCharacter();
      char.conditions = [
        { id: 'stunned', source: 'hold-person', duration: null as unknown as number },
        { id: 'mage-armor-ac', source: 'mage-armor', duration: 480, durationUnit: 'minute' },
        { id: 'exhaustion-1', source: 'fatigue', duration: -1, durationUnit: 'permanent' },
      ];
      server.loadState({
        party: [char],
        worldDescription: 't', sessionLogs: [], quests: [], lore: [], actionQueue: [],
        combat: { isActive: true, round: 1, turnIndex: 0, initiative: [], enemies: [] },
      });
      await server.end_combat();
      const ids = (server.getFullState().party[0].conditions ?? []).map(c => c.id);
      expect(ids).not.toContain('stunned');
      expect(ids).toContain('mage-armor-ac');
      expect(ids).toContain('exhaustion-1');
    });

    it('concentration expires after its round duration in combat (H3)', async () => {
      const wizard = makeWizard();
      wizard.concentrationSpellId = 'bless';
      wizard.runtime = { concentrationEffectiveDuration: 1, concentrationStartRound: 1 };
      server.loadState({
        party: [wizard],
        worldDescription: 't', sessionLogs: [], quests: [], lore: [], actionQueue: [],
        combat: {
          isActive: true, round: 11, turnIndex: 0,
          initiative: [
            { id: wizard.id, name: wizard.name, initiative: 10, type: 'player', isDead: false, hasActedThisTurn: true },
            { id: 'gob-1', name: 'Goblin', initiative: 5, type: 'enemy', isDead: false, hasActedThisTurn: true },
          ],
          enemies: [{ id: 'gob-1', name: 'Goblin', ac: 12, hp: { current: 10, max: 10 }, attacks: [], isDead: false }],
        },
      });
      await server.next_turn(false);
      expect(server.getFullState().party[0].concentrationSpellId).toBeUndefined();
    });

    it('concentration persists within duration in combat (H3)', async () => {
      const wizard = makeWizard();
      wizard.concentrationSpellId = 'bless';
      wizard.runtime = { concentrationEffectiveDuration: 10, concentrationStartRound: 1 };
      server.loadState({
        party: [wizard],
        worldDescription: 't', sessionLogs: [], quests: [], lore: [], actionQueue: [],
        combat: {
          isActive: true, round: 3, turnIndex: 0,
          initiative: [
            { id: wizard.id, name: wizard.name, initiative: 10, type: 'player', isDead: false, hasActedThisTurn: true },
            { id: 'gob-1', name: 'Goblin', initiative: 5, type: 'enemy', isDead: false, hasActedThisTurn: true },
          ],
          enemies: [{ id: 'gob-1', name: 'Goblin', ac: 12, hp: { current: 10, max: 10 }, attacks: [], isDead: false }],
        },
      });
      await server.next_turn(false);
      expect(server.getFullState().party[0].concentrationSpellId).toBe('bless');
    });
  });
});
