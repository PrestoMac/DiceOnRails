import { describe, it, expect, beforeEach } from 'vitest';
import { MockMCPServer } from '../../services/mcpService';
import { filterTools } from '../../services/llm/toolFilter';
import { tools } from '../../services/llm/toolDefinitions';
import { makeCharacter, makeWizard } from '../helpers/characters';

describe('toolFilter', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    server = new MockMCPServer();
  });

  function getToolNames(): string[] {
    return filterTools(tools, server.getFullState()).map(t => t.function.name);
  }

  describe('partyAtFull', () => {
    it('hides short_rest and long_rest when all party members have full HP and full Hit Dice', () => {
      server.joinParty(makeCharacter());
      const names = getToolNames();
      expect(names).not.toContain('short_rest');
      expect(names).not.toContain('long_rest');
    });

    it('shows short_rest and long_rest when a party member is below full HP', () => {
      server.joinParty(makeCharacter({ hp: { current: 5, max: 12 } }));
      const names = getToolNames();
      expect(names).toContain('short_rest');
      expect(names).toContain('long_rest');
    });

    it('shows short_rest and long_rest when a party member has 0 Hit Dice remaining', () => {
      server.joinParty(makeCharacter({ hitDice: { current: 0, max: 1 } }));
      const names = getToolNames();
      expect(names).toContain('short_rest');
      expect(names).toContain('long_rest');
    });

    it('hides short_rest and long_rest for empty party ([].every() returns true)', () => {
      const names = getToolNames();
      expect(names).not.toContain('short_rest');
      expect(names).not.toContain('long_rest');
    });
  });

  describe('hasCaster', () => {
    it('shows summon_creature, teleport_creature, polymorph_creature, cast_ritual when party has a caster', () => {
      server.joinParty(makeWizard());
      const names = getToolNames();
      expect(names).toContain('summon_creature');
      expect(names).toContain('teleport_creature');
      expect(names).toContain('polymorph_creature');
      expect(names).toContain('cast_ritual');
    });

    it('hides all 4 caster tools when no party member has spells', () => {
      server.joinParty(makeCharacter());
      const names = getToolNames();
      expect(names).not.toContain('summon_creature');
      expect(names).not.toContain('teleport_creature');
      expect(names).not.toContain('polymorph_creature');
      expect(names).not.toContain('cast_ritual');
    });
  });

  describe('always visible', () => {
    const ALWAYS_TOOLS = [
      'roll_dice', 'check_skill', 'update_inventory', 'adjust_currency',
      'move_to', 'upsert_quest', 'log_lore', 'narrate_turn',
      'make_save', 'use_resource',
      'roll_death_save', 'cast_spell', 'manage_spellbook',
      'spell_effect',
      'add_enemy', 'start_combat',
      'inflict_damage',
    ];

    it('all 17 always-visible tools present in neutral state (exhaustiveness check)', () => {
      const names = getToolNames();
      for (const tool of ALWAYS_TOOLS) {
        expect(names).toContain(tool);
      }
      expect(names.filter(n => ALWAYS_TOOLS.includes(n))).toHaveLength(ALWAYS_TOOLS.length);
    });

    it('all 17 always-visible tools remain visible during combat', async () => {
      server.joinParty(makeCharacter());
      await server.add_enemy('Goblin');
      await server.start_combat();
      const names = getToolNames();
      for (const tool of ALWAYS_TOOLS) {
        expect(names).toContain(tool);
      }
    });
  });

  describe('hasUnspentPoints', () => {
    it('shows level_up when only unusedSkillPoints > 0 (no stat points)', () => {
      server.joinParty(makeCharacter({ unusedStatPoints: 0, unusedSkillPoints: 2 }));
      const names = getToolNames();
      expect(names).toContain('level_up');
    });

    it('hides level_up when no unspent stat or skill points', () => {
      server.joinParty(makeCharacter({ unusedStatPoints: 0, unusedSkillPoints: 0 }));
      const names = getToolNames();
      expect(names).not.toContain('level_up');
    });

    it('shows level_up when unusedStatPoints > 0 (no skill points)', () => {
      server.joinParty(makeCharacter({ unusedStatPoints: 2, unusedSkillPoints: 0 }));
      const names = getToolNames();
      expect(names).toContain('level_up');
    });
  });
});
