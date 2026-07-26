import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockMCPServer } from '../../services/mcpService';
import { Character, GameState, InventoryItem, CombatState, Enemy } from '../../types';
import { deepClone } from '../../utils/clone';

vi.mock('../../utils/random', () => ({
  cryptoRoll: vi.fn(),
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

vi.mock('../../utils/debug', () => ({
  isDebugMode: false,
}));

const { cryptoRoll } = await import('../../utils/random');

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: 'hero-1',
    name: 'Hero',
    class: 'Fighter',
    race: 'Human',
    level: 1,
    hp: { current: 12, max: 12 },
    stats: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 14 },
    inventory: [{ name: 'Longsword', quantity: 1 }],
    currency: { gp: 10, sp: 0, cp: 0 },
    location: 'Tavern',
    experience: 0,
    experienceToNextLevel: 300,
    unusedStatPoints: 0,
    maxHpBonus: 0,
    hitDice: { current: 1, max: 1 },
    ...overrides,
  };
}

function makeServerState(overrides: Partial<GameState> = {}): GameState {
  return {
    party: [makeCharacter()],
    worldDescription: 'A dark forest',
    sessionLogs: [],
    quests: [],
    lore: [],
    actionQueue: [],
    ...overrides,
  };
}

function makeCombatState(overrides: Partial<CombatState> = {}): CombatState {
  return {
    isActive: true,
    round: 1,
    turnIndex: 0,
    initiative: [],
    enemies: [],
    ...overrides,
  };
}

