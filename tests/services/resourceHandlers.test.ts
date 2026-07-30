import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RESOURCE_HANDLERS, ResourceHandlerContext } from '../../services/resourceHandlers';
import type { SpellcastingDeps } from '../../services/mcp/spellcastingService';
import type { GameState } from '../../types';

vi.mock('../../utils/random', () => ({
  cryptoRoll: vi.fn(() => 5),
}));

vi.mock('../../services/classEngine', () => ({
  getMod: vi.fn(() => 2),
  getProficiencyBonus: vi.fn(() => 2),
}));

vi.mock('./_shared', () => ({
  fail: vi.fn((msg: string) => ({ success: false, data: {}, message: msg })),
  fuzzyMatchEntity: vi.fn((e: { id: string; name: string }, id: string) => e.name.toLowerCase() === id.toLowerCase()),
  generateId: vi.fn(),
}));

vi.mock('../../utils/dice', () => ({
  parseDiceFormula: vi.fn(() => ({ count: 3, sides: 10, bonus: 0 })),
}));

vi.mock('../diceEngine', () => ({
  rollDice: vi.fn(() => 17),
}));

vi.mock('../spellcastingEngine', () => ({
  breakConcentration: vi.fn(),
}));

vi.mock('../conditionEngine', () => ({
  applyCondition: vi.fn(),
}));

function makeContext(overrides: Partial<GameState> = {}): ResourceHandlerContext {
  const state = {
    party: [{
      id: 'test-char',
      name: 'Test',
      class: 'fighter',
      race: 'human',
      level: 3,
      hp: { current: 10, max: 24 },
      stats: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 14 },
      inventory: [],
      currency: { gp: 0, sp: 0, cp: 0 },
      location: 'Test',
      experience: 0,
      experienceToNextLevel: 2700,
      unusedStatPoints: 0,
      maxHpBonus: 0,
      hitDice: { current: 3, max: 3 },
      resources: [],
    }],
    worldDescription: '',
    sessionLogs: [],
    quests: [],
    lore: [],
    combat: {
      isActive: false,
      round: 1,
      enemies: [],
      initiative: [],
    },
    ...overrides,
  } as GameState;
  return {
    state,
    deps: {
      getTarget: vi.fn(() => state.party[0]),
      inflict_damage: vi.fn(async () => ({ success: true, data: {}, message: '' })),
      make_save: vi.fn(async () => ({ success: true, data: { success: false }, message: '' })),
      syncInitiativeConditions: vi.fn(),
    } as unknown as SpellcastingDeps,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RESOURCE_HANDLERS', () => {
  describe('second-wind', () => {
    it('heals 1d10 + level', async () => {
      const ctx = makeContext();
      const char = ctx.state.party[0];
      char.hp.current = 5;
      const result = await RESOURCE_HANDLERS['second-wind'](ctx, 'test-char');
      expect(result.success).toBe(true);
      expect(char.hp.current).toBe(13); // 5 + 5 (cryptoRoll) + 3 (level)
    });
  });

  describe('action-surge', () => {
    it('grants extra action', async () => {
      const ctx = makeContext();
      const result = await RESOURCE_HANDLERS['action-surge'](ctx, 'test-char');
      expect(result.success).toBe(true);
      expect(result.data?.extraAction).toBe(true);
    });
  });

  describe('indomitable', () => {
    it('grants save reroll', async () => {
      const ctx = makeContext();
      const result = await RESOURCE_HANDLERS['indomitable'](ctx, 'test-char');
      expect(result.success).toBe(true);
      expect(result.data?.rerollSave).toBe(true);
    });
  });

  describe('divine-sense', () => {
    it('detects celestial, fiend, undead', async () => {
      const ctx = makeContext();
      const result = await RESOURCE_HANDLERS['divine-sense'](ctx, 'test-char');
      expect(result.success).toBe(true);
      expect(result.data?.detectType).toEqual(['celestial', 'fiend', 'undead']);
    });
  });

  describe('relentless-endurance', () => {
    it('sets HP to 1 when at 0', async () => {
      const ctx = makeContext();
      const char = ctx.state.party[0];
      char.hp.current = 0;
      const result = await RESOURCE_HANDLERS['relentless-endurance'](ctx, 'test-char');
      expect(result.success).toBe(true);
      expect(char.hp.current).toBe(1);
    });

    it('fails when HP > 0', async () => {
      const ctx = makeContext();
      const result = await RESOURCE_HANDLERS['relentless-endurance'](ctx, 'test-char');
      expect(result.success).toBe(false);
    });
  });

  describe('arcane-recovery', () => {
    it('reports max levels', async () => {
      const ctx = makeContext();
      ctx.state.party[0].class = 'wizard';
      const result = await RESOURCE_HANDLERS['arcane-recovery'](ctx, 'test-char');
      expect(result.success).toBe(true);
      expect(result.data?.maxLevels).toBe(2); // ceil(3/2)
    });

    it('fails for non-wizards', async () => {
      const ctx = makeContext();
      const result = await RESOURCE_HANDLERS['arcane-recovery'](ctx, 'test-char');
      expect(result.success).toBe(false);
    });
  });
});
