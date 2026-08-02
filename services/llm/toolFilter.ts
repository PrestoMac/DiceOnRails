import { GameState } from '../../types';

/**
 * Filters the available tool definitions based on the current game state.
 * Certain tools are hidden unless specific conditions are met (e.g. combat-active, party not at full HP, has caster).
 * @param tools - The full array of tool definitions.
 * @param state - The current game state.
 * @returns A filtered array of tool definitions visible to the LLM.
 */
export function filterTools(tools: Array<{ function: { name: string } }>, state: GameState): Array<{ function: { name: string } }> {
  const inCombat = state.combat?.isActive === true;
  const hasUnspentPoints = state.party.some(c =>
    (c.unusedStatPoints ?? 0) > 0 || (c.unusedSkillPoints ?? 0) > 0
  );
  const partyAtFull = state.party.every(c =>
    c.hp.current >= c.hp.max &&
    c.hitDice.current >= c.hitDice.max &&
    !(c.conditions ?? []).some(cond => cond.id.startsWith('exhaustion-')) &&
    !(c.resources ?? []).some(r => r.current < r.max)
  );
  const hasCaster = state.party.some(c =>
    (c.knownSpells?.length ?? 0) > 0 || (c.preparedSpells?.length ?? 0) > 0
  );
  const hasDruid = state.party.some(c => c.class === 'druid');

  return tools.filter(t => {
    const name = t.function.name;



    const always = [
      'roll_dice', 'check_skill', 'update_inventory', 'adjust_currency',
      'move_to', 'upsert_quest', 'log_lore', 'narrate_turn',
      'make_save', 'use_resource',
      'roll_death_save', 'cast_spell', 'manage_spellbook',
      'spell_effect',

      'add_enemy', 'start_combat',

      'inflict_damage'
    ];
    if (always.includes(name)) return true;


    if (['next_turn', 'end_combat', 'player_attack'].includes(name)) {
      return inCombat;
    }


    if (name === 'level_up') {
      return hasUnspentPoints;
    }


    if (['short_rest', 'long_rest'].includes(name)) return !partyAtFull;


    if (['summon_creature', 'teleport_creature', 'polymorph_creature',
         'cast_ritual'].includes(name)) {
      return hasCaster;
    }

    if (name === 'natural_recovery') return hasDruid;

    return true;
  });
}
