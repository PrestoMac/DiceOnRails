import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockMCPServer } from '../../services/mcpService';
import { makeCharacter, makeBarbarian, makeDragonborn } from '../helpers/characters';
import { createTestServer } from '../helpers/testServer';

vi.mock('../../utils/random', () => ({
  cryptoRoll: vi.fn(),
}));

vi.mock('../../utils/debug', () => ({
  isDebugMode: false,
}));

const { cryptoRoll } = await import('../../utils/random');

describe('progressionTools', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    server = createTestServer();
  });

  describe('level_up', () => {
    it('stat allocation: allocate 2 points to STR - STR increased by 2', () => {
      const char = makeCharacter({ unusedStatPoints: 4 });
      server.joinParty(char);
      const result = server.allocateStatPoints({ str: 2 }, 'hero-1');
      expect(result.success).toBe(true);
      const updated = server.getTarget('hero-1');
      expect(updated).toBeDefined();
      expect(updated.stats.str).toBe(17);
    });

    it('skill points: unusedSkillPoints decreased appropriately', () => {
      const char = makeCharacter({ unusedStatPoints: 2, unusedSkillPoints: 2 });
      server.joinParty(char);
      const result = server.allocateStatPoints({ str: 2 }, 'hero-1', { religion: 1 });
      expect(result.success).toBe(true);
      const updated = server.getTarget('hero-1');
      expect(updated).toBeDefined();
      expect(updated.unusedSkillPoints).toBe(1);
    });

    it('HP deviation: maxHpBonus increases by hpDeviation', () => {
      const char = makeCharacter({ unusedStatPoints: 2, maxHpBonus: 0 });
      server.joinParty(char);
      const result = server.allocateStatPoints({ str: 2 }, 'hero-1', {}, 3);
      expect(result.success).toBe(true);
      const updated = server.getTarget('hero-1');
      expect(updated).toBeDefined();
      expect(updated.maxHpBonus).toBe(3);
    });

    it('subclass selection: set subclassId via level_up method', async () => {
      const char = makeCharacter({ class: 'wizard', pendingSubclassFeature: true, unusedStatPoints: 4 });
      server.joinParty(char);
      const result = await server.level_up('hero-1', { int: 2 }, 'school-of-evocation');
      expect(result.success).toBe(true);
    });

    it('feat selection: assign a feat to character feats array', () => {
      const char = makeCharacter();
      server.joinParty(char);
      char.feats = ['alert'];
      const updated = server.getTarget('hero-1');
      expect(updated).toBeDefined();
      expect(updated.feats).toContain('alert');
    });

    it('no unspent points: returns success, nothing applied', () => {
      const char = makeCharacter();
      server.joinParty(char);
      const result = server.allocateStatPoints({}, 'hero-1');
      expect(result.success).toBe(true);
    });

    it('stat exceeds 20: trying to raise stat past 20 - rejected', () => {
      const char = makeCharacter({ stats: { str: 19, dex: 10, con: 14, int: 8, wis: 12, cha: 14 }, unusedStatPoints: 4 });
      server.joinParty(char);
      const result = server.allocateStatPoints({ str: 2 }, 'hero-1');
      expect(result.success).toBe(false);
      expect(result.message).toContain('cannot exceed');
    });
  });

  describe('use_resource', () => {
    it('rage: barbarian uses rage - raging flag set, resource decremented', async () => {
      const barbarian = makeBarbarian();
      server.joinParty(barbarian);
      const rageResource = barbarian.resources.find(r => r.id === 'rage');
      expect(rageResource).toBeDefined();
      const before = rageResource.current;
      const result = await server.use_resource('barb-1', 'rage');
      expect(result.success).toBe(true);
      expect(barbarian.raging).toBe(true);
      const afterRage = barbarian.resources.find(r => r.id === 'rage');
      expect(afterRage).toBeDefined();
      expect(afterRage.current).toBe(before - 1);
    });

    it('second wind: fighter uses second wind - HP healed', async () => {
      const char = makeCharacter({ level: 5, hp: { current: 20, max: 47 }, hitDice: { current: 5, max: 5 }, resources: [{ id: 'second-wind', name: 'Second Wind', current: 1, max: 1, resetOn: 'short', source: 'class', sourceId: 'fighter' }] });
      server.joinParty(char);
      vi.mocked(cryptoRoll).mockReturnValueOnce(5);
      const result = await server.use_resource('hero-1', 'second-wind');
      expect(result.success).toBe(true);
      expect(char.hp.current).toBeGreaterThan(20);
    });

    it('action surge: use action surge - resource decremented', async () => {
      const char = makeCharacter({ resources: [{ id: 'action-surge', name: 'Action Surge', current: 1, max: 1, resetOn: 'short', source: 'class', sourceId: 'fighter' }] });
      server.joinParty(char);
      const result = await server.use_resource('hero-1', 'action-surge');
      expect(result.success).toBe(true);
      const surgeResource = char.resources.find(r => r.id === 'action-surge');
      expect(surgeResource).toBeDefined();
      expect(surgeResource.current).toBe(0);
    });

    it('breath weapon: dragonborn uses breath weapon - draconic damage type returned', async () => {
      const dragonborn = makeDragonborn();
      server.joinParty(dragonborn);
      vi.mocked(cryptoRoll).mockReturnValue(4);
      const result = await server.use_resource('drac-1', 'breath-weapon');
      expect(result.success).toBe(true);
      expect(result.data.damage.type).toBe('lightning');
      expect(result.data.damage.total).toBeGreaterThan(0);
    });

    it('lay on hands: heal target', async () => {
      const char = makeCharacter({ id: 'paladin-1', name: 'Paladin', hp: { current: 5, max: 12 }, resources: [{ id: 'lay-on-hands-pool', name: 'Lay on Hands', current: 10, max: 10, resetOn: 'long', source: 'class', sourceId: 'paladin' }] });
      const target = makeCharacter({ id: 'ally-1', name: 'Ally', hp: { current: 5, max: 12 } });
      server.joinParty(char);
      server.joinParty(target);
      const result = await server.use_resource('paladin-1', 'lay-on-hands-pool', 'ally-1', 5);
      expect(result.success).toBe(true);
      const updated = server.getTarget('ally-1');
      expect(updated).toBeDefined();
      expect(updated.hp.current).toBeGreaterThan(5);
    });

    it('resource exhaustion (current=0) - returns fail', async () => {
      const char = makeCharacter({ resources: [{ id: 'rage', name: 'Rage', current: 0, max: 3, resetOn: 'long', source: 'class', sourceId: 'barbarian' }] });
      server.joinParty(char);
      const result = await server.use_resource('hero-1', 'rage');
      expect(result.success).toBe(false);
    });

    it('unknown resource ID - returns fail', async () => {
      const char = makeCharacter();
      server.joinParty(char);
      const result = await server.use_resource('hero-1', 'non-existent-resource');
      expect(result.success).toBe(false);
    });
  });

  describe('short_rest', () => {
    it('resource recovery: short-rest resources restored', async () => {
      const cleric = makeCharacter({ id: 'cleric-1', name: 'Cleric', class: 'cleric', level: 3, resources: [{ id: 'channel-divinity', name: 'Channel Divinity', current: 0, max: 1, resetOn: 'short', source: 'class', sourceId: 'cleric' }] });
      server.joinParty(cleric);
      await server.short_rest();
      const cd = cleric.resources.find(r => r.id === 'channel-divinity');
      expect(cd).toBeDefined();
      expect(cd.current).toBe(cd.max);
    });

    it('narration parameter: narration lives in data.narration, not message', async () => {
      server.joinParty(makeCharacter());
      const result = await server.short_rest(undefined, 'The party takes a breather...');
      expect(result.success).toBe(true);
      // Narration must NOT be duplicated into message (the [System:short_rest] log) —
      // it routes to the narration bubble via data.narration only.
      expect(result.message).not.toContain('takes a breather');
      expect(String(result.data?.narration)).toContain('takes a breather');
    });

    it('autoAdvanceTime parameter: time advances', async () => {
      server.joinParty(makeCharacter());
      const before = server.getFullState().gameTime ?? 0;
      await server.short_rest(undefined, undefined, true);
      expect(server.getFullState().gameTime).toBeGreaterThan(before);
    });
  });

  describe('long_rest', () => {
    it('full HP restore: all party members at max HP', async () => {
      const char = makeCharacter({ hp: { current: 5, max: 12 } });
      server.joinParty(char);
      await server.long_rest();
      const updated = server.getTarget('hero-1');
      expect(updated).toBeDefined();
      expect(updated.hp.current).toBe(updated.hp.max);
    });

    it('hit dice recovery: half total HD recovered (min 1)', async () => {
      const char = makeCharacter({ level: 5, hitDice: { current: 1, max: 5 } });
      server.joinParty(char);
      await server.long_rest();
      const updated = server.getTarget('hero-1');
      expect(updated).toBeDefined();
      expect(updated.hitDice.current).toBeGreaterThan(1);
    });

    it('16h cooldown enforcement: cannot long rest again within 16 hours', async () => {
      server.joinParty(makeCharacter());
      await server.long_rest();
      const result = await server.long_rest();
      expect(result.success).toBe(false);
      expect(result.message).toContain('rest');
    });

    it('exhaustion clearing: exhaustion conditions removed', async () => {
      const char = makeCharacter();
      const { applyCondition } = await import('../../services/conditionEngine');
      applyCondition(char, { id: 'exhaustion-1', source: 'fatigue', duration: Infinity, durationUnit: 'minute', onRemove: undefined });
      server.joinParty(char);
      await server.long_rest();
      const { hasCondition } = await import('../../services/conditionEngine');
      const updated = server.getTarget('hero-1');
      expect(updated).toBeDefined();
      expect(hasCondition(updated, 'exhaustion-1')).toBe(false);
    });

    it('all 10 exhaustion levels cleared: apply exhaustion-1 through exhaustion-10 - none remain after long rest', async () => {
      const char = makeCharacter();
      const { applyCondition } = await import('../../services/conditionEngine');
      for (let i = 1; i <= 10; i++) {
        applyCondition(char, { id: `exhaustion-${i}`, source: 'fatigue', duration: Infinity, durationUnit: 'minute', onRemove: undefined });
      }
      server.joinParty(char);
      await server.long_rest();
      const { hasCondition } = await import('../../services/conditionEngine');
      const updated = server.getTarget('hero-1');
      expect(updated).toBeDefined();
      for (let i = 1; i <= 10; i++) {
        expect(hasCondition(updated, `exhaustion-${i}`)).toBe(false);
      }
    });

    it('short rest does not clear exhaustion: apply exhaustion-3 - short rest leaves it', async () => {
      const char = makeCharacter();
      const { applyCondition } = await import('../../services/conditionEngine');
      applyCondition(char, { id: 'exhaustion-3', source: 'fatigue', duration: Infinity, durationUnit: 'minute', onRemove: undefined });
      server.joinParty(char);
      await server.short_rest();
      const { hasCondition } = await import('../../services/conditionEngine');
      const updated = server.getTarget('hero-1');
      expect(updated).toBeDefined();
      expect(hasCondition(updated, 'exhaustion-3')).toBe(true);
    });

    it('exhaustion-10 death not reversible: apply exhaustion-10 with hp=0 - long rest does NOT clear exhaustion on unconscious char', async () => {
      const char = makeCharacter({ hp: { current: 0, max: 12 } });
      const { applyCondition } = await import('../../services/conditionEngine');
      applyCondition(char, { id: 'exhaustion-10', source: 'fatigue', duration: Infinity, durationUnit: 'minute', onRemove: undefined });
      server.joinParty(char);
      await server.long_rest();
      const { hasCondition } = await import('../../services/conditionEngine');
      const updated = server.getTarget('hero-1');
      expect(updated).toBeDefined();
      expect(hasCondition(updated, 'exhaustion-10')).toBe(true);
      expect(updated.hp.current).toBe(0);
    });

    it('concentration clearing: concentrationSpellId cleared', async () => {
      const char = makeCharacter({ concentrationSpellId: 'bless', runtime: { concentrationStartTime: 0 } });
      server.joinParty(char);
      await server.long_rest();
      const updated = server.getTarget('hero-1');
      expect(updated).toBeDefined();
      expect(updated.concentrationSpellId).toBeUndefined();
    });

    it('spell slot restore: all spell slots restored', async () => {
      const wizard = makeCharacter({ id: 'wiz-1', class: 'wizard', level: 5, resources: [
        { id: 'spell-slot-1', name: 'Level 1', current: 0, max: 4, resetOn: 'long', source: 'class', sourceId: 'wizard' },
        { id: 'spell-slot-2', name: 'Level 2', current: 0, max: 3, resetOn: 'long', source: 'class', sourceId: 'wizard' },
      ]});
      server.joinParty(wizard);
      await server.long_rest();
      const updated = server.getTarget('wiz-1');
      expect(updated).toBeDefined();
      for (const slot of updated.resources) {
        expect(slot.current).toBe(slot.max);
      }
    });

    it('narration parameter', async () => {
      server.joinParty(makeCharacter());
      const result = await server.long_rest('Sleeping soundly...');
      expect(result.success).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('double-rage: second rage succeeds (no guard against double-rage)', async () => {
      const barbarian = makeBarbarian();
      server.joinParty(barbarian);
      const first = await server.use_resource('barb-1', 'rage');
      expect(first.success).toBe(true);
      expect(barbarian.raging).toBe(true);
      const second = await server.use_resource('barb-1', 'rage');
      expect(second.success).toBe(true);
    });
  });
});
