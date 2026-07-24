import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTravelService, TravelService } from '../../services/mcp/travelService';
import { GameState, Character } from '../../types';
import { makeGameState, makeEnemy } from '../helpers/state';

vi.mock('../../utils/random', () => ({
  cryptoRoll: vi.fn(),
}));

vi.mock('../../utils/debug', () => ({
  isDebugMode: false,
}));

vi.mock('../../services/progressionService', () => ({
  awardExperience: vi.fn(() => ({ character: {}, leveledUp: false })),
}));

const { cryptoRoll } = await import('../../utils/random');

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    id: 'hero-1',
    name: 'Test Hero',
    class: 'fighter',
    race: 'human',
    level: 3,
    hp: { current: 25, max: 30 },
    stats: { str: 14, dex: 12, con: 13, int: 10, wis: 11, cha: 10 },
    ac: 16,
    speed: 30,
    inventory: [],
    currency: { gp: 10, sp: 0, cp: 0 },
    location: 'Test Location',
    experience: 0,
    experienceToNextLevel: 900,
    unusedStatPoints: 0,
    maxHpBonus: 0,
    hitDice: { current: 3, max: 3 },
    conditions: [],
    ...overrides,
  };
}

describe('travelService — narrate_turn', () => {
  let state: GameState;
  let service: TravelService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cryptoRoll).mockReset();
    state = makeGameState({ gameTime: 0, lastLongRestTime: -960 });
    service = createTravelService(state, {
      getTarget: (id) => state.party.find(c => c.id === id),
      adjust_currency: vi.fn(async () => ({ success: true, message: '', data: {} })),
      update_inventory: vi.fn(async () => ({ success: true, message: '', data: {} })),
      log_lore: vi.fn(async () => ({ success: true, message: '', data: {} })),
      upsert_quest: vi.fn(async () => ({ success: true, message: '', data: {} })),
    });
  });

  describe('time advancement', () => {
    it('does not advance time when timePassed is 0', async () => {
      state.party.push(makeChar());
      await service.narrate_turn('Hello.', 0);
      expect(state.gameTime).toBe(0);
    });

    it('advances gameTime by timePassed', async () => {
      state.party.push(makeChar());
      await service.narrate_turn('You wait.', 30);
      expect(state.gameTime).toBe(30);
    });

    it('advances gameTime cumulatively', async () => {
      state.party.push(makeChar());
      await service.narrate_turn('First.', 10);
      await service.narrate_turn('Second.', 20);
      expect(state.gameTime).toBe(30);
    });

    it('clamps negative timePassed to 0', async () => {
      state.party.push(makeChar());
      await service.narrate_turn('Negative.', -10);
      expect(state.gameTime).toBe(0);
    });

    it('handles NaN timePassed as 0', async () => {
      state.party.push(makeChar());
      await service.narrate_turn('NaN.', NaN);
      expect(state.gameTime).toBe(0);
    });

    it('handles undefined timePassed as 0', async () => {
      state.party.push(makeChar());
      await service.narrate_turn('Undefined.');
      expect(state.gameTime).toBe(0);
    });

    it('returns success with narration', async () => {
      state.party.push(makeChar());
      const result = await service.narrate_turn('The sun shines.', 5);
      expect(result.success).toBe(true);
      expect(result.message).toContain('The sun shines.');
    });

    it('includes timePassed and gameTime in data', async () => {
      state.party.push(makeChar());
      const result = await service.narrate_turn('Test.', 15);
      expect(result.data.timePassed).toBe(15);
      expect(result.data.gameTime).toBe(15);
    });
  });

  describe('ambient time-of-day transitions', () => {
    it('emits dawn line when crossing into dawn (360 min)', async () => {
      state.party.push(makeChar());
      state.gameTime = 350;
      const result = await service.narrate_turn('Travel.', 15);
      expect(result.message).toContain('dawn');
    });

    it('emits dusk line when crossing into dusk (1080 min)', async () => {
      state.party.push(makeChar());
      state.gameTime = 1070;
      const result = await service.narrate_turn('Travel.', 15);
      expect(result.message).toContain('twilight');
    });

    it('emits night line when crossing into night (1200 min)', async () => {
      state.party.push(makeChar());
      state.gameTime = 1195;
      const result = await service.narrate_turn('Travel.', 10);
      expect(result.message).toContain('night');
    });

    it('does not emit ambient line when period does not change', async () => {
      state.party.push(makeChar());
      state.gameTime = 500;
      const result = await service.narrate_turn('Travel.', 10);
      expect(result.message).not.toContain('[The first light');
      expect(result.message).not.toContain('[The sun sinks');
      expect(result.message).not.toContain('[Stars emerge');
    });
  });

  describe('condition ticking', () => {
    it('expires minute-based conditions when time passes', async () => {
      const char = makeChar();
      char.conditions = [{ id: 'blessed', source: 'bless', duration: 2, durationUnit: 'minute' }];
      state.party.push(char);
      await service.narrate_turn('Time passes.', 3);
      expect(char.conditions).toHaveLength(0);
      expect(state.gameTime).toBe(3);
    });

    it('does not expire minute-based conditions when timePassed is 0', async () => {
      const char = makeChar();
      char.conditions = [{ id: 'blessed', source: 'bless', duration: 5, durationUnit: 'minute' }];
      state.party.push(char);
      await service.narrate_turn('Instant.', 0);
      expect(char.conditions).toHaveLength(1);
    });

    it('ticks round-based conditions when outside combat', async () => {
      const char = makeChar();
      char.conditions = [{ id: 'blinded', source: 'faerie-fire', duration: 50, durationUnit: 'round' }];
      state.party.push(char);
      state.combat = { isActive: false, round: 1, turnIndex: 0, initiative: [], enemies: [] };
      await service.narrate_turn('Time passes.', 1);

      expect(char.conditions[0].duration).toBe(40);
    });

    it('does not tick round-based conditions during active combat', async () => {
      const char = makeChar();
      char.conditions = [{ id: 'blinded', source: 'faerie-fire', duration: 5, durationUnit: 'round' }];
      state.party.push(char);
      state.combat = { isActive: true, round: 1, turnIndex: 0, initiative: [], enemies: [] };
      await service.narrate_turn('Time passes.', 5);
      expect(char.conditions[0].duration).toBe(5);
    });

    it('includes expiry info in logs', async () => {
      const char = makeChar();
      char.conditions = [{ id: 'haste', source: 'haste-spell', duration: 1, durationUnit: 'minute' }];
      state.party.push(char);
      const result = await service.narrate_turn('Time passes.', 2);
      expect(result.message).toContain('wore off');
    });
  });

  describe('concentration expiry', () => {
    it('breaks concentration when spell duration exceeded', async () => {
      const char = makeChar();
      char.concentrationSpellId = 'faerie-fire';
      char.runtime = { concentrationStartTime: 0, concentrationEffectiveDuration: 1 };
      state.party.push(char);
      await service.narrate_turn('Time passes.', 2);
      expect(char.concentrationSpellId).toBeUndefined();
    });

    it('does not break concentration when within duration', async () => {
      const char = makeChar();
      char.concentrationSpellId = 'faerie-fire';
      char.runtime = { concentrationStartTime: 0, concentrationEffectiveDuration: 5 };
      state.party.push(char);
      await service.narrate_turn('Time passes.', 2);
      expect(char.concentrationSpellId).toBe('faerie-fire');
    });
  });

  describe('transformation expiry', () => {
    it('reverts transformation when duration expires', async () => {
      const char = makeChar();
      const origStats = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
      char.runtime = {
        transformationState: {
          duration: 2,
          casterId: 'hero-1',
          transformedInto: 'wolf',
          transformationType: 'polymorph',
          originalForm: { stats: origStats, hp: { current: 10, max: 10 }, ac: 12, attacks: [] },
        },
      };
      state.party.push(char);
      await service.narrate_turn('Time passes.', 3);
      expect(char.runtime?.transformationState).toBeUndefined();
    });

    it('does not revert transformation when within duration', async () => {
      const char = makeChar();
      char.runtime = {
        transformationState: {
          duration: 5,
          casterId: 'hero-1',
          transformedInto: 'wolf',
          transformationType: 'polymorph',
          originalForm: { stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, hp: { current: 10, max: 10 }, ac: 12, attacks: [] },
        },
      };
      state.party.push(char);
      await service.narrate_turn('Time passes.', 2);
      expect(char.runtime?.transformationState).toBeDefined();
      expect(char.runtime?.transformationState?.duration).toBe(3);
    });
  });

  describe('summon expiry', () => {
    it('marks summoned creature as expired when duration runs out', async () => {
      const enemy = makeEnemy({ summonDurationRemaining: 2 });
      state.combat = { isActive: false, round: 1, turnIndex: 0, initiative: [], enemies: [enemy] };
      state.party.push(makeChar());
      await service.narrate_turn('Time passes.', 3);
      expect(enemy.summonExpired).toBe(true);
      expect(enemy.isDead).toBe(true);
    });

    it('filters out expired summons from combat', async () => {
      const enemy = makeEnemy({ summonDurationRemaining: 1, summonExpired: false });
      state.combat = { isActive: false, round: 1, turnIndex: 0, initiative: [], enemies: [enemy] };
      state.party.push(makeChar());
      await service.narrate_turn('Time passes.', 2);
      expect(state.combat.enemies).toHaveLength(0);
    });
  });

  describe('enemy condition ticking', () => {
    it('ticks enemy minute-based conditions', async () => {
      const enemy = makeEnemy();
      enemy.conditions = [{ id: 'slowed', source: 'slow-spell', duration: 3, durationUnit: 'minute' }];
      state.combat = { isActive: false, round: 1, turnIndex: 0, initiative: [], enemies: [enemy] };
      state.party.push(makeChar());
      await service.narrate_turn('Time passes.', 4);
      expect(enemy.conditions).toHaveLength(0);
    });
  });

  describe('exhaustion from sleep deprivation', () => {
    it('applies exhaustion-1 after 16 hours awake', async () => {
      const char = makeChar();
      state.party.push(char);
      state.lastLongRestTime = 0;
      state.gameTime = 0;



      await service.narrate_turn('Long time.', 1440);
      expect(char.conditions?.some(c => c.id === 'exhaustion-1')).toBe(true);
    });

    it('does not apply exhaustion within 16 hours', async () => {
      const char = makeChar();
      state.party.push(char);
      state.lastLongRestTime = 0;
      state.gameTime = 0;
      await service.narrate_turn('Short time.', 600);
      expect(char.conditions?.some(c => c.id.startsWith('exhaustion-'))).toBe(false);
    });
  });

  describe('ensureGameStateFields initialization', () => {
    it('initializes gameTime to 0 if missing', async () => {
      delete state.gameTime;
      state.party.push(makeChar());
      await service.narrate_turn('Init.', 5);
      expect(state.gameTime).toBe(5);
    });

    it('initializes lastLongRestTime to -960 if missing', async () => {
      delete state.lastLongRestTime;
      state.party.push(makeChar());
      await service.narrate_turn('Init.', 5);
      expect(state.lastLongRestTime).toBe(-960);
    });

    it('repairs NaN gameTime to 0', async () => {
      state.gameTime = Number.NaN;
      state.party.push(makeChar());
      await service.narrate_turn('Repair.', 5);
      expect(state.gameTime).toBe(5);
    });

    it('repairs negative gameTime to 0', async () => {
      state.gameTime = -100;
      state.party.push(makeChar());
      await service.narrate_turn('Repair.', 5);
      expect(state.gameTime).toBe(5);
    });
  });
});