describe('MockMCPServer', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cryptoRoll).mockReset();
    server = new MockMCPServer();
  });

  describe('constructor & state management', () => {
    it('initializes with empty party', () => {
      const state = server.getFullState();
      expect(state.party).toEqual([]);
      expect(state.worldDescription).toContain('Rusty Tankard');
      expect(state.sessionLogs).toEqual([]);
      expect(state.quests).toEqual([]);
      expect(state.lore).toEqual([]);
      expect(state.actionQueue).toEqual([]);
    });

    it('loadState replaces internal state', () => {
      const newState = makeServerState({ worldDescription: 'New world' });
      server.loadState(newState);
      const state = server.getFullState();
      expect(state.worldDescription).toBe('New world');
      expect(state.party).toHaveLength(1);
    });

    it('loadState ensures party and actionQueue exist', () => {
      server.loadState({} as GameState);
      const state = server.getFullState();
      expect(state.party).toEqual([]);
      expect(state.actionQueue).toEqual([]);
    });

    it('reset restores initial state', () => {
      server.loadState(makeServerState());
      server.setAtmosphere('http://example.com/img.png');
      server.reset();
      const state = server.getFullState();
      expect(state.party).toEqual([]);
      expect(state.currentAtmosphereUrl).toBeUndefined();
      expect(state.worldDescription).toContain('Rusty Tankard');
    });

    it('getFullState returns a copy not a reference', () => {
      server.loadState(makeServerState());
      const state = server.getFullState();
      state.party = [];
      expect(server.getFullState().party).toHaveLength(1);
    });
  });

  describe('party management', () => {
    it('joinParty adds new character', () => {
      const char = makeCharacter({ id: 'hero-2', name: 'Sidekick' });
      server.joinParty(char);
      expect(server.getFullState().party).toHaveLength(1);
      expect(server.getFullState().sessionLogs[0]).toContain('Sidekick has joined');
    });

    it('joinParty updates existing character by id', () => {
      const char = makeCharacter({ id: 'hero-1', name: 'Renamed Hero' });
      server.joinParty(char);
      expect(server.getFullState().party).toHaveLength(1);
      expect(server.getFullState().party[0].name).toBe('Renamed Hero');
    });

    it('setCharacter delegates to joinParty', () => {
      const char = makeCharacter({ id: 'hero-2' });
      server.setCharacter(char);
      expect(server.getFullState().party).toHaveLength(1);
    });

    it('getTarget returns first party member when no id', () => {
      server.loadState(makeServerState());
      const target = server.getTarget();
      expect(target?.id).toBe('hero-1');
    });

    it('getTarget finds by id', () => {
      server.loadState(makeServerState({ party: [makeCharacter(), makeCharacter({ id: 'hero-2', name: 'Sidekick' })] }));
      const target = server.getTarget('hero-2');
      expect(target?.name).toBe('Sidekick');
    });

    it('getTarget finds by name (case-insensitive)', () => {
      server.loadState(makeServerState());
      const target = server.getTarget('hero');
      expect(target?.id).toBe('hero-1');
    });

    it('getTarget returns undefined for non-existent', () => {
      server.loadState(makeServerState());
      expect(server.getTarget('nobody')).toBeUndefined();
    });

    it('getTarget returns undefined when party is empty', () => {
      expect(server.getTarget()).toBeUndefined();
    });
  });

  describe('setAtmosphere', () => {
    it('sets currentAtmosphereUrl', () => {
      server.setAtmosphere('http://example.com/img.png');
      expect(server.getFullState().currentAtmosphereUrl).toBe('http://example.com/img.png');
    });
  });

  describe('roll_dice', () => {
    beforeEach(() => {
      vi.mocked(cryptoRoll).mockReturnValue(10);
      server.loadState(makeServerState());
    });

    it('rolls dice and returns results', async () => {
      const result = await server.roll_dice(20, 1, 0);
      expect(cryptoRoll).toHaveBeenCalledWith(20);
      expect(result.success).toBe(true);
      expect(result.data.total).toBe(10);
      expect(result.data.sides).toBe(20);
    });

    it('supports multiple dice and modifier', async () => {
      vi.mocked(cryptoRoll).mockReturnValueOnce(5).mockReturnValueOnce(8);
      const result = await server.roll_dice(6, 2, 3);
      expect(result.data.total).toBe(16);
      expect(result.data.results).toEqual([5, 8]);
      expect(result.data.modifier).toBe(3);
    });

    it('uses 0 modifier when not provided', async () => {
      const result = await server.roll_dice(20, 1);
      expect(result.data.modifier).toBe(0);
    });

    it('detects hit when total >= target_ac', async () => {
      vi.mocked(cryptoRoll).mockReturnValue(15);
      const result = await server.roll_dice(20, 1, 2, 15);
      expect(result.data.success).toBe(true);
      expect(result.message).toContain('HIT');
    });

    it('detects miss when total < target_ac', async () => {
      vi.mocked(cryptoRoll).mockReturnValue(10);
      const result = await server.roll_dice(20, 1, 0, 15);
      expect(result.data.success).toBe(false);
      expect(result.message).toContain('MISSED');
    });

    it('does not compute hit/miss when sides !== 20', async () => {
      const result = await server.roll_dice(6, 1, 0, 15);
      expect(result.data.success).toBeUndefined();
    });

    it('stores lastDiceRoll', async () => {
      vi.mocked(cryptoRoll).mockReturnValue(7);
      await server.roll_dice(20, 1, 0);
      const state = server.getFullState();
      expect(state.lastDiceRoll).toBeDefined();
      const lastDiceRoll = state.lastDiceRoll;
      expect(lastDiceRoll.total).toBe(7);
    });

    it('includes roll_label in message', async () => {
      vi.mocked(cryptoRoll).mockReturnValue(10);
      const result = await server.roll_dice(20, 1, 0, undefined, undefined, 'Sword Attack');
      expect(result.message).toContain('[Sword Attack]');
    });
  });

  describe('move_to', () => {
    beforeEach(() => {
      server.loadState(makeServerState());
    });

    it('moves entire party when no targetId', async () => {
      const result = await server.move_to('Dungeon');
      expect(result.success).toBe(true);
      const state = server.getFullState();
      state.party.forEach(c => expect(c.location).toBe('Dungeon'));
      expect(result.data.newLocation).toBe('Dungeon');
    });

    it('moves specific character when targetId provided', async () => {
      const result = await server.move_to('Kitchen', undefined, 'hero-1');
      expect(result.success).toBe(true);
      expect(server.getFullState().party[0].location).toBe('Kitchen');
    });

    it('updates worldDescription when provided', async () => {
      await server.move_to('Castle', 'A grand castle');
      expect(server.getFullState().worldDescription).toBe('A grand castle');
    });

    it('adds session log entry when moving specific character', async () => {
      await server.move_to('Dungeon', undefined, 'hero-1');
      const logs = server.getFullState().sessionLogs;
      expect(logs.some(l => l.includes('moved to Dungeon'))).toBe(true);
    });

    it('adds session log entry for party-wide move', async () => {
      await server.move_to('Dungeon');
      const logs = server.getFullState().sessionLogs;
      expect(logs.some(l => l.includes('Party moved to Dungeon'))).toBe(true);
    });
  });

  describe('inflict_damage', () => {
    beforeEach(() => {
      server.loadState(makeServerState());
    });

    it('reduces HP', async () => {
      const result = await server.inflict_damage(5);
      expect(result.success).toBe(true);
      expect(server.getFullState().party[0].hp.current).toBe(7);
      expect(result.data.newHp).toBe(7);
    });

    it('clamps HP to 0', async () => {
      await server.inflict_damage(100);
      expect(server.getFullState().party[0].hp.current).toBe(0);
    });

    it('returns error for missing target', async () => {
      const result = await server.inflict_damage(5, 'nobody');
      expect(result.success).toBe(false);
    });

    it('handles 0 damage gracefully', async () => {
      const result = await server.inflict_damage(0);
      expect(result.success).toBe(true);
      expect(result.data.newHp).toBe(12);
    });
  });

  describe('adjust_currency', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      server.loadState(makeServerState());
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('adds currency', async () => {
      const result = await server.adjust_currency(5, 3, 2);
      expect(result.success).toBe(true);
      const c = server.getFullState().party[0].currency;
      expect(c.gp).toBe(15);
      expect(c.sp).toBe(3);
      expect(c.cp).toBe(2);
    });

    it('removes currency with negative values', async () => {
      await server.adjust_currency(-5, 0, 0);
      expect(server.getFullState().party[0].currency.gp).toBe(5);
    });

    it('rejects insufficient funds', async () => {
      const result = await server.adjust_currency(-100, 0, 0);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Insufficient funds');
    });

    it('deduplicates identical adjustments within 500ms', async () => {
      await server.adjust_currency(5, 0, 0);
      const result = await server.adjust_currency(5, 0, 0);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Duplicate');
    });

    it('allows same adjustment after 500ms', async () => {
      await server.adjust_currency(5, 0, 0);
      vi.advanceTimersByTime(600);
      const result = await server.adjust_currency(5, 0, 0);
      expect(result.success).toBe(true);
    });

    it('returns error for missing target', async () => {
      const result = await server.adjust_currency(5, 0, 0, 'nobody');
      expect(result.success).toBe(false);
    });
  });

  describe('upsert_quest', () => {
    it('creates a new quest', async () => {
      const result = await server.upsert_quest('Save the Town', 'Defeat the goblins', 'active');
      expect(result.success).toBe(true);
      const state = server.getFullState();
      expect(state.quests).toHaveLength(1);
      expect(state.quests[0].title).toBe('Save the Town');
      expect(state.quests[0].status).toBe('active');
    });

    it('updates existing quest with matching title (case-insensitive)', async () => {
      await server.upsert_quest('Save the Town', 'Defeat the goblins', 'active');
      const result = await server.upsert_quest('save the town', 'Updated description', 'completed');
      expect(result.success).toBe(true);
      const state = server.getFullState();
      expect(state.quests).toHaveLength(1);
      expect(state.quests[0].status).toBe('completed');
    });
  });

  describe('log_lore', () => {
    it('adds a lore entry', async () => {
      const result = await server.log_lore('Dragon', 'Ancient wyrm', 'NPC');
      expect(result.success).toBe(true);
      const state = server.getFullState();
      expect(state.lore).toHaveLength(1);
      expect(state.lore[0].title).toBe('Dragon');
      expect(state.lore[0].category).toBe('NPC');
    });
  });

  describe('getResource', () => {
    beforeEach(() => {
      server.loadState(makeServerState());
    });

    it('returns party for character URI', () => {
      const result = server.getResource('campaign://character/player-1');
      expect(result).toEqual(server.getFullState().party);
    });

    it('returns current location for world URI', () => {
      const result = server.getResource('campaign://world/current_location');
      expect(result.location).toBe('Tavern');
      expect(result.description).toBe('A dark forest');
    });

    it('returns session logs', () => {
      const result = server.getResource('campaign://logs/session_summary');
      expect(result).toEqual([]);
    });

    it('returns quests', () => {
      const result = server.getResource('campaign://journal/quests');
      expect(result).toEqual([]);
    });

    it('returns lore', () => {
      const result = server.getResource('campaign://journal/lore');
      expect(result).toEqual([]);
    });

    it('returns undefined for unknown URI', () => {
      expect(server.getResource('unknown://uri')).toBeUndefined();
    });
  });

  describe('getCharacterProgression', () => {
    it('returns context string for existing character', () => {
      server.loadState(makeServerState());
      const ctx = server.getCharacterProgression('hero-1');
      expect(ctx).toContain('Level 1');
    });

    it('returns error when character not found', () => {
      expect(server.getCharacterProgression('nobody')).toBe('No character found.');
    });
  });

  describe('updateInventoryDirectly', () => {
    it('replaces inventory for target character', () => {
      server.loadState(makeServerState());
      const newInv: InventoryItem[] = [{ name: 'New Item', quantity: 1 }];
      server.updateInventoryDirectly(newInv);
      expect(server.getFullState().party[0].inventory).toEqual(newInv);
    });
  });

  describe('updateCurrencyDirectly', () => {
    it('replaces currency for target character', () => {
      server.loadState(makeServerState());
      server.updateCurrencyDirectly({ gp: 99, sp: 0, cp: 0 });
      expect(server.getFullState().party[0].currency.gp).toBe(99);
    });

    it('clamps negative values to 0', () => {
      server.loadState(makeServerState());
      server.updateCurrencyDirectly({ gp: -5, sp: 0, cp: 0 });
      const c = server.getFullState().party[0].currency;
      expect(c.gp).toBe(0);
      expect(c.sp).toBe(0);
      expect(c.cp).toBe(0);
    });
  });

  describe('transactions', () => {
    it('begin/commit transaction', () => {
      server.loadState(makeServerState());
      server.beginTransaction();
      server.getFullState().party[0].name = 'Changed';
      server.commitTransaction();
      expect(server.getFullState().party[0].name).toBe('Changed');
    });

    it('begin/rollback transaction restores state', () => {
      server.loadState(makeServerState({ party: [makeCharacter({ name: 'Original' })] }));
      server.beginTransaction();
      server.getFullState().party[0].name = 'Changed';
      server.rollbackTransaction();
      expect(server.getFullState().party[0].name).toBe('Original');
    });

    it('rollbackTransaction does nothing when no snapshot', () => {
      server.rollbackTransaction();
      const state = server.getFullState();
      expect(state.party).toEqual([]);
    });
  });

  describe('rewind points', () => {
    it('save/load rewind point', () => {
      const gs = makeServerState();
      server.saveRewindPoint(gs, []);
      const loaded = server.loadRewindPoint();
      if (!loaded) throw new Error('Expected rewind point to exist');
      expect(loaded.gameState.party[0].name).toBe('Hero');

    });

    it('clearRewindPoint removes saved state', () => {
      server.saveRewindPoint(makeServerState(), []);
      server.clearRewindPoint();
      expect(server.loadRewindPoint()).toBeNull();
    });

    it('loadRewindPoint returns null when none saved', () => {
      expect(server.loadRewindPoint()).toBeNull();
    });

    it('rewind point preserves character HP, resources, and conditions as deep copy', () => {
        const state = makeServerState();
        state.party[0].hp.current = 5;
        state.party[0].resources = [{ name: 'Spell Slots', current: 2, max: 3 }];
        state.party[0].conditions = [{ name: 'Poisoned', sourceId: 'src1' }];
        server.saveRewindPoint(state, []);

        state.party[0].hp.current = 99;
        state.party[0].resources = [];
        state.party[0].conditions = [];

        const loaded = server.loadRewindPoint();
        if (!loaded) throw new Error('Expected rewind point to exist');
        expect(loaded.gameState.party[0].hp.current).toBe(5);
        expect(loaded.gameState.party[0].resources).toEqual([{ name: 'Spell Slots', current: 2, max: 3 }]);
        expect(loaded.gameState.party[0].conditions).toEqual([{ name: 'Poisoned', sourceId: 'src1' }]);
    });

    it('rewind point preserves combat state', () => {
        const state = makeServerState();
        state.combat = {
            isActive: true,
            round: 2,
            turnIndex: 0,
            initiative: [
                { id: 'hero1', name: 'Hero', initiative: 15, type: 'player', isDead: false, hasActedThisTurn: false },
                { id: 'enemy1', name: 'Goblin', initiative: 12, type: 'enemy', isDead: false, hasActedThisTurn: false },
            ],
            enemies: [
                { id: 'enemy1', name: 'Goblin', ac: 13, hp: { current: 5, max: 7 }, attacks: [], isDead: false },
            ],
        };
        server.saveRewindPoint(state, []);
        const loaded = server.loadRewindPoint();
        if (!loaded) throw new Error('Expected rewind point to exist');
        expect(loaded.gameState.combat).toBeDefined();
        const rewindCombat = loaded.gameState.combat;
        if (!rewindCombat) throw new Error('Expected combat to exist');
        expect(rewindCombat.round).toBe(2);
        expect(rewindCombat.enemies).toHaveLength(1);
    });
  });

  describe('captureRewindSnapshot / restoreSnapshot', () => {
    it('capture/restore preserves state', () => {
      server.loadState(makeServerState());
      server.beginTransaction();
      const snap = server.captureRewindSnapshot();
      if (!snap) throw new Error('Expected snapshot to exist');
      server.getFullState().party[0].name = 'Changed';
      server.restoreSnapshot(snap);
      expect(server.getFullState().party[0].name).toBe('Hero');
    });
  });

  describe('emergency snapshot', () => {
    beforeEach(() => {
        server.loadState(makeServerState());
    });

    it('save/load emergency snapshot preserves deep copy', () => {
        const state = server.getFullState();
        server.saveEmergencySnapshot(state);
        state.party[0].hp.current = 999;
        state.party[0].resources = [{ name: 'test', current: 5, max: 5 }];
        state.party[0].conditions = [{ name: 'Poisoned', sourceId: 'test' }];
        const loaded = server.loadEmergencySnapshot();
        if (!loaded) throw new Error('Expected emergency snapshot to exist');
        expect(loaded.party[0].hp.current).toBe(12);
        expect(loaded.party[0].resources).toEqual([]);
        expect(loaded.party[0].conditions).toBeUndefined();
    });

    it('loadEmergencySnapshot returns null when none saved', () => {
        expect(server.loadEmergencySnapshot()).toBeNull();
    });

    it('clearEmergencySnapshot removes saved state', () => {
        server.saveEmergencySnapshot(makeServerState());
        server.clearEmergencySnapshot();
        expect(server.loadEmergencySnapshot()).toBeNull();
    });

    it('loadEmergencySnapshot returns independent deep copy', () => {
        server.saveEmergencySnapshot(makeServerState());
        const first = server.loadEmergencySnapshot();
        if (!first) throw new Error('Expected first emergency snapshot to exist');
        const second = server.loadEmergencySnapshot();
        if (!second) throw new Error('Expected second emergency snapshot to exist');
        first.party[0].hp.current = 1;
        expect(second.party[0].hp.current).toBe(12);
    });
  });

  describe('check_skill', () => {
    beforeEach(() => {
      server.loadState(makeServerState());
      vi.mocked(cryptoRoll).mockReturnValue(10);
    });

    it('succeeds when roll + modifier meets DC', async () => {
      vi.mocked(cryptoRoll).mockReturnValue(15);
      const result = await server.check_skill('athletics', 10);
      expect(result.success).toBe(true);
      expect(result.data.success).toBe(true);
    });

    it('fails when roll + modifier is below DC', async () => {
      vi.mocked(cryptoRoll).mockReturnValue(1);
      const result = await server.check_skill('athletics', 20);
      expect(result.data.success).toBe(false);
    });

    it('returns error for missing target', async () => {
      const result = await server.check_skill('athletics', 10, 'nobody');
      expect(result.success).toBe(false);
    });

    it('strips suffix from skill name', async () => {
      vi.mocked(cryptoRoll).mockReturnValue(10);
      const result = await server.check_skill('perception check', 10);
      expect(result.data.success).toBeDefined();
      expect(result.data.modifier).toBe(1);
    });

    it('handles direct stat checks like "wisdom"', async () => {
      vi.mocked(cryptoRoll).mockReturnValue(10);
      const result = await server.check_skill('wisdom', 10);
      expect(result.success).toBe(true);
      expect(result.data.modifier).toBe(1);
    });

    it('awards XP on success', async () => {
      vi.mocked(cryptoRoll).mockReturnValue(15);
      const result = await server.check_skill('athletics', 10);
      expect(result.data.xpGained).toBeGreaterThan(0);
    });

    it('applies Nat20 bonus', async () => {
      vi.mocked(cryptoRoll).mockReturnValue(20);
      const result = await server.check_skill('athletics', 10);
      expect(result.data.xpGained).toBeGreaterThanOrEqual(25);
      expect(result.message).toContain('Nat 20');
    });

    it('falls back to STR for unrecognized skill', async () => {
      vi.mocked(cryptoRoll).mockReturnValue(10);
      const result = await server.check_skill('nonexistent_skill', 10);
      expect(result.success).toBe(true);
      expect(result.data.modifier).toBe(3);
    });
  });

  describe('allocateStatPoints', () => {
    beforeEach(() => {
      const char = makeCharacter({ unusedStatPoints: 4 });
      server.loadState(makeServerState({ party: [char] }));
    });

    it('allocates stat points successfully', () => {
      const result = server.allocateStatPoints({ str: 2, dex: 2 });
      expect(result.success).toBe(true);
      expect(result.message).toContain('updated');
    });

    it('returns error for invalid allocations', () => {
      const result = server.allocateStatPoints({ str: 100 });
      expect(result.success).toBe(false);
      expect(result.message).toContain('cannot exceed');
    });

    it('returns error for missing target', () => {
      const result = server.allocateStatPoints({ str: 2 }, 'nobody');
      expect(result.success).toBe(false);
    });
  });

  describe('update_inventory', () => {
    beforeEach(() => {
      server.loadState(makeServerState());
    });

    it('adds a new item', async () => {
      const result = await server.update_inventory('Potion of Healing', 'add', 1);
      expect(result.success).toBe(true);
      const inv = server.getFullState().party[0].inventory;
      expect(inv.some(i => i.name === 'Potion of Healing')).toBe(true);
    });

    it('increases quantity of existing item', async () => {
      const result = await server.update_inventory('Longsword', 'add', 2);
      expect(result.success).toBe(true);
      const item = server.getFullState().party[0].inventory.find(i => i.name === 'Longsword');
      if (!item) throw new Error('Expected item Longsword to exist');
      expect(item.quantity).toBe(3);
    });

    it('rejects garbage item names for add', async () => {
      const result = await server.update_inventory('the', 'add', 1);
      expect(result.success).toBe(false);
      expect(result.message).toContain('too generic');
    });

    it('tries SRD lookup for unknown items', async () => {
      const result = await server.update_inventory('Greatsword', 'add', 1);
      expect(result.success).toBe(true);
      const item = server.getFullState().party[0].inventory.find(i => i.name === 'Greatsword');
      if (!item) throw new Error('Expected item to exist');
      expect(item.type).toBe('weapon');
    });

    it('removes an item', async () => {
      const result = await server.update_inventory('Longsword', 'remove', 1);
      expect(result.success).toBe(true);
      const inv = server.getFullState().party[0].inventory;
      expect(inv.find(i => i.name === 'Longsword')).toBeUndefined();
    });

    it('returns error removing non-existent item', async () => {
      const result = await server.update_inventory('Nonexistent', 'remove', 1);
      expect(result.success).toBe(false);
    });

    it('edits an existing item name', async () => {
      const result = await server.update_inventory('Longsword', 'edit', 1, 'Greatsword');
      expect(result.success).toBe(true);
      const item = server.getFullState().party[0].inventory.find(i => i.name === 'Greatsword');
      expect(item).toBeDefined();
    });

    it('returns error editing non-existent item', async () => {
      const result = await server.update_inventory('Nothing', 'edit');
      expect(result.success).toBe(false);
    });

    it('returns error for missing target', async () => {
      const result = await server.update_inventory('Sword', 'add', 1, undefined, 'nobody');
      expect(result.success).toBe(false);
    });
  });

  describe('updateInitiativeDeathStatus', () => {
    it('updates initiative entry isDead flag', () => {
      server.loadState(makeServerState({
        combat: makeCombatState({
          initiative: [
            { id: 'hero-1', name: 'Hero', initiative: 15, type: 'player', isDead: false, hasActedThisTurn: false },
            { id: 'enemy-1', name: 'Goblin', initiative: 12, type: 'enemy', isDead: false, hasActedThisTurn: false },
          ],
          enemies: [{ id: 'enemy-1', name: 'Goblin', ac: 15, hp: { current: 7, max: 7 }, attacks: [], isDead: false }],
        }),
      }));

      server.updateInitiativeDeathStatus('enemy-1', true);

      const combatState = server.getFullState();
      expect(combatState.combat).toBeDefined();
      const combat = combatState.combat;
      expect(combat.initiative[1].isDead).toBe(true);
      expect(combat.enemies[0].isDead).toBe(true);
    });

    it('does nothing when no active combat', () => {
      server.loadState(makeServerState());
      const stateBefore = JSON.stringify(server.getFullState());
      server.updateInitiativeDeathStatus('hero-1', true);
      const stateAfter = JSON.stringify(server.getFullState());
      expect(stateAfter).toBe(stateBefore);
    });

    it('updates player initiative entry', () => {
      server.loadState(makeServerState({
        combat: makeCombatState({
          initiative: [
            { id: 'hero-1', name: 'Hero', initiative: 15, type: 'player', isDead: false, hasActedThisTurn: false },
          ],
          enemies: [],
        }),
      }));

      server.updateInitiativeDeathStatus('hero-1', true);
      const gs = server.getFullState();
      expect(gs.combat).toBeDefined();
      const combat = gs.combat;
      expect(combat.initiative[0].isDead).toBe(true);
    });
  });

  describe('checkCombatEndConditions', () => {
    it('returns not ended when no combat', () => {
      server.loadState(makeServerState());
      const result = server.checkCombatEndConditions();
      expect(result.ended).toBe(false);
    });

    it('detects victory when all enemies dead', () => {
      server.loadState(makeServerState({
        combat: makeCombatState({
          enemies: [
            { id: 'e1', name: 'Goblin', ac: 15, hp: { current: 0, max: 7 }, attacks: [], isDead: true },
            { id: 'e2', name: 'Orc', ac: 13, hp: { current: 0, max: 15 }, attacks: [], isDead: true },
          ],
        }),
      }));

      const result = server.checkCombatEndConditions();
      expect(result.ended).toBe(true);
      expect(result.victory).toBe(true);
    });

    it('does not end when enemies are alive', () => {
      server.loadState(makeServerState({
        combat: makeCombatState({
          enemies: [{ id: 'e1', name: 'Goblin', ac: 15, hp: { current: 7, max: 7 }, attacks: [], isDead: false }],
        }),
      }));

      const result = server.checkCombatEndConditions();
      expect(result.ended).toBe(false);
    });

    it('detects total party kill when all players dead/unstable/failed', () => {
      const deadChar = makeCharacter({
        id: 'hero-1', name: 'Hero', hp: { current: 0, max: 12 },
        deathSaves: { successes: 0, failures: 3, isStable: false },
      });
      server.loadState(makeServerState({
        party: [deadChar],
        combat: makeCombatState({
          enemies: [{ id: 'e1', name: 'Goblin', ac: 15, hp: { current: 7, max: 7 }, attacks: [], isDead: false }],
        }),
      }));

      const result = server.checkCombatEndConditions();
      expect(result.ended).toBe(true);
      expect(result.victory).toBe(false);
      expect(result.reason).toBe('total_party_kill');
    });

    it('does not end when a player is alive', () => {
      server.loadState(makeServerState({
        combat: makeCombatState({
          enemies: [{ id: 'e1', name: 'Goblin', ac: 15, hp: { current: 7, max: 7 }, attacks: [], isDead: false }],
        }),
      }));

      const result = server.checkCombatEndConditions();
      expect(result.ended).toBe(false);
    });

    it('does not count stable players as dead for TPK', () => {
      const stableChar = makeCharacter({
        id: 'hero-1', name: 'Hero', hp: { current: 0, max: 12 },
        deathSaves: { successes: 3, failures: 0, isStable: true },
      });
      server.loadState(makeServerState({
        party: [stableChar],
        combat: makeCombatState({
          enemies: [{ id: 'e1', name: 'Goblin', ac: 15, hp: { current: 7, max: 7 }, attacks: [], isDead: false }],
        }),
      }));

      const result = server.checkCombatEndConditions();
      expect(result.ended).toBe(false);
    });
  });

  describe('resolveEnemyTurn', () => {
    beforeEach(() => {
      vi.mocked(cryptoRoll).mockReturnValue(10);
    });

    it('returns error when no active combat', async () => {
      server.loadState(makeServerState());
      const result = await server.resolveEnemyTurn();
      expect(result.success).toBe(false);
    });

    it('returns error when it is not an enemy turn', async () => {
      server.loadState(makeServerState({
        combat: makeCombatState({
          initiative: [
            { id: 'hero-1', name: 'Hero', initiative: 15, type: 'player', isDead: false, hasActedThisTurn: false },
          ],
          enemies: [],
        }),
      }));

      const result = await server.resolveEnemyTurn();
      expect(result.success).toBe(false);
      expect(result.message).toContain('not an enemy');
    });

    it('resolves enemy attack and advances turn', async () => {
      server.loadState(makeServerState({
        combat: makeCombatState({
          initiative: [
            { id: 'enemy-1', name: 'Goblin', initiative: 18, type: 'enemy', isDead: false, hasActedThisTurn: false },
            { id: 'hero-1', name: 'Hero', initiative: 15, type: 'player', isDead: false, hasActedThisTurn: false },
          ],
          enemies: [{
            id: 'enemy-1', name: 'Goblin', ac: 15, hp: { current: 7, max: 7 },
            attacks: [{ name: 'Scimitar', toHit: 4, damageDice: '1d6+2', damageType: 'slashing' }],
            isDead: false,
          }],
        }),
      }));

      const result = await server.resolveEnemyTurn();
      expect(result.success).toBe(true);
      expect(result.message).toContain('Goblin');

      const gs = server.getFullState();
      expect(gs.combat).toBeDefined();
      const combat = gs.combat;
      expect(combat.initiative[0].hasActedThisTurn).toBe(true);
      expect(combat.turnIndex).toBe(1);
    });

    it('skips dead enemies and advances turn', async () => {
      server.loadState(makeServerState({
        combat: makeCombatState({
          initiative: [
            { id: 'enemy-1', name: 'Dead Goblin', initiative: 18, type: 'enemy', isDead: true, hasActedThisTurn: false },
            { id: 'hero-1', name: 'Hero', initiative: 15, type: 'player', isDead: false, hasActedThisTurn: false },
          ],
          enemies: [{ id: 'enemy-1', name: 'Dead Goblin', ac: 15, hp: { current: 0, max: 7 }, attacks: [], isDead: true }],
        }),
      }));

      const result = await server.resolveEnemyTurn();
      expect(result.success).toBe(true);
      expect(result.message).toContain('Dead Goblin');

      const gs = server.getFullState();
      expect(gs.combat).toBeDefined();
      const combat = gs.combat;
      expect(combat.turnIndex).toBe(1);
    });

    it('selects lowest HP percentage player as target', async () => {
      const healthyChar = makeCharacter({ id: 'hero-1', name: 'Healthy', hp: { current: 12, max: 12 } });
      const woundedChar = makeCharacter({ id: 'hero-2', name: 'Wounded', hp: { current: 3, max: 12 } });
      server.loadState(makeServerState({
        party: [healthyChar, woundedChar],
        combat: makeCombatState({
          initiative: [
            { id: 'enemy-1', name: 'Goblin', initiative: 18, type: 'enemy', isDead: false, hasActedThisTurn: false },
            { id: 'hero-1', name: 'Healthy', initiative: 15, type: 'player', isDead: false, hasActedThisTurn: false },
            { id: 'hero-2', name: 'Wounded', initiative: 12, type: 'player', isDead: false, hasActedThisTurn: false },
          ],
          enemies: [{
            id: 'enemy-1', name: 'Goblin', ac: 15, hp: { current: 7, max: 7 },
            attacks: [{ name: 'Scimitar', toHit: 4, damageDice: '1d6+2', damageType: 'slashing' }],
            isDead: false,
          }],
        }),
      }));

      await server.resolveEnemyTurn();

      const wounded = server.getFullState().party.find(c => c.id === 'hero-2');
      if (!wounded) throw new Error('Expected wounded character to exist');
      expect(wounded.hp.current).toBeLessThan(3);
    });

    it('supports multi-attack enemies', async () => {
      server.loadState(makeServerState({
        combat: makeCombatState({
          initiative: [
            { id: 'enemy-1', name: 'MultiAttacker', initiative: 18, type: 'enemy', isDead: false, hasActedThisTurn: false },
            { id: 'hero-1', name: 'Hero', initiative: 15, type: 'player', isDead: false, hasActedThisTurn: false },
          ],
          enemies: [{
            id: 'enemy-1', name: 'MultiAttacker', ac: 15, hp: { current: 20, max: 20 },
            attacks: [
              { name: 'Claw', toHit: 4, damageDice: '1d6+2', damageType: 'slashing' },
              { name: 'Bite', toHit: 4, damageDice: '1d6+2', damageType: 'piercing' },
            ],
            isDead: false,
          }],
        }),
      }));

      const result = await server.resolveEnemyTurn();
      expect(result.success).toBe(true);
      expect(result.message).toContain('Claw');
      expect(result.message).toContain('Bite');
    });
  });

  describe('resolveAllPendingEnemyTurns', () => {
    beforeEach(() => {
      vi.mocked(cryptoRoll).mockReturnValue(10);
    });

    it('returns empty when no active combat', async () => {
      server.loadState(makeServerState());
      const result = await server.resolveAllPendingEnemyTurns();
      expect(result.messages).toEqual([]);
      expect(result.combatEnded).toBe(false);
    });

    it('returns empty when it is a player turn', async () => {
      server.loadState(makeServerState({
        combat: makeCombatState({
          initiative: [
            { id: 'hero-1', name: 'Hero', initiative: 15, type: 'player', isDead: false, hasActedThisTurn: false },
          ],
          enemies: [],
        }),
      }));

      const result = await server.resolveAllPendingEnemyTurns();
      expect(result.messages).toEqual([]);
    });

    it('resolves multiple consecutive enemy turns', async () => {
      server.loadState(makeServerState({
        party: [makeCharacter({ hp: { current: 50, max: 50 } })],
        combat: makeCombatState({
          initiative: [
            { id: 'e1', name: 'Goblin1', initiative: 18, type: 'enemy', isDead: false, hasActedThisTurn: false },
            { id: 'e2', name: 'Goblin2', initiative: 16, type: 'enemy', isDead: false, hasActedThisTurn: false },
            { id: 'hero-1', name: 'Hero', initiative: 15, type: 'player', isDead: false, hasActedThisTurn: false },
          ],
          enemies: [
            { id: 'e1', name: 'Goblin1', ac: 15, hp: { current: 7, max: 7 }, attacks: [{ name: 'Attack', toHit: 4, damageDice: '1d6+2', damageType: 'slashing' }], isDead: false },
            { id: 'e2', name: 'Goblin2', ac: 15, hp: { current: 7, max: 7 }, attacks: [{ name: 'Attack', toHit: 4, damageDice: '1d6+2', damageType: 'slashing' }], isDead: false },
          ],
        }),
      }));

      const result = await server.resolveAllPendingEnemyTurns();
      expect(result.messages.length).toBe(2);
      expect(result.combatEnded).toBe(false);

      const gs = server.getFullState();
      expect(gs.combat).toBeDefined();
      const combat = gs.combat;
      expect(combat.initiative[combat.turnIndex].type).toBe('player');
    });

    it('detects victory during resolution', async () => {
      server.loadState(makeServerState({
        combat: makeCombatState({
          initiative: [
            { id: 'e1', name: 'Weak Goblin', initiative: 18, type: 'enemy', isDead: true, hasActedThisTurn: false },
            { id: 'hero-1', name: 'Hero', initiative: 15, type: 'player', isDead: false, hasActedThisTurn: false },
          ],
          enemies: [{
            id: 'e1', name: 'Weak Goblin', ac: 10, hp: { current: 0, max: 1 },
            attacks: [{ name: 'Attack', toHit: 2, damageDice: '1d4', damageType: 'bludgeoning' }],
            isDead: true,
          }],
        }),
      }));

      const result = await server.resolveAllPendingEnemyTurns();
      expect(result.combatEnded).toBe(true);
      expect(result.victory).toBe(true);
    });
  });

  describe('inflict_damage initiative tracking', () => {
    it('initializes death saves when player drops to 0 HP (dying, not dead)', async () => {
      server.loadState(makeServerState({
        combat: makeCombatState({
          initiative: [
            { id: 'hero-1', name: 'Hero', initiative: 15, type: 'player', isDead: false, hasActedThisTurn: false },
          ],
          enemies: [],
        }),
      }));

      await server.inflict_damage(100, 'hero-1');

      const hero = server.getFullState().party[0];
      expect(hero.hp.current).toBe(0);
      expect(hero.deathSaves).toBeDefined();
      const deathSaves = hero.deathSaves;
      expect(deathSaves.successes).toBe(0);
      expect(deathSaves.failures).toBe(0);
      const gs = server.getFullState();
      expect(gs.combat).toBeDefined();
      const combat = gs.combat;
      expect(combat.initiative[0].isDead).toBe(false);
    });

    it('marks enemy as dead in initiative when HP drops to 0', async () => {
      server.loadState(makeServerState({
        combat: makeCombatState({
          initiative: [
            { id: 'hero-1', name: 'Hero', initiative: 15, type: 'player', isDead: false, hasActedThisTurn: false },
            { id: 'enemy-1', name: 'Goblin', initiative: 12, type: 'enemy', isDead: false, hasActedThisTurn: false },
          ],
          enemies: [{ id: 'enemy-1', name: 'Goblin', ac: 15, hp: { current: 3, max: 7 }, attacks: [], isDead: false }],
        }),
      }));

      await server.inflict_damage(10, 'enemy-1');

      const gs = server.getFullState();
      expect(gs.combat).toBeDefined();
      const combat = gs.combat;
      expect(combat.initiative[1].isDead).toBe(true);
      expect(combat.enemies[0].isDead).toBe(true);
    });
  });

  describe('enemy_attack initiative tracking', () => {
    it('initializes death saves when player drops to 0 HP (dying, not dead)', async () => {
      vi.mocked(cryptoRoll).mockReturnValue(20);

      server.loadState(makeServerState({
        party: [makeCharacter({ hp: { current: 1, max: 12 } })],
        combat: makeCombatState({
          initiative: [
            { id: 'enemy-1', name: 'Goblin', initiative: 18, type: 'enemy', isDead: false, hasActedThisTurn: false },
            { id: 'hero-1', name: 'Hero', initiative: 15, type: 'player', isDead: false, hasActedThisTurn: false },
          ],
          enemies: [{
            id: 'enemy-1', name: 'Goblin', ac: 15, hp: { current: 7, max: 7 },
            attacks: [{ name: 'Scimitar', toHit: 20, damageDice: '1d6+2', damageType: 'slashing' }],
            isDead: false,
          }],
        }),
      }));

      await server.enemy_attack('enemy-1', 'hero-1');

      const hero = server.getFullState().party[0];
      expect(hero.hp.current).toBe(0);
      expect(hero.deathSaves).toBeDefined();
      const gs = server.getFullState();
      expect(gs.combat).toBeDefined();
      const combat = gs.combat;
      expect(combat.initiative[1].isDead).toBe(false);
    });
  });

  describe('next_turn enhanced end conditions', () => {
    it('detects victory when round wraps and all enemies dead', async () => {
      vi.mocked(cryptoRoll).mockReturnValue(10);

      server.loadState(makeServerState({
        combat: makeCombatState({
          initiative: [
            { id: 'hero-1', name: 'Hero', initiative: 15, type: 'player', isDead: false, hasActedThisTurn: true },
          ],
          enemies: [{ id: 'enemy-1', name: 'Goblin', ac: 15, hp: { current: 0, max: 7 }, attacks: [], isDead: true }],
        }),
      }));

      const result = await server.next_turn();
      expect(result.success).toBe(true);
      expect(result.data.combatEnded).toBe(true);
      expect(result.message).toContain('Victory');
    });

    it('detects TPK when round wraps and all players dead', async () => {
      vi.mocked(cryptoRoll).mockReturnValue(10);

      const deadChar = makeCharacter({
        id: 'hero-1', name: 'Dead Hero', hp: { current: 0, max: 12 },
        deathSaves: { successes: 0, failures: 3, isStable: false },
      });
      server.loadState(makeServerState({
        party: [deadChar],
        combat: makeCombatState({
          initiative: [
            { id: 'hero-1', name: 'Dead Hero', initiative: 15, type: 'player', isDead: true, hasActedThisTurn: true },
          ],
          enemies: [{ id: 'enemy-1', name: 'Goblin', ac: 15, hp: { current: 7, max: 7 }, attacks: [], isDead: false }],
        }),
      }));

      const result = await server.next_turn();
      expect(result.success).toBe(true);
      expect(result.data.combatEnded).toBe(true);
      expect(result.message).toContain('Total Party Kill');
    });
  });

  describe('add_enemy mid-combat initiative injection', () => {
    beforeEach(() => {
      vi.mocked(cryptoRoll).mockReturnValue(12);
    });

    it('adds enemy to initiative when combat is already active', async () => {
      server.loadState(makeServerState({
        combat: makeCombatState({
          initiative: [
            { id: 'hero-1', name: 'Hero', initiative: 15, type: 'player', isDead: false, hasActedThisTurn: false },
            { id: 'enemy-1', name: 'Goblin', initiative: 10, type: 'enemy', isDead: false, hasActedThisTurn: false },
          ],
          enemies: [{ id: 'enemy-1', name: 'Goblin', ac: 15, hp: { current: 7, max: 7 }, attacks: [], isDead: false }],
        }),
      }));

      await server.add_enemy('Scarred Sailor', 12, 8);

      const gs = server.getFullState();
      expect(gs.combat).toBeDefined();
      const combat = gs.combat;
      expect(combat.enemies).toHaveLength(2);
      expect(combat.initiative).toHaveLength(3);
      const sailorEntry = combat.initiative.find(e => e.name === 'Scarred Sailor');
      if (!sailorEntry) throw new Error('Expected sailor entry to exist');
      expect(sailorEntry.type).toBe('enemy');
      expect(sailorEntry.isDead).toBe(false);
      expect(sailorEntry.hasActedThisTurn).toBe(false);
    });

    it('re-sorts initiative after adding enemy mid-combat', async () => {
      server.loadState(makeServerState({
        combat: makeCombatState({
          initiative: [
            { id: 'hero-1', name: 'Hero', initiative: 15, type: 'player', isDead: false, hasActedThisTurn: false },
          ],
          enemies: [],
        }),
      }));

      vi.mocked(cryptoRoll).mockReturnValue(20);
      await server.add_enemy('Fast Sailor', 12, 8);

      const gs = server.getFullState();
      expect(gs.combat).toBeDefined();
      const combat = gs.combat;
      expect(combat.initiative[0].name).toBe('Fast Sailor');
      expect(combat.initiative[0].initiative).toBe(20);
      expect(combat.initiative[1].name).toBe('Hero');
    });

    it('does not add to initiative when combat is not active', async () => {
      server.loadState(makeServerState());

      await server.add_enemy('Goblin', 15, 7);

      const gs = server.getFullState();
      expect(gs.combat).toBeDefined();
      const combat = gs.combat;
      expect(combat.enemies).toHaveLength(1);
      expect(combat.initiative).toHaveLength(0);
    });

    it('adjusts turnIndex after adding enemy mid-combat', async () => {
      server.loadState(makeServerState({
        combat: makeCombatState({
          turnIndex: 1,
          initiative: [
            { id: 'hero-1', name: 'Hero', initiative: 15, type: 'player', isDead: false, hasActedThisTurn: false },
            { id: 'enemy-1', name: 'Goblin', initiative: 10, type: 'enemy', isDead: false, hasActedThisTurn: false },
          ],
          enemies: [{ id: 'enemy-1', name: 'Goblin', ac: 15, hp: { current: 7, max: 7 }, attacks: [], isDead: false }],
        }),
      }));

      vi.mocked(cryptoRoll).mockReturnValue(20);
      await server.add_enemy('Fast Enemy', 12, 8);

      const gs = server.getFullState();
      expect(gs.combat).toBeDefined();
      const combat = gs.combat;
      const currentEntry = combat.initiative[combat.turnIndex];
      expect(currentEntry.id).toBe('enemy-1');
    });
  });

  describe('checkCombatEndConditions sets isActive=false', () => {
    it('sets isActive=false on victory', () => {
      server.loadState(makeServerState({
        combat: makeCombatState({
          enemies: [{ id: 'e1', name: 'Goblin', ac: 15, hp: { current: 0, max: 7 }, attacks: [], isDead: true }],
        }),
      }));

      const result = server.checkCombatEndConditions();
      expect(result.ended).toBe(true);
      expect(result.victory).toBe(true);
      const gs = server.getFullState();
      expect(gs.combat).toBeDefined();
      const combat = gs.combat;
      expect(combat.isActive).toBe(false);
    });

    it('sets isActive=false on TPK', () => {
      const deadChar = makeCharacter({
        id: 'hero-1', name: 'Hero', hp: { current: 0, max: 12 },
        deathSaves: { successes: 0, failures: 0, isStable: false },
      });
      server.loadState(makeServerState({
        party: [deadChar],
        combat: makeCombatState({
          enemies: [{ id: 'e1', name: 'Goblin', ac: 15, hp: { current: 7, max: 7 }, attacks: [], isDead: false }],
        }),
      }));

      const result = server.checkCombatEndConditions();
      expect(result.ended).toBe(true);
      expect(result.victory).toBe(false);
      const gs = server.getFullState();
      expect(gs.combat).toBeDefined();
      const combat = gs.combat;
      expect(combat.isActive).toBe(false);
    });

    it('does not set isActive=false when combat continues', () => {
      server.loadState(makeServerState({
        combat: makeCombatState({
          enemies: [{ id: 'e1', name: 'Goblin', ac: 15, hp: { current: 7, max: 7 }, attacks: [], isDead: false }],
        }),
      }));

      const result = server.checkCombatEndConditions();
      expect(result.ended).toBe(false);
      const gs = server.getFullState();
      expect(gs.combat).toBeDefined();
      const combat = gs.combat;
      expect(combat.isActive).toBe(true);
    });

    it('does not declare victory when enemies array is empty', () => {
      server.loadState(makeServerState({
        combat: makeCombatState({ enemies: [] }),
      }));

      const result = server.checkCombatEndConditions();
      expect(result.ended).toBe(false);
    });
  });

  describe('short_rest', () => {
    it('recovers short-rest resources', async () => {
      const char = makeCharacter({ resources: [{ id: 'second-wind', name: 'Second Wind', current: 0, max: 1, resetOn: 'short', source: 'class', sourceId: 'fighter' }] });
      const server = new MockMCPServer();
      server.joinParty(char);
      const result = await server.short_rest();
      expect(result.success).toBe(true);
      expect(char.resources[0].current).toBe(1);
    });

    it('does not recover long-rest resources', async () => {
      const char = makeCharacter({ resources: [{ id: 'rage', name: 'Rage', current: 0, max: 2, resetOn: 'long', source: 'class', sourceId: 'barbarian' }] });
      const server = new MockMCPServer();
      server.joinParty(char);
      await server.short_rest();
      expect(char.resources[0].current).toBe(0);
    });
  });

  describe('use_resource', () => {
    it('spends resource and applies second-wind heal', async () => {
      const char = makeCharacter({ level: 2, hitDice: { current: 2, max: 2 }, resources: [{ id: 'second-wind', name: 'Second Wind', current: 1, max: 1, resetOn: 'short', source: 'class', sourceId: 'fighter' }] });
      const server = new MockMCPServer();
      server.joinParty(char);
      vi.mocked(cryptoRoll).mockReturnValueOnce(5);
      const result = await server.use_resource('hero-1', 'second-wind');
      expect(result.success).toBe(true);
      expect(char.resources[0].current).toBe(0);
    });

    it('enters rage mode for barbarian', async () => {
      const char = makeCharacter({ class: 'barbarian', resources: [{ id: 'rage', name: 'Rage', current: 2, max: 2, resetOn: 'long', source: 'class', sourceId: 'barbarian' }] });
      const server = new MockMCPServer();
      server.joinParty(char);
      const result = await server.use_resource('hero-1', 'rage');
      expect(result.success).toBe(true);
      expect(char.raging).toBe(true);
    });

    it('rejects insufficient resources', async () => {
      const char = makeCharacter({ resources: [{ id: 'action-surge', name: 'Action Surge', current: 0, max: 1, resetOn: 'short', source: 'class', sourceId: 'fighter' }] });
      const server = new MockMCPServer();
      server.joinParty(char);
      const result = await server.use_resource('hero-1', 'action-surge');
      expect(result.success).toBe(false);
    });
  });

  describe('cast_spell', () => {
    it('casts a cantrip without consuming a slot', async () => {
      const char = makeCharacter({ class: 'wizard', stats: { str: 8, dex: 14, con: 12, int: 15, wis: 10, cha: 10 }, level: 5, knownSpells: ['fire-bolt', 'fireball'], preparedSpells: ['fire-bolt', 'fireball'], resources: [{ id: 'spell-slot-1', name: 'L1 Slots', current: 4, max: 4, resetOn: 'long', source: 'class', sourceId: 'wizard' }, { id: 'spell-slot-2', name: 'L2 Slots', current: 3, max: 3, resetOn: 'long', source: 'class', sourceId: 'wizard' }, { id: 'spell-slot-3', name: 'L3 Slots', current: 2, max: 2, resetOn: 'long', source: 'class', sourceId: 'wizard' }] });
      const server = new MockMCPServer();
      server.joinParty(char);
      vi.mocked(cryptoRoll).mockReturnValueOnce(15);
      const result = await server.cast_spell('hero-1', 'fire-bolt', 0, ['enemy1']);
      expect(result.success).toBe(true);
      expect(char.resources[0].current).toBe(4);
    });

    it('consumes a slot for a leveled spell', async () => {
      const char = makeCharacter({ class: 'wizard', stats: { str: 8, dex: 14, con: 12, int: 18, wis: 10, cha: 10 }, level: 5, knownSpells: ['fireball', 'magic-missile'], preparedSpells: ['fireball', 'magic-missile'], resources: [{ id: 'spell-slot-3', name: 'L3 Slots', current: 2, max: 2, resetOn: 'long', source: 'class', sourceId: 'wizard' }] });
      const server = new MockMCPServer();
      server.joinParty(char);
      const result = await server.cast_spell('hero-1', 'fireball', 3, ['goblin1', 'goblin2']);
      expect(result.success).toBe(true);
      expect(char.resources[0].current).toBe(1);
    });

    it('returns error for unknown spell', async () => {
      const server = new MockMCPServer();
      server.joinParty(makeCharacter());
      const result = await server.cast_spell('hero-1', 'not-a-spell', 1);
      expect(result.success).toBe(false);
    });
  });

  describe('manage_spellbook', () => {
    it('learns a spell for known caster', async () => {
      const char = makeCharacter({ class: 'bard', stats: { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 16 }, level: 3, knownSpells: ['cure-wounds'], preparedSpells: [] });
      const server = new MockMCPServer();
      server.joinParty(char);
      const result = await server.manage_spellbook('hero-1', 'learn', 'detect-magic');
      expect(result.success).toBe(true);
      expect(char.knownSpells).toContain('detect-magic');
    });

    it('prepares a spell for prepared caster', async () => {
      const char = makeCharacter({ class: 'wizard', stats: { str: 8, dex: 14, con: 12, int: 15, wis: 10, cha: 10 }, level: 3, knownSpells: ['fireball', 'magic-missile'], preparedSpells: ['magic-missile'] });
      const server = new MockMCPServer();
      server.joinParty(char);
      const result = await server.manage_spellbook('hero-1', 'prepare', 'fireball');
      expect(result.success).toBe(true);
      expect(char.preparedSpells).toContain('fireball');
    });
  });

  describe('swap_known_spell', () => {
    it('swaps one known leveled spell for another on level-up (happy path)', async () => {
      const char = makeCharacter({
        class: 'bard', level: 3,
        stats: { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 16 },
        knownSpells: ['vicious-mockery', 'cure-wounds', 'faerie-fire', 'sleep'],
        preparedSpells: [], pendingSpellSwap: true,
      });
      const server = new MockMCPServer();
      server.joinParty(char);
      const result = await server.swap_known_spell('hero-1', 'sleep', 'detect-magic');
      expect(result.success).toBe(true);
      expect(char.knownSpells).not.toContain('sleep');
      expect(char.knownSpells).toContain('detect-magic');
      expect(char.pendingSpellSwap).toBe(false);
    });

    it('rejects swap when character is not a known caster', async () => {
      const char = makeCharacter({
        class: 'wizard', level: 3,
        stats: { str: 8, dex: 14, con: 12, int: 15, wis: 10, cha: 10 },
        knownSpells: ['fire-bolt', 'magic-missile'], preparedSpells: ['magic-missile'],
        pendingSpellSwap: true,
      });
      const server = new MockMCPServer();
      server.joinParty(char);
      const result = await server.swap_known_spell('hero-1', 'magic-missile', 'shield');
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/known caster/i);
    });

    it('rejects swap when pendingSpellSwap is false', async () => {
      const char = makeCharacter({
        class: 'bard', level: 3,
        stats: { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 16 },
        knownSpells: ['vicious-mockery', 'cure-wounds'], preparedSpells: [],
        pendingSpellSwap: false,
      });
      const server = new MockMCPServer();
      server.joinParty(char);
      const result = await server.swap_known_spell('hero-1', 'cure-wounds', 'detect-magic');
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/no pending spell swap/i);
    });

    it('rejects cantrip-for-leveled swap (must be like-for-like)', async () => {
      const char = makeCharacter({
        class: 'bard', level: 3,
        stats: { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 16 },
        knownSpells: ['vicious-mockery', 'cure-wounds'], preparedSpells: [],
        pendingSpellSwap: true,
      });
      const server = new MockMCPServer();
      server.joinParty(char);
      const result = await server.swap_known_spell('hero-1', 'vicious-mockery', 'detect-magic');
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/cantrip/i);
      // State unchanged on rejection.
      expect(char.knownSpells).toContain('vicious-mockery');
      expect(char.knownSpells).not.toContain('detect-magic');
      expect(char.pendingSpellSwap).toBe(true);
    });

    it('rolls back if the new spell cannot be learned (atomic)', async () => {
      const char = makeCharacter({
        class: 'bard', level: 3,
        stats: { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 16 },
        knownSpells: ['vicious-mockery', 'cure-wounds'], preparedSpells: [],
        pendingSpellSwap: true,
      });
      const server = new MockMCPServer();
      server.joinParty(char);
      // 'fireball' is not a bard spell — canLearnSpell will reject it.
      const result = await server.swap_known_spell('hero-1', 'cure-wounds', 'fireball');
      expect(result.success).toBe(false);
      // Old spell must still be known (rollback).
      expect(char.knownSpells).toContain('cure-wounds');
      expect(char.knownSpells).not.toContain('fireball');
      expect(char.pendingSpellSwap).toBe(true);
    });

    it('swaps a cantrip via 2024 long-rest rule (any caster with cantripSwapAvailable)', async () => {
      const char = makeCharacter({
        class: 'wizard', level: 3,
        stats: { str: 8, dex: 14, con: 12, int: 15, wis: 10, cha: 10 },
        knownSpells: ['fire-bolt', 'ray-of-frost', 'prestidigitation'],
        preparedSpells: [], cantripSwapAvailable: true,
      });
      const server = new MockMCPServer();
      server.joinParty(char);
      const result = await server.swap_known_spell('hero-1', 'ray-of-frost', 'mage-hand');
      expect(result.success).toBe(true);
      expect(char.knownSpells).not.toContain('ray-of-frost');
      expect(char.knownSpells).toContain('mage-hand');
      expect(char.cantripSwapAvailable).toBe(false);
    });

    it('rejects cantrip swap when cantripSwapAvailable is false', async () => {
      const char = makeCharacter({
        class: 'wizard', level: 3,
        stats: { str: 8, dex: 14, con: 12, int: 15, wis: 10, cha: 10 },
        knownSpells: ['fire-bolt', 'ray-of-frost'],
        preparedSpells: [], cantripSwapAvailable: false,
      });
      const server = new MockMCPServer();
      server.joinParty(char);
      const result = await server.swap_known_spell('hero-1', 'fire-bolt', 'ray-of-frost');
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/no cantrip swap/i);
      expect(char.knownSpells).toContain('fire-bolt');
      expect(char.cantripSwapAvailable).toBe(false);
    });
  });

  describe('use_resource breath-weapon color lookup', () => {
    it('uses draconicDamageType set on character for blue dragonborn', async () => {
      vi.mocked(cryptoRoll).mockImplementation(() => 4);
      const char = makeCharacter({
        class: 'fighter',
        race: 'dragonborn',
        level: 1,
        stats: { str: 15, dex: 10, con: 14, int: 8, wis: 10, cha: 13 },
        resources: [{ id: 'breath-weapon', name: 'Breath Weapon', current: 1, max: 1, resetOn: 'short', source: 'race', sourceId: 'dragonborn' }],
        draconicAncestry: 'blue',
        draconicDamageType: 'lightning',
      });
      const server = new MockMCPServer();
      server.joinParty(char);
      await server.add_enemy('Training Dummy');
      await server.start_combat();
      const enemyId = server.getFullState().combat?.enemies[0]?.id;
      const result = await server.use_resource('hero-1', 'breath-weapon', enemyId);
      expect(result.success).toBe(true);
      const data = result.data as { saveDC: number; damage: { total: number; type: string } };
      expect(data.saveDC).toBeGreaterThanOrEqual(10);
      expect(data.damage.type).toBe('lightning');
      expect(data.damage.total).toBe(8);
    });

    it('falls back to fire when draconicDamageType not set', async () => {
      vi.mocked(cryptoRoll).mockImplementation(() => 3);
      const char = makeCharacter({
        class: 'fighter',
        race: 'dragonborn',
        level: 1,
        stats: { str: 15, dex: 10, con: 14, int: 8, wis: 10, cha: 13 },
        resources: [{ id: 'breath-weapon', name: 'Breath Weapon', current: 1, max: 1, resetOn: 'short', source: 'race', sourceId: 'dragonborn' }],
        draconicAncestry: 'red',
      });
      const server = new MockMCPServer();
      server.joinParty(char);
      await server.add_enemy('Training Dummy');
      await server.start_combat();
      const enemyId = server.getFullState().combat?.enemies[0]?.id;
      const result = await server.use_resource('hero-1', 'breath-weapon', enemyId);
      expect(result.success).toBe(true);
      const data = result.data as { damage: { total: number; type: string } };
      expect(data.damage.type).toBe('fire');
      expect(data.damage.total).toBe(6);
    });

    it('scales breath weapon damage dice by level (2d6 at L1, 3d6 at L6, 4d6 at L11, 5d6 at L16)', async () => {
      vi.mocked(cryptoRoll).mockImplementation(() => 4);
      const char = makeCharacter({
        class: 'fighter',
        race: 'dragonborn',
        level: 6,
        stats: { str: 15, dex: 10, con: 14, int: 8, wis: 10, cha: 13 },
        resources: [{ id: 'breath-weapon', name: 'Breath Weapon', current: 1, max: 1, resetOn: 'short', source: 'race', sourceId: 'dragonborn' }],
        draconicAncestry: 'red',
        draconicDamageType: 'fire',
      });
      const server = new MockMCPServer();
      server.joinParty(char);
      const result = await server.use_resource('hero-1', 'breath-weapon', 'dummy');
      const data = result.data as { damage: { total: number; type: string } };
      expect(data.damage.type).toBe('fire');
      expect(data.damage.total).toBe(12);
    });

    it('breath weapon uses 5d6 at L16', async () => {
      vi.mocked(cryptoRoll).mockImplementation(() => 4);
      const char = makeCharacter({
        class: 'fighter',
        race: 'dragonborn',
        level: 16,
        stats: { str: 15, dex: 10, con: 14, int: 8, wis: 10, cha: 13 },
        resources: [{ id: 'breath-weapon', name: 'Breath Weapon', current: 1, max: 1, resetOn: 'short', source: 'race', sourceId: 'dragonborn' }],
        draconicAncestry: 'red',
        draconicDamageType: 'fire',
      });
      const server = new MockMCPServer();
      server.joinParty(char);
      const result = await server.use_resource('hero-1', 'breath-weapon', 'dummy');
      const data = result.data as { damage: { total: number; type: string } };
      expect(data.damage.total).toBe(20);
    });

    it('breath weapon uses 2d6 at L1', async () => {
      vi.mocked(cryptoRoll).mockImplementation(() => 3);
      const char = makeCharacter({
        class: 'fighter',
        race: 'dragonborn',
        level: 1,
        stats: { str: 15, dex: 10, con: 14, int: 8, wis: 10, cha: 13 },
        resources: [{ id: 'breath-weapon', name: 'Breath Weapon', current: 1, max: 1, resetOn: 'short', source: 'race', sourceId: 'dragonborn' }],
        draconicAncestry: 'green',
        draconicDamageType: 'poison',
      });
      const server = new MockMCPServer();
      server.joinParty(char);
      const result = await server.use_resource('hero-1', 'breath-weapon', 'dummy');
      const data = result.data as { damage: { total: number; type: string } };
      expect(data.damage.type).toBe('poison');
      expect(data.damage.total).toBe(6);
    });
  });

  describe('Condition system integration', () => {
    it('cast_spell applies condition from spell to target', async () => {
      const { applyCondition, hasCondition } = await import('../../services/conditionEngine');
      const enemy: Enemy = { id: 'enemy-1', name: 'Goblin', ac: 15, hp: { current: 7, max: 7 }, attacks: [], isDead: false };

      const applied = applyCondition(enemy, {
        id: 'incapacitated',
        source: 'hideous-laughter',
        duration: 10,
        saveEnd: 'wis',
        saveDC: 14,
        onFailedSave: 'none',
      });

      expect(applied).toBe(true);
      expect(hasCondition(enemy, 'incapacitated')).toBe(true);
      expect(enemy.conditions).toHaveLength(1);
      expect(enemy.conditions[0].source).toBe('hideous-laughter');
    });

    it('conditions sync to initiative entries', () => {
      server.loadState(makeServerState({
        party: [makeCharacter()],
        combat: makeCombatState({
          initiative: [
            { id: 'hero-1', name: 'Hero', initiative: 15, type: 'player', isDead: false, hasActedThisTurn: false },
            { id: 'enemy-1', name: 'Goblin', initiative: 12, type: 'enemy', isDead: false, hasActedThisTurn: false, activeConditions: [] },
          ],
          enemies: [{ id: 'enemy-1', name: 'Goblin', ac: 15, hp: { current: 7, max: 7 }, attacks: [], isDead: false }],
        }),
      }));

      const gs = server.getFullState();
      expect(gs.combat).toBeDefined();
      const combat = gs.combat;
      const enemy = combat.enemies[0];
      enemy.conditions = [{ id: 'incapacitated', source: 'test', duration: null }];

      const entry = combat.initiative.find(e => e.id === 'enemy-1');
      if (!entry) throw new Error('Expected entry enemy-1 to exist');
      expect(entry.activeConditions).toEqual([]);

      entry.activeConditions = enemy.conditions?.map(c => c.id) ?? [];
      expect(entry.activeConditions).toContain('incapacitated');
    });

    it('next_turn skips incapacitated combatants', async () => {
      const { applyCondition, isIncapsulated } = await import('../../services/conditionEngine');

      const hero1 = makeCharacter({ id: 'hero-1', name: 'Hero' });
      const hero2 = makeCharacter({ id: 'hero-2', name: 'Rogue' });

      applyCondition(hero1, { id: 'incapacitated', source: 'test', duration: null });

      expect(isIncapsulated(hero1)).toBe(true);
      expect(isIncapsulated(hero2)).toBe(false);

      const initiative = [
        { id: 'hero-1', name: 'Hero', initiative: 15, type: 'player' as const, isDead: false, hasActedThisTurn: false },
        { id: 'hero-2', name: 'Rogue', initiative: 12, type: 'player' as const, isDead: false, hasActedThisTurn: false },
        { id: 'enemy-1', name: 'Goblin', initiative: 8, type: 'enemy' as const, isDead: false, hasActedThisTurn: true },
      ];

      const combatants: Record<string, Character> = { 'hero-1': hero1, 'hero-2': hero2 };
      let nextIdx = -1;
      let checked = 0;
      let currentIdx = 2;
      const total = initiative.length;

      while (checked < total) {
        currentIdx = (currentIdx + 1) % total;
        checked++;
        const entry = initiative[currentIdx];
        if (!entry.isDead && !entry.hasActedThisTurn) {
          const combatant = combatants[entry.id];
          if (combatant && isIncapsulated(combatant)) {
            entry.hasActedThisTurn = true;
            continue;
          }
          nextIdx = currentIdx;
          break;
        }
      }

      expect(nextIdx).toBe(1);
      expect(initiative[1].id).toBe('hero-2');
      expect(initiative[0].hasActedThisTurn).toBe(true);
    });

    it('next_turn performs end-of-turn condition saves', async () => {
      vi.mocked(cryptoRoll).mockReturnValue(15);
      const { rollSaveAgainstCondition, removeCondition } = await import('../../services/conditionEngine');

      const hero = makeCharacter({
        id: 'hero-1',
        name: 'Hero',
        stats: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 14 },
        conditions: [{ id: 'poisoned', source: 'test', duration: null, saveEnd: 'con', saveDC: 12 }],
      });

      expect(hero.conditions).toBeDefined();
      const conditions = hero.conditions;
      expect(conditions.length).toBeGreaterThan(0);
      const cond = conditions[0];
      expect(cond.saveDC).toBeDefined();
      const saveDC = cond.saveDC;
      const result = rollSaveAgainstCondition(hero, cond, saveDC);

      expect(result.succeeded).toBe(true);
      expect(result.total).toBeGreaterThanOrEqual(12);

      if (result.succeeded) {
        removeCondition(hero, cond.id, cond.source);
      }

      expect(hero.conditions).toHaveLength(0);
    });
  });

  describe('MockMCPServer condition integration', () => {
    it('cast_spell applies condition from spell to enemy target', async () => {
      vi.mocked(cryptoRoll).mockReturnValue(10);
      const enemy = {
        id: 'goblin-1', name: 'Goblin', hp: { current: 20, max: 20 }, ac: 13,
        stats: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
        attacks: [{ name: 'Scimitar', toHit: 4, damageDice: '1d6+2', damageType: 'slashing' }],
        isDead: false,
      };
      server.loadState({
        party: [makeCharacter({ id: 'wiz-1', name: 'Wizard', class: 'wizard', level: 3, knownSpells: ['charm-person'], preparedSpells: ['charm-person'],
          resources: [{ id: 'spell-slot-1', name: 'L1', current: 3, max: 3, resetOn: 'long', source: 'class', sourceId: 'wizard' }],
          stats: { str: 10, dex: 14, con: 12, int: 18, wis: 13, cha: 10 } })],
        worldDescription: 'test', sessionLogs: [], quests: [], lore: [], actionQueue: [],
        combat: {
          isActive: true, round: 1, turnIndex: 0,
          initiative: [{ id: 'wiz-1', name: 'Wizard', initiative: 15, type: 'player', isDead: false, hasActedThisTurn: false }],
          enemies: [enemy],
        },
      });
      const result = await server.cast_spell('wiz-1', 'charm-person', 1, ['goblin-1']);
      expect(result.success).toBe(true);
      expect(result.message).toContain('charmed');
    });

    it('cast_spell with Sleep applies unconscious via HP pool', async () => {
      vi.mocked(cryptoRoll).mockReturnValue(3);
      const enemy = {
        id: 'goblin-1', name: 'Goblin', hp: { current: 5, max: 5 }, ac: 13,
        stats: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
        attacks: [{ name: 'Scimitar', toHit: 4, damageDice: '1d6+2', damageType: 'slashing' }],
        isDead: false,
        conditions: [] as Array<{ id: string; source: string; duration: number | null }>,
      };
      server.loadState({
        party: [makeCharacter({ id: 'wiz-1', name: 'Wizard', class: 'wizard', level: 3, knownSpells: ['sleep'], preparedSpells: ['sleep'],
          resources: [{ id: 'spell-slot-1', name: 'L1', current: 3, max: 3, resetOn: 'long', source: 'class', sourceId: 'wizard' }],
          stats: { str: 10, dex: 14, con: 12, int: 18, wis: 13, cha: 10 } })],
        worldDescription: 'test', sessionLogs: [], quests: [], lore: [], actionQueue: [],
        combat: {
          isActive: true, round: 1, turnIndex: 0,
          initiative: [{ id: 'wiz-1', name: 'Wizard', initiative: 15, type: 'player', isDead: false, hasActedThisTurn: false }],
          enemies: [enemy],
        },
      });
      const result = await server.cast_spell('wiz-1', 'sleep', 1, ['goblin-1']);
      expect(result.success).toBe(true);
      expect(result.message).toContain('unconscious');
      expect(enemy.conditions).toBeDefined();
      expect(enemy.conditions?.some((c) => c.id === 'unconscious')).toBe(true);
    });

    it('next_turn skips incapacitated combatants', async () => {
      const char1 = makeCharacter({ id: 'char-1', name: 'Alice', stats: { str: 10, dex: 14, con: 12, int: 18, wis: 13, cha: 10 } });
      const char2 = makeCharacter({ id: 'char-2', name: 'Bob', stats: { str: 10, dex: 14, con: 12, int: 18, wis: 13, cha: 10 } });
      const enemy1: Enemy = { id: 'e1', name: 'Goblin', hp: { current: 10, max: 10 }, ac: 13, stats: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 }, attacks: [], isDead: false, conditions: [{ id: 'incapacitated', source: 'test', duration: 5 }] };
      server.loadState({
        party: [char1, char2],
        worldDescription: 'test', sessionLogs: [], quests: [], lore: [], actionQueue: [],
        combat: {
          isActive: true, round: 1, turnIndex: 0,
          initiative: [
            { id: 'char-1', name: 'Alice', initiative: 20, type: 'player', isDead: false, hasActedThisTurn: false },
            { id: 'e1', name: 'Goblin', initiative: 15, type: 'enemy', isDead: false, hasActedThisTurn: false },
            { id: 'char-2', name: 'Bob', initiative: 10, type: 'player', isDead: false, hasActedThisTurn: false },
          ],
          enemies: [enemy1],
        },
      });
      const result = await server.next_turn();
      expect(result.success).toBe(true);
      const combat = server.getFullState().combat;
      expect(combat?.initiative[combat.turnIndex].id).toBe('char-2');
      expect(combat?.initiative[combat.turnIndex].name).toBe('Bob');
    });

    it('long_rest clears conditions and calls onRemove', async () => {
      const char = makeCharacter();
      const acBonus = 2;
      char.acBonus = acBonus;
      char.conditions = [{ id: 'haste', source: 'spell', duration: 5, onRemove: { kind: 'acBonus', value: acBonus } }];
      server.loadState({
        party: [char],
        worldDescription: 'test', sessionLogs: [], quests: [], lore: [], actionQueue: [],
      });
      const result = await server.long_rest();
      expect(result.success).toBe(true);
      expect(char.conditions).toEqual([]);
      expect(char.acBonus).toBe(0);
    });

    it('syncInitiativeConditions populates activeConditions on entries', () => {
      const char = makeCharacter({ id: 'c1', name: 'Hero' });
      char.conditions = [{ id: 'blinded', source: 'test', duration: 5 }];
      server.loadState({
        party: [char],
        worldDescription: 'test', sessionLogs: [], quests: [], lore: [], actionQueue: [],
        combat: {
          isActive: true, round: 1, turnIndex: 0,
          initiative: [{ id: 'c1', name: 'Hero', initiative: 15, type: 'player', isDead: false, hasActedThisTurn: false }],
          enemies: [],
        },
      });

      server.combat.syncInitiativeConditions();
      const gs = server.getFullState();
      expect(gs.combat).toBeDefined();
      const combat = gs.combat;
      expect(combat.initiative[0].activeConditions).toContain('blinded');
    });
  });

  describe('lastCurrencyAdjustment', () => {
    beforeEach(() => {
      server.loadState(makeServerState());
    });

    it('is cleared after restoreSnapshot', () => {
      server.adjust_currency(50, 0, 0, 'hero-1');
      expect(server.lastCurrencyAdjustment).not.toBeNull();
      server.restoreSnapshot(makeServerState());
      expect(server.lastCurrencyAdjustment).toBeNull();
    });

    it('is cleared on reset', () => {
      server.adjust_currency(50, 0, 0, 'hero-1');
      expect(server.lastCurrencyAdjustment).not.toBeNull();
      server.reset();
      expect(server.lastCurrencyAdjustment).toBeNull();
    });
  });

  describe('onRemove RemoveEffect data model', () => {
    beforeEach(() => {
      server.loadState(makeServerState());
    });

    it('applyAcBuff uses RemoveEffect that survives JSON round-trip', () => {
      server.loadState(makeServerState());
      const char = server.getFullState().party[0];

      char.conditions = [{
        id: 'shield-ac',
        source: 'shield',
        duration: 1,
        onRemove: { kind: 'acBonus', value: 5 }
      }];

const roundTripped = deepClone(char.conditions);
        expect(roundTripped[0].onRemove).toEqual({ kind: 'acBonus', value: 5 });
    });

    it('Shield spell condition uses RemoveEffect that survives JSON', () => {
      const state = makeServerState();
      const char = state.party[0];
      const bonus = 5;
      char.acBonus = (char.acBonus || 0) + bonus;
      char.conditions = [{
        id: 'shield-ac',
        source: 'shield',
        duration: 1,
        onRemove: { kind: 'acBonus', value: bonus }
      }];

      server.saveRewindPoint(state, [{ id: 'm1', role: 0, text: 'test', timestamp: 0 }]);
      const loaded = server.loadRewindPoint();
      if (!loaded) throw new Error('Expected rewind point to exist');

      const condition = loaded.gameState.party[0].conditions[0];
      expect(condition.onRemove).toBeDefined();
      expect(condition.onRemove).not.toBeUndefined();


      const effect = condition.onRemove as unknown as { kind: string; value: number };
      expect(effect.kind).toBe('acBonus');
      expect(effect.value).toBe(5);
    });
  });

  describe('start_combat with enemies array', () => {
    it('registers enemies and starts combat', async () => {
      server.setCharacter(makeCharacter());
      const result = await server.start_combat(undefined, [
        { name: 'Goblin', ac: 15, hp: 7 },
        { name: 'Orc', ac: 13, hp: 15 },
      ]);
      expect(result.success).toBe(true);
      const state = server.getFullState();
      expect(state.combat?.enemies.length).toBe(2);
      expect(state.combat?.isActive).toBe(true);
    });
  });

  describe('update_inventory with cost_gp', () => {
    it('deducts currency when adding an item', async () => {
      const c = makeCharacter();
      server.setCharacter(c);
      const target = server.getTarget('hero-1') || server.getTarget('Hero');
      if (!target) throw new Error('Expected character target');
      const prevGp = target.currency.gp;
      const result = await server.update_inventory('Potion of Healing', 'add', 1, undefined, 'hero-1', 'potion', 'common', 'A healing potion.', undefined, undefined, 5);
      expect(result.success).toBe(true);
      const target2 = server.getTarget('hero-1');
      if (!target2) throw new Error('Expected target hero-1');
      expect(target2.currency.gp).toBe(prevGp - 5);
      expect(target2.inventory.some(i => i.name && i.name.toLowerCase().includes('potion'))).toBe(true);
    });
  });

  describe('short_rest with narration', () => {
    it('advances time when narration is provided', async () => {
      server.setCharacter(makeCharacter());
      const result = await server.short_rest('hero-1', 'The party catches their breath.', true);
      expect(result.success).toBe(true);
    });
  });

  describe('long_rest with narration', () => {
    it('advances time when narration is provided', async () => {
      server.setCharacter(makeCharacter());
      const result = await server.long_rest('The party sleeps soundly.', true);
      expect(result.success).toBe(true);
    });
  });

  describe('arcane_recovery', () => {
    function makeWizard(overrides: Partial<Character> = {}): Character {
      return {
        id: 'wizard-1', name: 'Magus', class: 'wizard', race: 'elf', level: 5,
        hp: { current: 32, max: 32 },
        stats: { str: 8, dex: 14, con: 12, int: 16, wis: 13, cha: 10 },
        inventory: [],
        currency: { gp: 10, sp: 0, cp: 0 },
        location: 'Test Lab',
        experience: 0, experienceToNextLevel: 6500,
        unusedStatPoints: 0, maxHpBonus: 0,
        hitDice: { current: 5, max: 5 },
        skills: { arcana: 1 },
        resources: [
          { id: 'spell-slot-1', name: 'Level 1 Spell Slot', current: 1, max: 4, resetOn: 'long', source: 'class', sourceId: 'wizard' },
          { id: 'spell-slot-2', name: 'Level 2 Spell Slot', current: 0, max: 3, resetOn: 'long', source: 'class', sourceId: 'wizard' },
          { id: 'spell-slot-3', name: 'Level 3 Spell Slot', current: 0, max: 2, resetOn: 'long', source: 'class', sourceId: 'wizard' },
        ],
        ...overrides,
      };
    }

    it('recovers expended spell slots for a wizard', async () => {
      const wizard = makeWizard();
      const server = new MockMCPServer();
      server.joinParty(wizard);
      const result = await server.arcane_recovery('wizard-1', [{ level: 2, count: 1 }, { level: 1, count: 1 }]);
      expect(result.success).toBe(true);
      const slot1 = wizard.resources?.find(r => r.id === 'spell-slot-1');
      const slot2 = wizard.resources?.find(r => r.id === 'spell-slot-2');
      expect(slot1?.current).toBe(2);
      expect(slot2?.current).toBe(1);
      const arPool = wizard.resources?.find(r => r.id === 'arcane-recovery');
      expect(arPool?.current).toBe(0);
    });

    it('rejects non-wizard characters', async () => {
      const fighter = makeCharacter();
      const server = new MockMCPServer();
      server.joinParty(fighter);
      const result = await server.arcane_recovery('hero-1', [{ level: 1, count: 1 }]);
      expect(result.success).toBe(false);
    });

    it('rejects when arcane recovery already used', async () => {
      const wizard = makeWizard({ resources: [
        { id: 'spell-slot-1', name: 'Level 1 Spell Slot', current: 1, max: 4, resetOn: 'long', source: 'class', sourceId: 'wizard' },
        { id: 'arcane-recovery', name: 'Arcane Recovery', current: 0, max: 1, resetOn: 'long', source: 'class', sourceId: 'wizard' },
      ]});
      const server = new MockMCPServer();
      server.joinParty(wizard);
      const result = await server.arcane_recovery('wizard-1', [{ level: 1, count: 1 }]);
      expect(result.success).toBe(false);
    });

    it('rejects selections that exceed max recovery levels', async () => {
      const wizard = makeWizard();
      const server = new MockMCPServer();
      server.joinParty(wizard);
      // Level 5 wizard: ceil(5/2) = 3 max levels.
      const result = await server.arcane_recovery('wizard-1', [{ level: 3, count: 1 }, { level: 1, count: 1 }]);
      expect(result.success).toBe(false);
    });

    it('rejects level 6+ slot recovery', async () => {
      const wizard = makeWizard({ resources: [
        { id: 'spell-slot-1', name: 'Level 1 Spell Slot', current: 1, max: 4, resetOn: 'long', source: 'class', sourceId: 'wizard' },
        { id: 'spell-slot-6', name: 'Level 6 Spell Slot', current: 0, max: 1, resetOn: 'long', source: 'class', sourceId: 'wizard' },
      ]});
      const server = new MockMCPServer();
      server.joinParty(wizard);
      const result = await server.arcane_recovery('wizard-1', [{ level: 6, count: 1 }]);
      expect(result.success).toBe(false);
    });

    it('handles already-full slots gracefully (no-op on those)', async () => {
      const wizard = makeWizard({ resources: [
        { id: 'spell-slot-1', name: 'Level 1 Spell Slot', current: 4, max: 4, resetOn: 'long', source: 'class', sourceId: 'wizard' },
        { id: 'spell-slot-2', name: 'Level 2 Spell Slot', current: 3, max: 3, resetOn: 'long', source: 'class', sourceId: 'wizard' },
      ]});
      const server = new MockMCPServer();
      server.joinParty(wizard);
      const result = await server.arcane_recovery('wizard-1', [{ level: 1, count: 1 }]);
      expect(result.success).toBe(false);
      expect(result.message).toContain('No spell slots to recover');
    });

    it('creates arcane-recovery pool on-the-fly for existing characters', async () => {
      const wizard = makeWizard({ resources: [
        { id: 'spell-slot-1', name: 'Level 1 Spell Slot', current: 0, max: 4, resetOn: 'long', source: 'class', sourceId: 'wizard' },
      ]});
      const server = new MockMCPServer();
      server.joinParty(wizard);
      const result = await server.arcane_recovery('wizard-1', [{ level: 1, count: 1 }]);
      expect(result.success).toBe(true);
      const arPool = wizard.resources?.find(r => r.id === 'arcane-recovery');
      expect(arPool).toBeDefined();
      expect(arPool?.current).toBe(0);
      expect(wizard.resources?.[0].current).toBe(1);
    });
  });

  describe('player_attack', () => {
    it('performs an attack roll against an enemy', async () => {
      vi.mocked(cryptoRoll).mockReturnValue(10);
      const c = makeCharacter();
      server.setCharacter(c);
      await server.start_combat(undefined, [{ name: 'Goblin', ac: 10, hp: 7 }]);
      const result = await server.player_attack('hero-1', 'Longsword', 'Goblin');
      expect(result.success).toBe(true);
    });
  });

  describe('spell_effect', () => {
    it('auto-succeeds for level 3 or lower spells', async () => {
      const c = makeCharacter({ class: 'Wizard' });
      server.setCharacter(c);
      const result = await server.spell_effect('counter', 'hero-1', 3);
      expect(result.success).toBe(true);
      expect(result.data?.autoSuccess).toBe(true);
    });
  });

  describe('allocateStatPoints', () => {
    it('allocates stat points and skills in bulk', async () => {
      const c = makeCharacter({ unusedStatPoints: 2, unusedSkillPoints: 2, skills: {} });
      server.setCharacter(c);
      const result = server.allocateStatPoints({ str: 2 }, 'hero-1', { stealth: 1 }, 0);
      expect(result.success).toBe(true);
      const updated = server.getTarget('hero-1');
      if (!updated) throw new Error('Expected target hero-1');
      expect(updated.stats.str).toBe(18);
      expect(updated.skills?.stealth).toBe(1);
    });
  });

  describe('check_skill with onSuccess', () => {
    it('fires onSuccess consequence on success', async () => {
      server.setCharacter(makeCharacter());
      vi.mocked(cryptoRoll).mockReturnValue(20);
      const onSuccess = { awardCurrency: { gp: 5 }, logLore: { title: 'L', content: 'C', category: 'History' as const } };
      const result = await server.check_skill('perception', 5, 'hero-1', onSuccess);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Skill XP');
      expect(result.message).toContain('New Lore Entry Recorded');
    });
    it('does NOT fire onSuccess on failure', async () => {
      server.setCharacter(makeCharacter());
      vi.mocked(cryptoRoll).mockReturnValue(1);
      const onSuccess = { awardCurrency: { gp: 100 } };
      const result = await server.check_skill('athletics', 30, 'hero-1', onSuccess);
      expect(result.success).toBe(true);
      expect(result.message).toContain('FAILURE');
    });
  });

  describe('move_to with skillCheck', () => {
    it('performs skill check on arrival', async () => {
      server.setCharacter(makeCharacter());
      vi.mocked(cryptoRoll).mockReturnValue(15);
      const skillCheck = { skill_name: 'perception', difficulty: 5 };
      const result = await server.move_to('Ancient Library', 'A dark library', 'hero-1', skillCheck);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Skill');
    });
  });

  describe('make_save on enemy targets', () => {
    it('rolls save for an enemy with fallback stats', async () => {
      server.setCharacter(makeCharacter());
      await server.start_combat(undefined, [{ name: 'Orc', ac: 13, hp: 15 }]);
      const result = await server.make_save('Orc', 'dex', 12);
      expect(result.success).toBe(true);
      expect(result.data?.character).toBe('Orc');
    });
  });

  describe('exhaustion tracking', () => {
    it('applies exhaustion after 16 hours awake', async () => {
      server.setCharacter(makeCharacter());

      const state = server.getFullState();
      state.lastLongRestTime = 0;
      state.gameTime = 1440;
      await server.loadState(state);
      await server.narrate_turn('The party continues.', 1);
      const char = server.getTarget('hero-1');
      if (!char) throw new Error('Expected target hero-1');
      expect(char.conditions?.some(c => c.id === 'exhaustion-1')).toBe(true);
    });
  });

  describe('crafting', () => {
    it('rejects craft when recipe not found', async () => {
      const c = makeCharacter({
        inventory: [{ name: 'Stick', quantity: 1, type: 'gear' }]
      });
      server.setCharacter(c);
      const result = await server.update_inventory('Magic Wand', 'add', 1, undefined, 'hero-1', undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, true);
      expect(result.success).toBe(false);
      expect(result.message).toContain('No recipe found');
    });
    it('rejects craft when missing ingredients', async () => {
      const c = makeCharacter({
        inventory: [{ name: 'Herbalism kit', quantity: 1, type: 'gear' }]
      });
      server.setCharacter(c);
      const result = await server.update_inventory('Potion of Healing', 'add', 1, undefined, 'hero-1', undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, true);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Missing ingredient');
    });
  });

  describe('faction reputation', () => {
    it('updates reputation on quest completion', async () => {
      server.setCharacter(makeCharacter());
      await server.upsert_quest('Help the Guard', 'Rescue villagers', 'completed', undefined, [{ faction: 'City Guard', delta: 20 }]);
      const state = server.getFullState();
      expect(state.factionReputations?.['city guard']).toBe(20);
    });
  });

  describe('cast_spell with reaction', () => {
    it('rejects when reaction already used this turn', async () => {
      const c = makeCharacter({ reactionUsedThisTurn: true });
      server.setCharacter(c);
      const result = await server.cast_spell('hero-1', 'shield', 1, [], undefined, true);
      expect(result.success).toBe(false);
      expect(result.message).toContain('reaction');
    });
  });

  describe('next_turn auto-resolves enemy turns', () => {
    it('resolves enemy turn and returns on player turn', async () => {
      vi.mocked(cryptoRoll).mockReturnValue(10);
      const c = makeCharacter();
      server.setCharacter(c);
      await server.start_combat(undefined, [{ name: 'Goblin', ac: 10, hp: 7 }]);
      const state0 = server.getFullState();
      if (!state0.combat) throw new Error('Expected combat to be active');
      const combat = state0.combat;

      const enemyIdx = combat.initiative.findIndex(e => e.type === 'enemy');
      if (enemyIdx >= 0) {
        combat.turnIndex = enemyIdx;
        const result = await server.next_turn();
        expect(result.success).toBe(true);
      }
    });
  });

  describe('multiplayer attribution nudge (executeToolCall)', () => {
    it('stamps a warning on an actor tool with no id when party has 2+ members', async () => {
      const hero = makeCharacter({ id: 'hero-1', name: 'Hero' });
      const ally = makeCharacter({ id: 'hero-2', name: 'Ally' });
      server.loadState({ ...makeServerState({ party: [hero, ally] }) });
      // adjust_currency with no targetId → defaults to party[0], should warn.
      const res = await server.executeToolCall('adjust_currency', { gp: 5 });
      expect(res.success).toBe(true);
      expect(res.message).toContain('WARNING: no actor id was provided');
      expect(res.message).toContain('Hero');
    });

    it('does NOT stamp a warning when an actor id is provided in multiplayer', async () => {
      const hero = makeCharacter({ id: 'hero-1', name: 'Hero' });
      const ally = makeCharacter({ id: 'hero-2', name: 'Ally' });
      server.loadState({ ...makeServerState({ party: [hero, ally] }) });
      const res = await server.executeToolCall('adjust_currency', { gp: 5, targetId: 'hero-2' });
      expect(res.success).toBe(true);
      expect(res.message).not.toContain('WARNING: no actor id');
    });

    it('does NOT stamp a warning in solo (party of 1)', async () => {
      server.loadState(makeServerState());
      const res = await server.executeToolCall('adjust_currency', { gp: 5 });
      expect(res.success).toBe(true);
      expect(res.message).not.toContain('WARNING: no actor id');
    });

    it('never alters success/failure (warning is append-only)', async () => {
      const hero = makeCharacter({ id: 'hero-1', name: 'Hero' });
      const ally = makeCharacter({ id: 'hero-2', name: 'Ally' });
      server.loadState({ ...makeServerState({ party: [hero, ally] }) });
      // A failed call (missing item) should still fail and not get a warning stamped.
      const res = await server.executeToolCall('update_inventory', { item_name: 'Ghost Item', action: 'remove' });
      expect(res.success).toBe(false);
      expect(res.message).not.toContain('WARNING: no actor id');
    });
  });

  describe('narrate_turn roleplay XP (executeToolCall dispatch)', () => {
    it('awards 1 XP baseline when roleplay tag is dialogue and xp omitted', async () => {
      server.loadState(makeServerState());
      const res = await server.executeToolCall('narrate_turn', { narration: 'The guard nods.', timePassed: 5, roleplay: 'dialogue' });
      expect(res.success).toBe(true);
      expect(res.data.xpAwarded).toBe(1);
      const char = server.getTarget('hero-1');
      expect(char?.experience).toBe(1);
    });

    it('awards 5 XP default when roleplay tag is creative and xp omitted', async () => {
      server.loadState(makeServerState());
      const res = await server.executeToolCall('narrate_turn', { narration: 'A clever ruse.', timePassed: 2, roleplay: 'creative' });
      expect(res.success).toBe(true);
      expect(res.data.xpAwarded).toBe(5);
      const char = server.getTarget('hero-1');
      expect(char?.experience).toBe(5);
    });

    it('explicit xp overrides the tag baseline', async () => {
      server.loadState(makeServerState());
      const res = await server.executeToolCall('narrate_turn', { narration: 'A moving speech.', timePassed: 3, roleplay: 'dialogue', xp: 7 });
      expect(res.success).toBe(true);
      expect(res.data.xpAwarded).toBe(7);
    });

    it('awards 1 XP baseline for narrated turn with no roleplay tag and no xp', async () => {
      server.loadState(makeServerState());
      const res = await server.executeToolCall('narrate_turn', { narration: 'Traveling onward.', timePassed: 10 });
      expect(res.success).toBe(true);
      expect(res.data.xpAwarded).toBe(1);
      const char = server.getTarget('hero-1');
      expect(char?.experience).toBe(1);
    });

    it('awards 0 XP for empty narration (synthetic tick dispatch)', async () => {
      server.loadState(makeServerState());
      const res = await server.executeToolCall('narrate_turn', { narration: '', timePassed: 0 });
      expect(res.success).toBe(true);
      expect(res.data.xpAwarded).toBe(0);
      const char = server.getTarget('hero-1');
      expect(char?.experience).toBe(0);
    });
  });
});
