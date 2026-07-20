import type { Enemy, InitiativeEntry, CombatState, ActiveCondition } from '../../types';

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

export function makeInitiativeEntry(overrides: Partial<InitiativeEntry> = {}): InitiativeEntry {
  return {
    id: 'init-1',
    name: 'Test Combatant',
    initiative: 10,
    type: 'player',
    isDead: false,
    hasActedThisTurn: false,
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

export function makeActiveCondition(overrides: Partial<ActiveCondition> = {}): ActiveCondition {
  return {
    id: 'test-condition',
    source: 'test',
    duration: 1,
    ...overrides,
  };
}
