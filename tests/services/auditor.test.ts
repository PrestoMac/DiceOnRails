import { describe, it, expect } from 'vitest';
import { auditState, repairState } from '../../services/auditor';
import { GameState, Character } from '../../types';

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: 'test-char',
    name: 'Test Hero',
    class: 'Fighter',
    race: 'Human',
    level: 1,
    hp: { current: 10, max: 10 },
    stats: { str: 14, dex: 10, con: 12, int: 8, wis: 10, cha: 12 },
    inventory: [{ name: 'Sword', quantity: 1 }],
    currency: { gp: 10, sp: 0, cp: 0 },
    location: 'Tavern',
    experience: 0,
    experienceToNextLevel: 300,
    unusedStatPoints: 0,
    maxHpBonus: 0,
    hitDice: { current: 1, max: 1 },
    resources: [],
    knownSpells: [],
    preparedSpells: [],
    racialTraits: [],
    unlockedSubclassFeatures: [],
    ...overrides,
  };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    party: [makeCharacter()],
    worldDescription: 'A dark forest',
    sessionLogs: [],
    quests: [],
    lore: [],
    ...overrides,
  };
}

describe('auditor', () => {
  describe('auditState', () => {
    it('passes all checks for valid state', () => {
      const state = makeState();
      const results = auditState(state);
      expect(results.every(r => r.passed)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });

    it('detects negative HP', () => {
      const state = makeState({ party: [makeCharacter({ hp: { current: -5, max: 10 } })] });
      const results = auditState(state);
      const hpRule = results.find(r => r.rule === 'hp-bounds');
      if (!hpRule) throw new Error('Expected hp-bounds rule in audit results');
      expect(hpRule.passed).toBe(false);
      expect(hpRule.details).toContain('negative HP');
    });

    it('detects HP exceeding max', () => {
      const state = makeState({ party: [makeCharacter({ hp: { current: 15, max: 10 } })] });
      const results = auditState(state);
      const hpRule = results.find(r => r.rule === 'hp-bounds');
      if (!hpRule) throw new Error('Expected hp-bounds rule in audit results');
      expect(hpRule.passed).toBe(false);
    });

    it('detects zero max HP', () => {
      const state = makeState({ party: [makeCharacter({ hp: { current: 0, max: 0 } })] });
      const results = auditState(state);
      const hpRule = results.find(r => r.rule === 'hp-bounds');
      if (!hpRule) throw new Error('Expected hp-bounds rule in audit results');
      expect(hpRule.passed).toBe(false);
    });

    it('detects negative currency', () => {
      const state = makeState({
        party: [makeCharacter({ currency: { gp: -1, sp: 0, cp: 0 } })],
      });
      const results = auditState(state);
      const currencyRule = results.find(r => r.rule === 'currency-non-negative');
      if (!currencyRule) throw new Error('Expected currency-non-negative rule in audit results');
      expect(currencyRule.passed).toBe(false);
    });

    it('detects zero-quantity inventory items', () => {
      const state = makeState({
        party: [makeCharacter({ inventory: [{ name: 'Broken Sword', quantity: 0 }] })],
      });
      const results = auditState(state);
      const invRule = results.find(r => r.rule === 'inventory-quantity-non-negative');
      if (!invRule) throw new Error('Expected inventory-quantity-non-negative rule in audit results');
      expect(invRule.passed).toBe(false);
    });

    it('detects empty character location', () => {
      const state = makeState({ party: [makeCharacter({ location: '' })] });
      const results = auditState(state);
      const locRule = results.find(r => r.rule === 'character-location-exists');
      if (!locRule) throw new Error('Expected character-location-exists rule in audit results');
      expect(locRule.passed).toBe(false);
    });

    it('detects duplicate lore entries', () => {
      const state = makeState({
        lore: [
          { id: '1', title: 'Dragon', category: 'NPC', content: 'x' },
          { id: '2', title: 'Dragon', category: 'NPC', content: 'y' },
        ],
      });
      const results = auditState(state);
      const loreRule = results.find(r => r.rule === 'unique-lore-entries');
      if (!loreRule) throw new Error('Expected unique-lore-entries rule in audit results');
      expect(loreRule.passed).toBe(false);
    });

    it('detects duplicate quest IDs', () => {
      const state = makeState({
        quests: [
          { id: 'q1', title: 'Quest 1', description: '', status: 'active' },
          { id: 'q1', title: 'Quest 2', description: '', status: 'active' },
        ],
      });
      const results = auditState(state);
      const questRule = results.find(r => r.rule === 'quest-id-unique');
      if (!questRule) throw new Error('Expected quest-id-unique rule in audit results');
      expect(questRule.passed).toBe(false);
    });

    it('detects negative XP', () => {
      const state = makeState({ party: [makeCharacter({ experience: -10 })] });
      const results = auditState(state);
      const xpRule = results.find(r => r.rule === 'xp-non-negative');
      if (!xpRule) throw new Error('Expected xp-non-negative rule in audit results');
      expect(xpRule.passed).toBe(false);
    });

    it('detects negative unusedStatPoints', () => {
      const state = makeState({ party: [makeCharacter({ unusedStatPoints: -1 })] });
      const results = auditState(state);
      const statRule = results.find(r => r.rule === 'unused-stat-points-valid');
      if (!statRule) throw new Error('Expected unused-stat-points-valid rule in audit results');
      expect(statRule.passed).toBe(false);
    });

    it('detects zero experienceToNextLevel', () => {
      const state = makeState({ party: [makeCharacter({ experienceToNextLevel: 0 })] });
      const results = auditState(state);
      const xpNextRule = results.find(r => r.rule === 'experience-to-next-level-positive');
      if (!xpNextRule) throw new Error('Expected experience-to-next-level-positive rule in audit results');
      expect(xpNextRule.passed).toBe(false);
    });
  });

  describe('repairState', () => {
    it('fixes negative HP', () => {
      const state = makeState({ party: [makeCharacter({ hp: { current: -5, max: 10 } })] });
      const repaired = repairState(state);
      expect(repaired.party[0].hp.current).toBe(0);
    });

    it('fixes HP exceeding max', () => {
      const state = makeState({ party: [makeCharacter({ hp: { current: 20, max: 10 } })] });
      const repaired = repairState(state);
      expect(repaired.party[0].hp.current).toBe(10);
    });

    it('fixes zero max HP to at least 1', () => {
      const state = makeState({ party: [makeCharacter({ hp: { current: 0, max: 0 } })] });
      const repaired = repairState(state);
      expect(repaired.party[0].hp.max).toBe(1);
    });

    it('fixes negative currency', () => {
      const state = makeState({
        party: [makeCharacter({ currency: { gp: -5, sp: 0, cp: 0 } })],
      });
      const repaired = repairState(state);
      expect(repaired.party[0].currency.gp).toBe(0);
    });

    it('removes zero-quantity items', () => {
      const state = makeState({
        party: [makeCharacter({ inventory: [{ name: 'Item', quantity: 0 }] })],
      });
      const repaired = repairState(state);
      expect(repaired.party[0].inventory).toHaveLength(0);
    });

    it('assigns default location', () => {
      const state = makeState({ party: [makeCharacter({ location: '' })] });
      const repaired = repairState(state);
      expect(repaired.party[0].location).toBe('Unknown Location');
    });

    it('sets negative XP to 0', () => {
      const state = makeState({ party: [makeCharacter({ experience: -100 })] });
      const repaired = repairState(state);
      expect(repaired.party[0].experience).toBe(0);
    });

    it('fixes undefined unusedStatPoints', () => {
      const state = makeState({
        // @ts-expect-error - testing repair of undefined field
        party: [makeCharacter({ unusedStatPoints: undefined })],
      });
      const repaired = repairState(state);
      expect(repaired.party[0].unusedStatPoints).toBe(0);
    });

    it('sets invalid experienceToNextLevel to 300', () => {
      const state = makeState({ party: [makeCharacter({ experienceToNextLevel: 0 })] });
      const repaired = repairState(state);
      expect(repaired.party[0].experienceToNextLevel).toBe(300);
    });
  });

  describe('classes-valid', () => {
    it('backfills missing resources/knownSpells/preparedSpells/racialTraits', () => {
      const char = makeCharacter();
      // @ts-expect-error - testing backfill of deleted properties
      delete (char as Record<string, unknown>).resources;
      // @ts-expect-error - testing backfill of deleted properties
      delete (char as Record<string, unknown>).knownSpells;
      // @ts-expect-error - testing backfill of deleted properties
      delete (char as Record<string, unknown>).preparedSpells;
      // @ts-expect-error - testing backfill of deleted properties
      delete (char as Record<string, unknown>).racialTraits;
      // @ts-expect-error - testing backfill of deleted properties
      delete (char as Record<string, unknown>).unlockedSubclassFeatures;
      const state = makeState({ party: [char] });
      const repaired = repairState(state);
      expect(repaired.party[0].resources).toEqual([]);
      expect(repaired.party[0].knownSpells).toEqual([]);
      expect(repaired.party[0].preparedSpells).toEqual([]);
      expect(repaired.party[0].racialTraits).toEqual([]);
      expect(repaired.party[0].unlockedSubclassFeatures).toEqual([]);
    });
  });

  describe('races-valid', () => {
    it('replaces unknown race with human', () => {
      const char = makeCharacter({ race: 'Klingon' });
      const state = makeState({ party: [char] });
      const results = auditState(state);
      const raceRule = results.find(r => r.rule === 'races-valid');
      if (!raceRule) throw new Error('Expected races-valid rule in audit results');
      expect(raceRule.passed).toBe(false);
      const repaired = repairState(state);
      expect(repaired.party[0].race).toBe('human');
    });

    it('passes for valid races (case-insensitive)', () => {
      const char = makeCharacter({ race: 'dwarf' });
      const state = makeState({ party: [char] });
      const results = auditState(state);
      const raceRule = results.find(r => r.rule === 'races-valid');
      if (!raceRule) throw new Error('Expected races-valid rule in audit results');
      expect(raceRule.passed).toBe(true);
    });
  });

  describe('spells-valid', () => {
    it('strips unknown spells from known list', () => {
      const char = makeCharacter({ knownSpells: ['fireball', 'unknown-spell-xx'], preparedSpells: [] });
      const state = makeState({ party: [char] });
      const repaired = repairState(state);
      expect(repaired.party[0].knownSpells).toEqual(['fireball']);
    });

    it('strips unknown spells from prepared list', () => {
      const char = makeCharacter({ preparedSpells: ['magic-missile', 'fake-spell-123'], knownSpells: [] });
      const state = makeState({ party: [char] });
      const repaired = repairState(state);
      expect(repaired.party[0].preparedSpells).toEqual(['magic-missile']);
    });
  });
});