describe('travelService — long_rest', () => {
  let state: GameState;
  let service: TravelService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cryptoRoll).mockReset();
    state = makeGameState({ gameTime: 0, lastLongRestTime: -960 });
    service = createTravelService(state, {
      getTarget: (id) => state.party.find(c => c.id === id),
      adjust_currency: vi.fn(async () => ({ success: true, message: '', data: {} })),
      update_inventory: vi.fn(async () => ({ success: true, message: '', data: {} })),
      log_lore: vi.fn(async () => ({ success: true, message: '', data: {} })),
      upsert_quest: vi.fn(async () => ({ success: true, message: '', data: {} })),
    });
  });

  it('restores full HP on long rest', async () => {
    const char = makeChar({ hp: { current: 10, max: 30 } });
    state.party.push(char);
    const result = await service.long_rest('Resting.');
    expect(result.success).toBe(true);
    expect(char.hp.current).toBe(30);
  });

  it('updates lastLongRestTime', async () => {
    state.party.push(makeChar());
    await service.long_rest('Resting.', true);


    expect(state.lastLongRestTime).toBe(0);
    expect(state.gameTime).toBe(480);
  });

  it('advances time by 480 minutes when autoAdvanceTime', async () => {
    state.party.push(makeChar());
    const before = state.gameTime ?? 0;
    await service.long_rest('Resting.', true);
    expect(state.gameTime).toBe(before + 480);
  });

  it('rejects rest when < 960 minutes since last rest', async () => {
    state.party.push(makeChar());
    state.lastLongRestTime = 0;
    state.gameTime = 500;
    const result = await service.long_rest('Too soon.');
    expect(result.success).toBe(false);
    expect(result.message).toContain('need');
  });

  it('allows rest when >= 960 minutes since last rest', async () => {
    state.party.push(makeChar());
    state.lastLongRestTime = 0;
    state.gameTime = 960;
    const result = await service.long_rest('Finally.');
    expect(result.success).toBe(true);
  });

  it('clears round-based conditions on rest', async () => {
    const char = makeChar();
    char.conditions = [
      { id: 'blinded', source: 'faerie-fire', duration: 3, durationUnit: 'round' },
      { id: 'blessed', source: 'bless', duration: 1000, durationUnit: 'minute' },
    ];
    state.party.push(char);
    await service.long_rest('Resting.', true);
    expect(char.conditions.some(c => c.id === 'blinded')).toBe(false);

    expect(char.conditions.some(c => c.id === 'blessed')).toBe(true);
  });

  it('does not duplicate narration in message (only in data.narration)', async () => {
    const char = makeChar({ name: 'Aria', hp: { current: 10, max: 30 } });
    state.party.push(char);
    const narration = 'The party beds down beneath a canopy of ancient oaks as stars wheel overhead.';
    const result = await service.long_rest(narration, true);
    expect(result.success).toBe(true);
    // Narration prose must NOT appear in message (becomes the [System:long_rest] log) —
    // it lives only in data.narration (routed to the narration bubble).
    expect(result.message).not.toContain(narration);
    // Heal details and the narration are both present where expected.
    expect(result.message).toContain('HP:');
    expect(result.message).toContain('Aria');
    expect(String(result.data?.narration)).toContain(narration);
  });
});

