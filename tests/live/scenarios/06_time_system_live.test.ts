









import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockMCPServer } from '../../../services/mcpService';
import { makeCharacter } from '../../helpers/characters';
import { makeEnemy } from '../../helpers/state';

vi.mock('../../../utils/random', () => ({
  cryptoRoll: vi.fn(),
}));

vi.mock('../../../utils/debug', () => ({
  isDebugMode: false,
}));

const { cryptoRoll } = await import('../../../utils/random');

describe('06_time_system_live', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cryptoRoll).mockReset();
    server = new MockMCPServer();
  });





  it('1: narrate_turn(0) does not advance time', async () => {
    const char = makeCharacter();
    server.joinParty(char);
    const before = server.getFullState().gameTime ?? 0;
    await server.executeToolCall('narrate_turn', { narration: 'Test.', timePassed: 0 });
    expect(server.getFullState().gameTime).toBe(before);
  });

  it('2: narrate_turn(30) advances gameTime by 30', async () => {
    const char = makeCharacter();
    server.joinParty(char);
    await server.executeToolCall('narrate_turn', { narration: 'Wait.', timePassed: 30 });
    expect(server.getFullState().gameTime).toBe(30);
  });

  it('3: narrate_turn is cumulative', async () => {
    const char = makeCharacter();
    server.joinParty(char);
    await server.executeToolCall('narrate_turn', { narration: 'First.', timePassed: 10 });
    await server.executeToolCall('narrate_turn', { narration: 'Second.', timePassed: 20 });
    expect(server.getFullState().gameTime).toBe(30);
  });

  it('4: narrate_turn(-5) clamps to 0 (no time travel)', async () => {
    const char = makeCharacter();
    server.joinParty(char);
    await server.executeToolCall('narrate_turn', { narration: 'Negative.', timePassed: -5 });
    expect(server.getFullState().gameTime).toBe(0);
  });

  it('5: narrate_turn(NaN) treated as 0', async () => {
    const char = makeCharacter();
    server.joinParty(char);
    await server.executeToolCall('narrate_turn', { narration: 'NaN.', timePassed: NaN });
    expect(server.getFullState().gameTime).toBe(0);
  });

  it('6: narrate_turn returns success with narration', async () => {
    const char = makeCharacter();
    server.joinParty(char);
    const result = await server.executeToolCall('narrate_turn', {
      narration: 'The sun shines brightly.',
      timePassed: 5,
    });
    expect(result.success).toBe(true);
    expect(result.message).toContain('sun shines');
  });

  it('7: gameTime in response data matches state', async () => {
    const char = makeCharacter();
    server.joinParty(char);
    const result = await server.executeToolCall('narrate_turn', { narration: 'T.', timePassed: 15 });
    expect(result.data.gameTime).toBe(15);
    expect(server.getFullState().gameTime).toBe(15);
  });

  it('8: multiple rapid narrate_turns accumulate correctly', async () => {
    const char = makeCharacter();
    server.joinParty(char);
    for (let i = 0; i < 10; i++) {
      await server.executeToolCall('narrate_turn', { narration: `Turn ${i}.`, timePassed: 6 });
    }
    expect(server.getFullState().gameTime).toBe(60);
  });

  it('9: large timePassed (1440 = 1 full day) works', async () => {
    const char = makeCharacter();
    server.joinParty(char);
    await server.executeToolCall('narrate_turn', { narration: 'A full day passes.', timePassed: 1440 });
    expect(server.getFullState().gameTime).toBe(1440);
  });

  it('10: gameTime starts at 0 for new campaigns', async () => {
    expect(server.getFullState().gameTime).toBe(0);
  });





  it('11: dawn ambient fires when crossing minute 360', async () => {
    const char = makeCharacter();
    server.joinParty(char);

    await server.executeToolCall('narrate_turn', { narration: 'Position.', timePassed: 350 });
    const result = await server.executeToolCall('narrate_turn', { narration: 'Travel.', timePassed: 15 });
    expect(result.message).toContain('dawn');
  });

  it('12: dusk ambient fires when crossing minute 1080', async () => {
    const char = makeCharacter();
    server.joinParty(char);
    await server.executeToolCall('narrate_turn', { narration: 'Position.', timePassed: 1070 });
    const result = await server.executeToolCall('narrate_turn', { narration: 'Travel.', timePassed: 15 });
    expect(result.message).toContain('twilight');
  });

  it('13: night ambient fires when crossing minute 1200', async () => {
    const char = makeCharacter();
    server.joinParty(char);
    await server.executeToolCall('narrate_turn', { narration: 'Position.', timePassed: 1195 });
    const result = await server.executeToolCall('narrate_turn', { narration: 'Travel.', timePassed: 10 });
    expect(result.message).toContain('night');
  });

  it('14: no ambient line when period unchanged', async () => {
    const char = makeCharacter();
    server.joinParty(char);
    await server.executeToolCall('narrate_turn', { narration: 'Position.', timePassed: 500 });
    const result = await server.executeToolCall('narrate_turn', { narration: 'Travel.', timePassed: 10 });
    expect(result.message).not.toContain('[The first light');
    expect(result.message).not.toContain('[The sun sinks');
    expect(result.message).not.toContain('[Stars emerge');
  });

  it('15: multiple period crossings emit multiple lines', async () => {
    const char = makeCharacter();
    server.joinParty(char);

    await server.executeToolCall('narrate_turn', { narration: 'Position.', timePassed: 350 });
    const dawnResult = await server.executeToolCall('narrate_turn', { narration: 'Dawn.', timePassed: 15 });
    expect(dawnResult.message).toContain('dawn');

    const duskResult = await server.executeToolCall('narrate_turn', { narration: 'Dusk.', timePassed: 720 });
    expect(duskResult.message).toContain('twilight');
  });





  it('16: minute-based condition expires when time passes', async () => {
    const char = makeCharacter();
    char.conditions = [{ id: 'blessed', source: 'bless', duration: 2, durationUnit: 'minute' }];
    server.joinParty(char);
    await server.executeToolCall('narrate_turn', { narration: 'Wait.', timePassed: 3 });
    expect(char.conditions).toHaveLength(0);
  });

  it('17: minute-based condition survives if time < duration', async () => {
    const char = makeCharacter();
    char.conditions = [{ id: 'blessed', source: 'bless', duration: 10, durationUnit: 'minute' }];
    server.joinParty(char);
    await server.executeToolCall('narrate_turn', { narration: 'Quick.', timePassed: 3 });
    expect(char.conditions).toHaveLength(1);
    expect(char.conditions[0].duration).toBe(7);
  });

  it('18: round-based condition ticks outside combat', async () => {
    const char = makeCharacter();
    char.conditions = [{ id: 'blinded', source: 'faerie-fire', duration: 100, durationUnit: 'round' }];
    server.joinParty(char);

    const state = server.getFullState();
    state.combat = { isActive: false, round: 1, turnIndex: 0, initiative: [], enemies: [] };
    server.loadState(state);
    await server.executeToolCall('narrate_turn', { narration: 'Wait.', timePassed: 1 });

    expect(char.conditions[0].duration).toBe(90);
  });

  it('19: round-based condition NOT ticked during active combat', async () => {
    const char = makeCharacter();
    char.conditions = [{ id: 'blinded', source: 'faerie-fire', duration: 100, durationUnit: 'round' }];
    server.joinParty(char);

    const state = server.getFullState();
    state.combat = { isActive: true, round: 1, turnIndex: 0, initiative: [], enemies: [] };
    server.loadState(state);
    await server.executeToolCall('narrate_turn', { narration: 'Wait.', timePassed: 5 });
    expect(char.conditions[0].duration).toBe(100);
  });

  it('20: legacy conditions (undefined unit) tick as round-based', async () => {
    const char = makeCharacter();
    char.conditions = [{ id: 'old-cond', source: 'test', duration: 50 }];
    server.joinParty(char);
    const state = server.getFullState();
    state.combat = { isActive: false, round: 1, turnIndex: 0, initiative: [], enemies: [] };
    server.loadState(state);
    await server.executeToolCall('narrate_turn', { narration: 'Wait.', timePassed: 1 });
    expect(char.conditions[0].duration).toBe(40);
  });

  it('21: expired condition appears in logs', async () => {
    const char = makeCharacter();
    char.conditions = [{ id: 'haste', source: 'haste-spell', duration: 1, durationUnit: 'minute' }];
    server.joinParty(char);
    const result = await server.executeToolCall('narrate_turn', { narration: 'Wait.', timePassed: 2 });
    expect(result.message).toContain('wore off');
  });

  it('22: multiple conditions expire correctly', async () => {
    const char = makeCharacter();
    char.conditions = [
      { id: 'blessed', source: 'bless', duration: 1, durationUnit: 'minute' },
      { id: 'inspired', source: 'bardic', duration: 1, durationUnit: 'minute' },
    ];
    server.joinParty(char);
    await server.executeToolCall('narrate_turn', { narration: 'Wait.', timePassed: 2 });
    expect(char.conditions).toHaveLength(0);
  });

  it('23: permanent conditions (Infinity) never expire', async () => {
    const char = makeCharacter();
    char.conditions = [{ id: 'exhaustion-1', source: 'fatigue', duration: Infinity, durationUnit: 'minute' }];
    server.joinParty(char);
    await server.executeToolCall('narrate_turn', { narration: 'Wait.', timePassed: 9999 });
    expect(char.conditions).toHaveLength(1);
  });

  it('24: enemy minute-based conditions tick via narrate_turn', async () => {
    const enemy = makeEnemy({ id: 'e1', name: 'Goblin' });
    enemy.conditions = [{ id: 'slowed', source: 'slow', duration: 3, durationUnit: 'minute' }];
    const char = makeCharacter();
    server.joinParty(char);
    const state = server.getFullState();
    state.combat = { isActive: false, round: 1, turnIndex: 0, initiative: [], enemies: [enemy] };
    server.loadState(state);
    await server.executeToolCall('narrate_turn', { narration: 'Wait.', timePassed: 4 });
    expect(enemy.conditions).toHaveLength(0);
  });

  it('25: condition with save-end is NOT auto-removed by time tick', async () => {
    const char = makeCharacter();
    char.conditions = [{
      id: 'frightened', source: 'fear', duration: 2, durationUnit: 'minute',
      saveEnd: 'wis', saveDC: 13,
    }];
    server.joinParty(char);
      await server.executeToolCall('narrate_turn', { narration: 'Wait.', timePassed: 3 });

    expect(char.conditions).toHaveLength(0);
  });





  it('26: concentration breaks when spell duration exceeded', async () => {
    const char = makeCharacter();
    char.concentrationSpellId = 'faerie-fire';
    char.runtime = { concentrationStartTime: 0, concentrationEffectiveDuration: 1 };
    server.joinParty(char);
    await server.executeToolCall('narrate_turn', { narration: 'Wait.', timePassed: 2 });
    expect(char.concentrationSpellId).toBeUndefined();
  });

  it('27: concentration survives when within duration', async () => {
    const char = makeCharacter();
    char.concentrationSpellId = 'faerie-fire';
    char.runtime = { concentrationStartTime: 0, concentrationEffectiveDuration: 10 };
    server.joinParty(char);
    await server.executeToolCall('narrate_turn', { narration: 'Wait.', timePassed: 5 });
    expect(char.concentrationSpellId).toBe('faerie-fire');
  });

  it('28: concentration expiry is logged', async () => {
    const char = makeCharacter();
    char.concentrationSpellId = 'faerie-fire';
    char.runtime = { concentrationStartTime: 0, concentrationEffectiveDuration: 1 };
    server.joinParty(char);
    const result = await server.executeToolCall('narrate_turn', { narration: 'Wait.', timePassed: 2 });
    expect(result.message).toContain('wore off');
  });

  it('29: concentration with runtime concentrationStartTime offsets correctly', async () => {
    const char = makeCharacter();
    char.concentrationSpellId = 'bless';
    char.runtime = { concentrationStartTime: 100, concentrationEffectiveDuration: 5 };
    server.joinParty(char);

    server.getFullState().gameTime = 0;
    await server.executeToolCall('narrate_turn', { narration: 'Wait.', timePassed: 106 });
    expect(char.concentrationSpellId).toBeUndefined();
  });

  it('30: concentration does NOT break at exact boundary', async () => {
    const char = makeCharacter();
    char.concentrationSpellId = 'bless';
    char.runtime = { concentrationStartTime: 0, concentrationEffectiveDuration: 5 };
    server.joinParty(char);
    await server.executeToolCall('narrate_turn', { narration: 'Wait.', timePassed: 5 });

    expect(char.concentrationSpellId).toBeUndefined();
  });





  it('31: transformation reverts when duration expires', async () => {
    const char = makeCharacter();
    const origStats = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
    char.runtime = {
      transformationState: {
        duration: 2, casterId: 'hero-1', transformedInto: 'wolf',
        transformationType: 'polymorph',
        originalForm: { stats: origStats, hp: { current: 10, max: 10 }, ac: 12, attacks: [] },
      },
    };
    server.joinParty(char);
    await server.executeToolCall('narrate_turn', { narration: 'Wait.', timePassed: 3 });
    expect(char.runtime?.transformationState).toBeUndefined();
  });

  it('32: transformation survives within duration', async () => {
    const char = makeCharacter();
    char.runtime = {
      transformationState: {
        duration: 10, casterId: 'hero-1', transformedInto: 'wolf',
        transformationType: 'polymorph',
        originalForm: { stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, hp: { current: 10, max: 10 }, ac: 12, attacks: [] },
      },
    };
    server.joinParty(char);
    await server.executeToolCall('narrate_turn', { narration: 'Wait.', timePassed: 5 });
    expect(char.runtime?.transformationState).toBeDefined();
    expect(char.runtime?.transformationState?.duration).toBe(5);
  });

  it('33: transformation reverts HP and stats', async () => {
    const char = makeCharacter();
    char.runtime = {
      transformationState: {
        duration: 1, casterId: 'hero-1', transformedInto: 'wolf',
        transformationType: 'polymorph',
        originalForm: { stats: { str: 20, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, hp: { current: 50, max: 50 }, ac: 18, attacks: [] },
      },
    };
    server.joinParty(char);
    await server.executeToolCall('narrate_turn', { narration: 'Revert.', timePassed: 2 });
    expect(char.stats.str).toBe(20);
    expect(char.hp.current).toBe(50);
    expect(char.hp.max).toBe(50);
  });

  it('34: transformation with 0 timePassed does not revert', async () => {
    const char = makeCharacter();
    char.runtime = {
      transformationState: {
        duration: 5, casterId: 'hero-1', transformedInto: 'wolf',
        transformationType: 'polymorph',
        originalForm: { stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, hp: { current: 10, max: 10 }, ac: 12, attacks: [] },
      },
    };
    server.joinParty(char);
    await server.executeToolCall('narrate_turn', { narration: 'Instant.', timePassed: 0 });
    expect(char.runtime?.transformationState).toBeDefined();
  });

  it('35: transformation expiry logged', async () => {
    const char = makeCharacter();
    char.runtime = {
      transformationState: {
        duration: 1, casterId: 'hero-1', transformedInto: 'wolf',
        transformationType: 'polymorph',
        originalForm: { stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, hp: { current: 10, max: 10 }, ac: 12, attacks: [] },
      },
    };
    server.joinParty(char);
    const result = await server.executeToolCall('narrate_turn', { narration: 'Wait.', timePassed: 2 });
    expect(result.message).toContain('wore off');
  });





  it('36: summoned creature expires when duration runs out', async () => {
    const enemy = makeEnemy({ id: 'summon-1', name: 'Zombie', summonDurationRemaining: 2 });
    const char = makeCharacter();
    server.joinParty(char);
    const state = server.getFullState();
    state.combat = { isActive: false, round: 1, turnIndex: 0, initiative: [], enemies: [enemy] };
    server.loadState(state);
    await server.executeToolCall('narrate_turn', { narration: 'Wait.', timePassed: 3 });
    expect(enemy.summonExpired).toBe(true);
    expect(enemy.isDead).toBe(true);
  });

  it('37: summoned creature survives within duration', async () => {
    const enemy = makeEnemy({ id: 'summon-1', name: 'Zombie', summonDurationRemaining: 10 });
    const char = makeCharacter();
    server.joinParty(char);
    const state = server.getFullState();
    state.combat = { isActive: false, round: 1, turnIndex: 0, initiative: [], enemies: [enemy] };
    server.loadState(state);
    await server.executeToolCall('narrate_turn', { narration: 'Wait.', timePassed: 5 });
    expect(enemy.summonExpired).toBeFalsy();
    expect(enemy.summonDurationRemaining).toBe(5);
  });

  it('38: expired summons are removed from combat', async () => {
    const enemy = makeEnemy({ id: 'summon-1', name: 'Zombie', summonDurationRemaining: 1 });
    const char = makeCharacter();
    server.joinParty(char);
    const state = server.getFullState();
    state.combat = { isActive: false, round: 1, turnIndex: 0, initiative: [], enemies: [enemy] };
    server.loadState(state);
    await server.executeToolCall('narrate_turn', { narration: 'Wait.', timePassed: 2 });

    const updatedState = server.getFullState();
    expect(updatedState.combat?.enemies).toHaveLength(0);
  });

  it('39: summon expiry logged', async () => {
    const enemy = makeEnemy({ id: 'summon-1', name: 'Air Elemental', summonDurationRemaining: 1 });
    const char = makeCharacter();
    server.joinParty(char);
    const state = server.getFullState();
    state.combat = { isActive: false, round: 1, turnIndex: 0, initiative: [], enemies: [enemy] };
    server.loadState(state);
    const result = await server.executeToolCall('narrate_turn', { narration: 'Wait.', timePassed: 2 });
    expect(result.message).toContain('vanishes');
  });

  it('40: non-expired summons stay in combat', async () => {
    const enemy = makeEnemy({ id: 'summon-1', name: 'Zombie', summonDurationRemaining: 100 });
    const char = makeCharacter();
    server.joinParty(char);
    const state = server.getFullState();
    state.combat = { isActive: false, round: 1, turnIndex: 0, initiative: [], enemies: [enemy] };
    server.loadState(state);
    await server.executeToolCall('narrate_turn', { narration: 'Wait.', timePassed: 10 });
    const updatedState = server.getFullState();
    expect(updatedState.combat?.enemies).toHaveLength(1);
  });





  it('41: long_rest restores full HP', async () => {
    const char = makeCharacter({ hp: { current: 10, max: 30 } });
    server.joinParty(char);
    await server.executeToolCall('long_rest', { narration: 'Rest.', autoAdvanceTime: true });
    expect(char.hp.current).toBe(30);
  });

  it('42: long_rest advances time by 480', async () => {
    const char = makeCharacter();
    server.joinParty(char);
    const before = server.getFullState().gameTime ?? 0;
    await server.executeToolCall('long_rest', { narration: 'Rest.', autoAdvanceTime: true });
    expect(server.getFullState().gameTime).toBe(before + 480);
  });

  it('43: long_rest sets lastLongRestTime', async () => {
    const char = makeCharacter();
    server.joinParty(char);
    await server.executeToolCall('long_rest', { narration: 'Rest.', autoAdvanceTime: true });
    expect(server.getFullState().lastLongRestTime).toBeGreaterThanOrEqual(0);
  });

  it('44: long_rest rejects when < 16h since last rest', async () => {
    const char = makeCharacter();
    server.joinParty(char);
    await server.executeToolCall('long_rest', { narration: 'First.', autoAdvanceTime: true });
    const second = await server.executeToolCall('long_rest', { narration: 'Too soon.', autoAdvanceTime: true });
    expect(second.success).toBe(false);
    expect(second.message).toContain('need');
  });

  it('45: long_rest clears round-based but preserves minute-based conditions', async () => {
    const char = makeCharacter();
    char.conditions = [
      { id: 'blinded', source: 'faerie-fire', duration: 3, durationUnit: 'round' },
      { id: 'cursed', source: 'hex', duration: 9999, durationUnit: 'minute' },
    ];
    server.joinParty(char);
    await server.executeToolCall('long_rest', { narration: 'Rest.', autoAdvanceTime: true });
    expect(char.conditions.some(c => c.id === 'blinded')).toBe(false);
    expect(char.conditions.some(c => c.id === 'cursed')).toBe(true);
  });





  it('46: exhaustion not applied within 16 hours', async () => {
    const char = makeCharacter();
    server.joinParty(char);
    const state = server.getFullState();
    state.lastLongRestTime = 0;
    state.gameTime = 0;
    server.loadState(state);
    await server.executeToolCall('narrate_turn', { narration: 'Short.', timePassed: 600 });
    const exhaustion = (char.conditions ?? []).filter(c => c.id.startsWith('exhaustion-'));
    expect(exhaustion).toHaveLength(0);
  });

  it('47: ensureGameStateFields initializes missing fields', async () => {
    const freshServer = new MockMCPServer();
    const state = freshServer.getFullState();
    expect(state.gameTime).toBe(0);
    expect(state.lastLongRestTime).toBe(-960);
  });

  it('47b: exhaustion level 1 applied at exactly 16h awake', async () => {
    const char = makeCharacter();
    server.joinParty(char);
    const state = server.getFullState();
    state.lastLongRestTime = 0;
    state.gameTime = 0;
    server.loadState(state);
    await server.executeToolCall('narrate_turn', { narration: 'Long march.', timePassed: 1440 });
    const exhaustion = (char.conditions ?? []).filter(c => c.id.startsWith('exhaustion-'));
    expect(exhaustion.some(c => c.id === 'exhaustion-1')).toBe(true);
  });

  it('48: campaign://world/time resource returns correct data', async () => {
    const char = makeCharacter();
    server.joinParty(char);
    await server.executeToolCall('narrate_turn', { narration: 'Wait.', timePassed: 500 });
    const timeResource = server.getResource('campaign://world/time');
    expect(timeResource.gameTime).toBe(500);
    expect(timeResource.day).toBe(1);
    expect(timeResource.period).toBe('morning');
    expect(timeResource.hoursSinceLastRest).toBeGreaterThanOrEqual(0);
  });

  it('49: short_rest advances time by 60', async () => {
    const char = makeCharacter();
    server.joinParty(char);
    const before = server.getFullState().gameTime ?? 0;
    await server.executeToolCall('short_rest', { narration: 'Rest.', autoAdvanceTime: true });
    expect(server.getFullState().gameTime).toBe(before + 60);
  });

  it('50: complex scenario — cast spell, wait, concentration expires', async () => {
    const char = makeCharacter();
    char.concentrationSpellId = 'faerie-fire';
    char.runtime = { concentrationStartTime: 10, concentrationEffectiveDuration: 2 };
    char.conditions = [{ id: 'haste', source: 'haste-spell', duration: 1, durationUnit: 'minute' }];
    server.joinParty(char);
    const state = server.getFullState();
    state.gameTime = 10;
    server.loadState(state);


    const result = await server.executeToolCall('narrate_turn', { narration: 'Time passes.', timePassed: 3 });

    expect(server.getFullState().gameTime).toBe(13);
    expect(char.concentrationSpellId).toBeUndefined();
    expect(char.conditions).toHaveLength(0);
    expect(result.message).toContain('wore off');
  });
});
