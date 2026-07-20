import type { GameState, CombatState, Enemy } from '../../types';

export function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    party: [],
    worldDescription: 'A dark forest',
    sessionLogs: [],
    quests: [],
    lore: [],
    actionQueue: [],
    ...overrides,
  };
}

export function makeCombatState(overrides: Partial<CombatState> = {}): CombatState {
  return {
    isActive: false,
    round: 1,
    turnIndex: 0,
    initiative: [],
    enemies: [],
    ...overrides,
  };
}

export function makeEnemy(overrides: Partial<Enemy> = {}): Enemy {
  return {
    id: 'enemy-test-1',
    name: 'Test Enemy',
    ac: 12,
    hp: { current: 30, max: 30 },
    attacks: [{ name: 'Claw', toHit: 4, damageDice: '1d6+2', damageType: 'slashing' }],
    cr: 1,
    xp: 200,
    size: 'Medium',
    type: 'humanoid',
    isDead: false,
    ...overrides,
  };
}
