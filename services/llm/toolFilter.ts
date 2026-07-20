import { GameState } from '../../types';

export function filterTools(tools: any[], state: GameState): any[] {
  const inCombat = state.combat?.isActive === true;
  const hasEnemies = (state.combat?.enemies?.length ?? 0) > 0;
  const hasUnspentPoints = state.party.some(c =>
    (c.unusedStatPoints ?? 0) > 0 || (c.unusedSkillPoints ?? 0) > 0
  );
  const partyAtFull = state.party.every(c =>
    c.hp.current >= c.hp.max && c.hitDice.current >= c.hitDice.max
  );
  const hasCaster = state.party.some(c =>
    (c.knownSpells?.length ?? 0) > 0 || (c.preparedSpells?.length ?? 0) > 0
  );

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

    
    if (name === 'award_experience' && inCombat) return false;

    return true;
  });
}
