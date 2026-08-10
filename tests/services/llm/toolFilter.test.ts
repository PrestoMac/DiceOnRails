import { describe, it, expect } from 'vitest';
import { GameState } from '../../../types';
import { filterTools } from '../../../services/llm/toolFilter';
import { tools } from '../../../services/llm/tools';

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    party: [],
    worldDescription: '',
    sessionLogs: [],
    quests: [],
    lore: [],
    ...overrides,
  };
}

function toolNames(filtered: { function?: { name?: string }; name?: string }[]): string[] {
  return filtered.map(t => t.function?.name || t.name);
}

describe('toolFilter', () => {
  it('keeps always-visible tools when not in combat', () => {
    const state = makeState({ party: [] });
    const filtered = filterTools(tools, state);
    const names = toolNames(filtered);
    expect(names).toContain('roll_dice');
    expect(names).toContain('check_skill');
    expect(names).toContain('update_inventory');
    expect(names).toContain('move_to');
    expect(names).toContain('start_combat');
    expect(names).toContain('add_enemy');
    expect(names).toContain('inflict_damage');
  });

  it('hides combat-only tools when not in combat', () => {
    const state = makeState({ party: [] });
    const filtered = filterTools(tools, state);
    const names = toolNames(filtered);
    expect(names).not.toContain('next_turn');
    expect(names).not.toContain('end_combat');
    expect(names).not.toContain('player_attack');
  });

  it('shows combat tools during combat', () => {
    const state = makeState({
      party: [],
      combat: { isActive: true, round: 1, turnIndex: 0, initiative: [], enemies: [] },
    });
    const filtered = filterTools(tools, state);
    const names = toolNames(filtered);
    expect(names).toContain('next_turn');
    expect(names).toContain('end_combat');
    expect(names).toContain('player_attack');
  });

  it('hides level_up when no unused points', () => {
    const state = makeState({
      party: [{ id: 'p1', name: 'Test', class: 'fighter', race: 'human', level: 1,
        hp: { current: 10, max: 10 },
        stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        inventory: [], currency: { gp: 0, sp: 0, cp: 0 }, location: '',
        experience: 0, experienceToNextLevel: 300, unusedStatPoints: 0,
        maxHpBonus: 0, hitDice: { current: 1, max: 1 },
      }],
    });
    const filtered = filterTools(tools, state);
    const names = toolNames(filtered);
    expect(names).not.toContain('level_up');
  });

  it('shows level_up when points available', () => {
    const state = makeState({
      party: [{ id: 'p1', name: 'Test', class: 'fighter', race: 'human', level: 1,
        hp: { current: 10, max: 10 },
        stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        inventory: [], currency: { gp: 0, sp: 0, cp: 0 }, location: '',
        experience: 0, experienceToNextLevel: 300, unusedStatPoints: 2,
        maxHpBonus: 0, hitDice: { current: 1, max: 1 },
      }],
    });
    const filtered = filterTools(tools, state);
    const names = toolNames(filtered);
    expect(names).toContain('level_up');
  });
});