describe('travelService — short_rest', () => {
  let state: GameState;
  let service: TravelService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cryptoRoll).mockReset();
    state = makeGameState({ gameTime: 0, lastLongRestTime: -960 });
    service = createTravelService(state, {
      getTarget: (id) => state.party.find(c => c.id === id),
      adjust_currency: vi.fn(async () => ({ success: true, message: '', data: {} })),
      update_inventory: vi.fn(async () => ({ success: true, message: '', data: {} })),
      log_lore: vi.fn(async () => ({ success: true, message: '', data: {} })),
      upsert_quest: vi.fn(async () => ({ success: true, message: '', data: {} })),
    });
  });

  it('advances time by 60 minutes when autoAdvanceTime', async () => {
    state.party.push(makeChar());
    const before = state.gameTime ?? 0;
    await service.short_rest(undefined, 'Resting.', true);
    expect(state.gameTime).toBe(before + 60);
  });

  it('does not advance time without autoAdvanceTime', async () => {
    state.party.push(makeChar());
    await service.short_rest(undefined, undefined, false);
    expect(state.gameTime).toBe(0);
  });

  it('does not duplicate narration in message (only in data.narration)', async () => {
    state.party.push(makeChar({ name: 'Bram' }));
    const narration = 'Bram leans against a mossy stone, catching his breath after the skirmish.';
    const result = await service.short_rest(undefined, narration, true);
    expect(result.success).toBe(true);
    // Narration prose must NOT appear in message — only in data.narration.
    expect(result.message).not.toContain(narration);
    expect(result.message).toContain('Short rest completed');
    expect(String(result.data?.narration)).toContain(narration);
  });
});
