import { describe, it, expect } from 'vitest';
import { tools } from '../../services/llm/toolDefinitions';

const EXPECTED_TOOL_NAMES = [
  'roll_dice', 'add_enemy', 'start_combat', 'next_turn', 'end_combat',
  'make_save', 'roll_death_save', 'check_skill',
  'update_inventory', 'upsert_quest', 'log_lore', 'move_to',
  'adjust_currency', 'inflict_damage', 'long_rest', 'short_rest',
  'level_up', 'cast_spell', 'use_resource', 'manage_spellbook',
  'summon_creature', 'teleport_creature', 'polymorph_creature',
  'cast_ritual', 'spell_effect', 'player_attack', 'narrate_turn',
  // VTT grid tools (Phase 1 — battle map)
  'move_token', 'init_battle_map',
];

describe('Tool Contract', () => {
  it('every tool definition has non-empty name and description', () => {
    for (const tool of tools) {
      expect(tool.function?.name).toBeTruthy();
      expect(tool.function?.description).toBeTruthy();
    }
  });

  it('every tool definition name matches expected handler method', () => {
    for (const tool of tools) {
      expect(EXPECTED_TOOL_NAMES).toContain(tool.function?.name);
    }
  });

  it('all expected handler methods have a matching tool definition', () => {
    const definedNames = new Set(tools.map(t => t.function?.name));
    for (const name of EXPECTED_TOOL_NAMES) {
      expect(definedNames.has(name)).toBe(true);
    }
  });

  it('every tool definition has parameters property', () => {
    for (const tool of tools) {
      expect(tool.function?.parameters).toBeTruthy();
      expect(tool.function?.parameters?.properties).toBeTruthy();
    }
  });

  it('each tool type is "function"', () => {
    for (const tool of tools) {
      expect(tool.type).toBe('function');
    }
  });
});
