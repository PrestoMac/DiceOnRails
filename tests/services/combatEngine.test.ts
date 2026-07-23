import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/random', () => ({ cryptoRoll: vi.fn() }));

const { cryptoRoll } = await import('../../utils/random');

import {
  addEnemyToCombat,
  initializeCombat,
  advanceToNextTurn,
  selectBestTarget,
  resolveEnemySingleAttack,
  resolveEnemySingleTurn,
  resolveAllEnemyTurns,
  checkVictoryConditions,
  useCharacterReaction,
  getCurrentCombatActor,
  rollDeathSave,
  makeSavingThrow,
} from '../../services/combatEngine';
import { updateCombatantDeathStatus } from '../../services/characterUtils';

import { applyCondition } from '../../services/conditionEngine';
import { makeCharacter } from '../helpers/characters';
import { makeEnemy, makeCombatState, makeInitiativeEntry } from '../helpers/combat';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(cryptoRoll).mockReset();
});




describe('addEnemyToCombat', () => {
  it('SRD Goblin auto-fills fields (ac=15, hp=7, attacks, cr=0.25, xp=50)', () => {
    const cs = makeCombatState();
    const { enemy } = addEnemyToCombat({ name: 'Goblin' }, cs);
    expect(enemy.ac).toBe(15);
    expect(enemy.hp.max).toBe(7);
    expect(enemy.hp.current).toBe(7);
    expect(enemy.cr).toBe(0.25);
    expect(enemy.xp).toBe(50);
    expect(enemy.attacks).toHaveLength(2);
    expect(enemy.attacks[0].name).toBe('Scimitar');
    expect(enemy.attacks[1].name).toBe('Shortbow');
  });

  it('Custom monster with ac/hp overrides', () => {
    const cs = makeCombatState();
    const { enemy } = addEnemyToCombat({ name: 'Custom', ac: 20, hp: 100 }, cs);
    expect(enemy.ac).toBe(20);
    expect(enemy.hp.max).toBe(100);
    expect(enemy.name).toBe('Custom');
  });

  it('Partial override on SRD (ac=20, hp=999 keeps SRD attacks)', () => {
    const cs = makeCombatState();
    const { enemy } = addEnemyToCombat({ name: 'Goblin', ac: 20, hp: 999 }, cs);
    expect(enemy.ac).toBe(20);
    expect(enemy.hp.max).toBe(999);
    expect(enemy.attacks).toHaveLength(2);
    expect(enemy.attacks[0].name).toBe('Scimitar');
  });

  it('Mid-combat injection rolls initiative, inserts and sorts', () => {
    vi.mocked(cryptoRoll).mockReturnValue(10);
    const entry1 = makeInitiativeEntry({ id: 'p1', name: 'Hero', initiative: 15, type: 'player', hasActedThisTurn: false });
    const entry2 = makeInitiativeEntry({ id: 'e1', name: 'Goblin A', initiative: 5, type: 'enemy', hasActedThisTurn: true });
    const cs = makeCombatState({ isActive: true, turnIndex: 0, initiative: [entry1, entry2] });
    addEnemyToCombat({ name: 'Goblin' }, cs);
    expect(cs.initiative).toHaveLength(3);
    expect(cs.initiative[0].id).toBe('p1');
    expect(cs.initiative[1].id).toMatch(/^enemy-/);

    expect(cs.initiative[1].initiative).toBe(12);
    expect(cs.initiative[2].id).toBe('e1');
  });

  it('Mid-combat initiative uses dex mod from SRD stats (B4 fix)', () => {
    vi.mocked(cryptoRoll).mockReturnValue(8);
    const entry1 = makeInitiativeEntry({ id: 'p1', name: 'Hero', initiative: 15, type: 'player', hasActedThisTurn: false });
    const entry2 = makeInitiativeEntry({ id: 'e1', name: 'Goblin A', initiative: 5, type: 'enemy', hasActedThisTurn: true });
    const cs = makeCombatState({ isActive: true, turnIndex: 0, initiative: [entry1, entry2] });
    const { enemy } = addEnemyToCombat({ name: 'Goblin' }, cs);
    expect(enemy.stats).toBeDefined();
    if (enemy.stats) expect(enemy.stats.dex).toBe(14);
    expect(cs.initiative.find(i => i.id === enemy.id)?.initiative).toBe(10);
  });

  it('Empty name matches first monster via partial includes', () => {
    const cs = makeCombatState();
    const { enemy } = addEnemyToCombat({ name: '' }, cs);
    expect(enemy.name).toBe('');
    expect(enemy.ac).toBe(10);
    expect(enemy.hp.max).toBe(4);
  });

  it('Mid-combat empty initiative', () => {
    vi.mocked(cryptoRoll).mockReturnValue(10);
    const cs = makeCombatState({ isActive: true, turnIndex: 0, initiative: [] });
    addEnemyToCombat({ name: 'Goblin' }, cs);
    expect(cs.initiative).toHaveLength(1);
    expect(cs.initiative[0].name).toBe('Goblin');
  });

  it('Multiple mid-combat insertions', () => {
    vi.mocked(cryptoRoll).mockReturnValue(10);
    const entry1 = makeInitiativeEntry({ id: 'p1', name: 'Hero', initiative: 15, type: 'player', hasActedThisTurn: false });
    const cs = makeCombatState({ isActive: true, turnIndex: 0, initiative: [entry1] });
    addEnemyToCombat({ name: 'Goblin A' }, cs);
    addEnemyToCombat({ name: 'Goblin B' }, cs);
    expect(cs.initiative).toHaveLength(3);
    expect(cs.enemies).toHaveLength(2);
  });

  it('ID uses crypto.randomUUID format (B3 fix — was Math.random)', () => {
    const cs = makeCombatState();
    const { enemy } = addEnemyToCombat({ name: 'Goblin' }, cs);
    expect(enemy.id).toMatch(/^enemy-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});




describe('initializeCombat', () => {
  it('Party + enemy initiative sorted', () => {
    vi.mocked(cryptoRoll).mockReturnValueOnce(10).mockReturnValueOnce(15);
    const ch = makeCharacter({ id: 'hero', name: 'Hero' });
    const enemy = makeEnemy({ id: 'enemy-1', name: 'Orc' });
    const { combatState, initiativeOrder } = initializeCombat([ch], [enemy]);
    expect(combatState.isActive).toBe(true);
    expect(combatState.round).toBe(1);
    expect(initiativeOrder).toHaveLength(2);
    expect(initiativeOrder[0].initiative).toBeGreaterThan(initiativeOrder[1].initiative);
  });

  it('Stable characters skipped', () => {
    vi.mocked(cryptoRoll).mockReturnValue(10);
    const stable = makeCharacter({ id: 'stable', name: 'Stable', deathSaves: { successes: 3, failures: 0, isStable: true } });
    const alive = makeCharacter({ id: 'alive', name: 'Alive' });
    const enemy = makeEnemy({ id: 'enemy-1', name: 'Orc' });
    const { initiativeOrder } = initializeCombat([stable, alive], [enemy]);
    expect(initiativeOrder).toHaveLength(2);
    expect(initiativeOrder.find(e => e.id === 'stable')).toBeUndefined();
  });

  it('Alert feat bonus', () => {
    vi.mocked(cryptoRoll).mockReturnValue(10);
    const ch = makeCharacter({ id: 'hero', name: 'Hero', feats: ['alert'] });
    const enemy = makeEnemy({ id: 'enemy-1', name: 'Orc' });
    const { initiativeOrder } = initializeCombat([ch], [enemy]);
    const heroEntry = initiativeOrder.find(e => e.id === 'hero');
    expect(heroEntry?.initiative).toBe(10 + 5);
  });

  it('Dead enemies excluded', () => {
    vi.mocked(cryptoRoll).mockReturnValue(10);
    const ch = makeCharacter({ id: 'hero', name: 'Hero' });
    const dead = makeEnemy({ id: 'dead-enemy', name: 'Dead', isDead: true });
    const alive = makeEnemy({ id: 'alive-enemy', name: 'Alive' });
    const { initiativeOrder } = initializeCombat([ch], [dead, alive]);
    expect(initiativeOrder).toHaveLength(2);
    expect(initiativeOrder.find(e => e.id === 'dead-enemy')).toBeUndefined();
  });

  it('Sort order verification', () => {
    vi.mocked(cryptoRoll).mockReturnValueOnce(5).mockReturnValueOnce(20);
    const ch = makeCharacter({ id: 'hero', name: 'Hero' });
    const enemy = makeEnemy({ id: 'enemy-1', name: 'Orc' });
    const { initiativeOrder } = initializeCombat([ch], [enemy]);
    expect(initiativeOrder[0].id).toBe('enemy-1');
    expect(initiativeOrder[1].id).toBe('hero');
  });

  it('Party isDead flag', () => {
    vi.mocked(cryptoRoll).mockReturnValue(10);
    const dying = makeCharacter({ id: 'dying', name: 'Dying', hp: { current: 0, max: 12 }, deathSaves: { successes: 0, failures: 2, isStable: false } });
    const enemy = makeEnemy({ id: 'enemy-1', name: 'Orc' });
    const { initiativeOrder } = initializeCombat([dying], [enemy]);
    const entry = initiativeOrder.find(e => e.id === 'dying');
    expect(entry?.isDead).toBe(false);
  });
});




describe('advanceToNextTurn', () => {
  it('Normal advancement', () => {
    const e1 = makeInitiativeEntry({ id: 'p1', name: 'Hero', initiative: 15, type: 'player', hasActedThisTurn: false });
    const e2 = makeInitiativeEntry({ id: 'e1', name: 'Goblin', initiative: 10, type: 'enemy', hasActedThisTurn: false });
    const cs = makeCombatState({ isActive: true, round: 1, turnIndex: 0, initiative: [e1, e2] });
    const result = advanceToNextTurn(cs, [], []);
    expect(result.nextEntry?.id).toBe('e1');
    expect(result.roundChanged).toBe(false);
    expect(cs.turnIndex).toBe(1);
    expect(e1.hasActedThisTurn).toBe(true);
  });

  it('Skip dead entries', () => {
    const e1 = makeInitiativeEntry({ id: 'p1', name: 'Hero', initiative: 15, type: 'player', hasActedThisTurn: false });
    const dead = makeInitiativeEntry({ id: 'dead', name: 'Dead', initiative: 12, type: 'enemy', isDead: true, hasActedThisTurn: false });
    const e2 = makeInitiativeEntry({ id: 'goblin', name: 'Goblin', initiative: 10, type: 'enemy', hasActedThisTurn: false });
    const cs = makeCombatState({ isActive: true, round: 1, turnIndex: 0, initiative: [e1, dead, e2] });
    const result = advanceToNextTurn(cs, [], []);
    expect(result.nextEntry?.id).toBe('goblin');
  });

  it('Skip already-acted entries', () => {
    const e1 = makeInitiativeEntry({ id: 'p1', name: 'Hero', initiative: 15, type: 'player', hasActedThisTurn: false });
    const acted = makeInitiativeEntry({ id: 'acted', name: 'Acted', initiative: 12, type: 'enemy', hasActedThisTurn: true });
    const gob = makeInitiativeEntry({ id: 'goblin', name: 'Goblin', initiative: 10, type: 'enemy', hasActedThisTurn: false });
    const cs = makeCombatState({ isActive: true, round: 1, turnIndex: 0, initiative: [e1, acted, gob] });
    const result = advanceToNextTurn(cs, [], []);
    expect(result.nextEntry?.id).toBe('goblin');
  });

  it('Round wrap when all acted', () => {
    const e1 = makeInitiativeEntry({ id: 'p1', name: 'Hero', initiative: 15, type: 'player', hasActedThisTurn: true });
    const e2 = makeInitiativeEntry({ id: 'e1', name: 'Goblin', initiative: 10, type: 'enemy', hasActedThisTurn: true });
    const cs = makeCombatState({ isActive: true, round: 1, turnIndex: 1, initiative: [e1, e2] });
    const result = advanceToNextTurn(cs, [], []);
    expect(result.roundChanged).toBe(true);
    expect(cs.round).toBe(2);
    expect(result.nextEntry?.id).toBe('p1');
    expect(e1.hasActedThisTurn).toBe(false);
    expect(e2.hasActedThisTurn).toBe(false);
  });

  it('Condition save tick (pass removed, fail stays)', () => {
    const ch = makeCharacter({ id: 'p1', name: 'Hero' });
    applyCondition(ch, { id: 'poisoned', source: 'test', duration: 1, saveEnd: 'con', saveDC: 10 });
    const e1 = makeInitiativeEntry({ id: 'p1', name: 'Hero', initiative: 15, type: 'player', hasActedThisTurn: false });
    const e2 = makeInitiativeEntry({ id: 'e1', name: 'Goblin', initiative: 10, type: 'enemy', hasActedThisTurn: false });
    const cs = makeCombatState({ isActive: true, round: 1, turnIndex: 0, initiative: [e1, e2] });
    vi.mocked(cryptoRoll).mockReturnValueOnce(15);
    const result = advanceToNextTurn(cs, [ch], []);
    expect(result.saveMessages).toHaveLength(1);
    expect(ch.conditions).toHaveLength(0);
    expect(result.nextEntry?.id).toBe('e1');
  });

  it('Condition save tick (fail stays)', () => {
    const ch = makeCharacter({ id: 'p1', name: 'Hero' });
    applyCondition(ch, { id: 'poisoned', source: 'test', duration: 1, saveEnd: 'con', saveDC: 20 });
    const e1 = makeInitiativeEntry({ id: 'p1', name: 'Hero', initiative: 15, type: 'player', hasActedThisTurn: false });
    const e2 = makeInitiativeEntry({ id: 'e1', name: 'Goblin', initiative: 10, type: 'enemy', hasActedThisTurn: false });
    const cs = makeCombatState({ isActive: true, round: 1, turnIndex: 0, initiative: [e1, e2] });
    vi.mocked(cryptoRoll).mockReturnValueOnce(5);
    const result = advanceToNextTurn(cs, [ch], []);
    expect(result.saveMessages).toHaveLength(1);
    expect(ch.conditions).toHaveLength(1);
  });

  it('Condition without saveEnd (no roll)', () => {
    const ch = makeCharacter({ id: 'p1', name: 'Hero' });
    applyCondition(ch, { id: 'blinded', source: 'test', duration: 2 });
    const e1 = makeInitiativeEntry({ id: 'p1', name: 'Hero', initiative: 15, type: 'player', hasActedThisTurn: false });
    const e2 = makeInitiativeEntry({ id: 'e1', name: 'Goblin', initiative: 10, type: 'enemy', hasActedThisTurn: false });
    const cs = makeCombatState({ isActive: true, round: 1, turnIndex: 0, initiative: [e1, e2] });
    const result = advanceToNextTurn(cs, [ch], []);
    expect(result.saveMessages).toHaveLength(0);
    expect(result.nextEntry?.id).toBe('e1');
  });

  it('Round wrap condition expiry', () => {
    const ch = makeCharacter({ id: 'p1', name: 'Hero' });
    applyCondition(ch, { id: 'blinded', source: 'test', duration: 1 });
    const e1 = makeInitiativeEntry({ id: 'p1', name: 'Hero', initiative: 15, type: 'player', hasActedThisTurn: true });
    const e2 = makeInitiativeEntry({ id: 'e1', name: 'Goblin', initiative: 10, type: 'enemy', hasActedThisTurn: true });
    const cs = makeCombatState({ isActive: true, round: 1, turnIndex: 0, initiative: [e1, e2] });
    const result = advanceToNextTurn(cs, [ch], []);
    expect(result.roundChanged).toBe(true);
    expect(result.expiryMessages).toHaveLength(1);
    expect(result.expiryMessages[0]).toContain('blinded');
    expect(ch.conditions).toHaveLength(0);
  });

  it('Incapacitated unconscious skip', () => {
    const ch = makeCharacter({ id: 'p1', name: 'Hero' });
    applyCondition(ch, { id: 'unconscious', source: 'test', duration: 1 });
    const ch2 = makeCharacter({ id: 'p2', name: 'Sidekick' });
    const e1 = makeInitiativeEntry({ id: 'p1', name: 'Hero', initiative: 15, type: 'player', hasActedThisTurn: false });
    const e2 = makeInitiativeEntry({ id: 'p2', name: 'Sidekick', initiative: 12, type: 'player', hasActedThisTurn: false });
    const e3 = makeInitiativeEntry({ id: 'e1', name: 'Goblin', initiative: 10, type: 'enemy', hasActedThisTurn: false });
    const cs = makeCombatState({ isActive: true, round: 1, turnIndex: 0, initiative: [e1, e2, e3] });
    const result = advanceToNextTurn(cs, [ch, ch2], []);
    expect(e1.hasActedThisTurn).toBe(true);
    expect(result.nextEntry?.id).toBe('p2');
  });

  it('Empty initiative triggers round wrap', () => {
    const cs = makeCombatState({ isActive: true, round: 1, turnIndex: 0, initiative: [] });
    const result = advanceToNextTurn(cs, [], []);
    expect(result.nextEntry).toBeNull();
    expect(result.roundChanged).toBe(true);
    expect(cs.round).toBe(2);
  });

  it('Dead current entry with condition', () => {
    const ch = makeCharacter({ id: 'p1', name: 'Hero' });
    applyCondition(ch, { id: 'poisoned', source: 'test', duration: 1 });
    const e1 = makeInitiativeEntry({ id: 'p1', name: 'Hero', initiative: 15, type: 'player', isDead: true, hasActedThisTurn: false });
    const e2 = makeInitiativeEntry({ id: 'e1', name: 'Goblin', initiative: 10, type: 'enemy', hasActedThisTurn: false });
    const cs = makeCombatState({ isActive: true, round: 1, turnIndex: 0, initiative: [e1, e2] });
    const result = advanceToNextTurn(cs, [ch], []);
    expect(result.nextEntry?.id).toBe('e1');
    expect(result.saveMessages).toHaveLength(0);
  });
});




describe('resolveEnemySingleAttack', () => {
  function makeSimpleTarget(acOverride?: number) {
    return makeCharacter({
      inventory: [
        { name: 'Chain Mail', quantity: 1, type: 'armor', stats: { acFormula: acOverride?.toString() ?? '16' }, equipped: true },
      ],
    });
  }

  it('Hit (meets AC)', () => {
    vi.mocked(cryptoRoll).mockReturnValueOnce(12).mockReturnValueOnce(3);
    const enemy = makeEnemy();
    const target = makeSimpleTarget(16);
    const result = resolveEnemySingleAttack(enemy, 0, target);
    expect(result.isHit).toBe(true);
    expect(result.damage).toBe(5);
    expect(target.hp.current).toBe(7);
  });

  it('Miss (below AC)', () => {
    vi.mocked(cryptoRoll).mockReturnValueOnce(7);
    const enemy = makeEnemy();
    const target = makeSimpleTarget(16);
    const result = resolveEnemySingleAttack(enemy, 0, target);
    expect(result.isHit).toBe(false);
    expect(result.damage).toBe(0);
    expect(target.hp.current).toBe(12);
  });

  it('Critical hit (nat20, damage doubled)', () => {
    vi.mocked(cryptoRoll).mockReturnValueOnce(20).mockReturnValueOnce(4).mockReturnValueOnce(5);
    const enemy = makeEnemy();
    const target = makeSimpleTarget(16);
    const result = resolveEnemySingleAttack(enemy, 0, target);
    expect(result.isCrit).toBe(true);
    expect(result.isHit).toBe(true);
    expect(result.damage).toBe(4 + 5 + 2);
    expect(target.hp.current).toBe(12 - 11);
  });

  it('Fumble (nat1)', () => {
    vi.mocked(cryptoRoll).mockReturnValueOnce(1);
    const enemy = makeEnemy();
    const target = makeSimpleTarget(16);
    const result = resolveEnemySingleAttack(enemy, 0, target);
    expect(result.fumble).toBe(true);
    expect(result.isHit).toBe(false);
    expect(target.hp.current).toBe(12);
  });

  it('Invalid attack index', () => {
    const enemy = makeEnemy();
    const target = makeSimpleTarget();
    const result = resolveEnemySingleAttack(enemy, 99, target);
    expect(result.isHit).toBe(false);
    expect(result.message).toContain('has no attack');
  });

  it('Advantage from conditions', () => {
    const enemy = makeEnemy();
    applyCondition(enemy, { id: 'paralyzed', source: 'test', duration: 1 });
    vi.mocked(cryptoRoll).mockReturnValueOnce(5).mockReturnValueOnce(15).mockReturnValueOnce(3);
    const target = makeSimpleTarget(16);
    const result = resolveEnemySingleAttack(enemy, 0, target);
    expect(result.isHit).toBe(true);
    expect(result.damage).toBe(5);
  });

  it('Disadvantage from conditions', () => {
    const enemy = makeEnemy();
    applyCondition(enemy, { id: 'blinded', source: 'test', duration: 1 });
    vi.mocked(cryptoRoll).mockReturnValueOnce(15).mockReturnValueOnce(5).mockReturnValueOnce(3);
    const target = makeSimpleTarget(16);
    const result = resolveEnemySingleAttack(enemy, 0, target);
    expect(result.isHit).toBe(false);
  });

  it('Advantage cancels disadvantage', () => {
    const enemy = makeEnemy();
    applyCondition(enemy, { id: 'paralyzed', source: 'test', duration: 1 });
    applyCondition(enemy, { id: 'blinded', source: 'test', duration: 1 });
    vi.mocked(cryptoRoll).mockReturnValueOnce(12).mockReturnValueOnce(3);
    const target = makeSimpleTarget(16);
    const result = resolveEnemySingleAttack(enemy, 0, target);
    expect(result.isHit).toBe(true);
    expect(result.damage).toBe(5);
  });

  it('Invalid damage dice', () => {
    const enemy = makeEnemy({ attacks: [{ name: 'Bad', toHit: 4, damageDice: 'abc', damageType: 'necrotic' }] });
    vi.mocked(cryptoRoll).mockReturnValueOnce(15);
    const target = makeSimpleTarget();
    const result = resolveEnemySingleAttack(enemy, 0, target);
    expect(result.isHit).toBe(false);
    expect(result.message).toContain('Invalid damage dice');
  });

  it('Hit at 0 HP accumulates death save failure (B5 fix)', () => {
    vi.mocked(cryptoRoll).mockReturnValueOnce(15).mockReturnValueOnce(3);
    const enemy = makeEnemy();
    const target = makeCharacter({ hp: { current: 0, max: 12 }, deathSaves: { successes: 0, failures: 2, isStable: false } });
    const result = resolveEnemySingleAttack(enemy, 0, target);
    expect(result.isHit).toBe(true);
    expect(result.damage).toBeGreaterThan(0);
    expect(target.hp.current).toBe(0);
    expect(target.deathSaves?.failures).toBe(3);
  });
});




describe('resolveEnemySingleTurn', () => {
  it('All attacks on best target (lowest HP ratio)', () => {
    vi.mocked(cryptoRoll).mockReturnValueOnce(15).mockReturnValueOnce(3);
    const enemy = makeEnemy({ attacks: [{ name: 'Claw', toHit: 4, damageDice: '1d6+2', damageType: 'slashing' }] });
    const low = makeCharacter({ id: 'low', name: 'Low HP', hp: { current: 3, max: 20 } });
    const high = makeCharacter({ id: 'high', name: 'High HP', hp: { current: 18, max: 20 } });
    const result = resolveEnemySingleTurn(enemy, [high, low]);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toContain('Low HP');
    expect(low.hp.current).toBeLessThan(3);
  });

  it('No valid targets (all dead)', () => {
    const enemy = makeEnemy();
    const dead = makeCharacter({ id: 'dead', name: 'Dead', hp: { current: 0, max: 12 } });
    const result = resolveEnemySingleTurn(enemy, [dead]);
    expect(result.messages[0]).toContain('has no valid targets');
  });

  it('Multi-attack with different to-hits', () => {
    vi.mocked(cryptoRoll).mockReturnValueOnce(15).mockReturnValueOnce(3).mockReturnValueOnce(10).mockReturnValueOnce(2);
    const enemy = makeEnemy({
      attacks: [
        { name: 'Sword', toHit: 6, damageDice: '1d8+3', damageType: 'slashing' },
        { name: 'Dagger', toHit: 4, damageDice: '1d4+1', damageType: 'piercing' },
      ],
    });
    const target = makeCharacter({ inventory: [{ name: 'Chain Mail', quantity: 1, type: 'armor', stats: { acFormula: '16' }, equipped: true }] });
    const result = resolveEnemySingleTurn(enemy, [target]);
    expect(result.messages).toHaveLength(2);
  });
});




describe('resolveAllEnemyTurns', () => {
  it('One enemy turn resolved', () => {
    vi.mocked(cryptoRoll).mockReturnValue(10);
    const ch = makeCharacter({ id: 'hero', name: 'Hero', hp: { current: 50, max: 50 } });
    const enemy = makeEnemy({ id: 'e1', name: 'Goblin', hp: { current: 1, max: 1 } });
    const entry = makeInitiativeEntry({ id: 'e1', name: 'Goblin', initiative: 15, type: 'enemy', hasActedThisTurn: false });
    const cs = makeCombatState({ isActive: true, round: 1, turnIndex: 0, initiative: [entry], enemies: [enemy] });
    const result = resolveAllEnemyTurns([ch], cs);
    expect(result.messages.length).toBeGreaterThanOrEqual(1);
  });

  it('Victory (all dead)', () => {
    const ch = makeCharacter({ id: 'hero', name: 'Hero' });
    const enemy = makeEnemy({ id: 'e1', name: 'Goblin', isDead: true });
    const entry = makeInitiativeEntry({ id: 'e1', name: 'Goblin', initiative: 15, type: 'enemy', isDead: true, hasActedThisTurn: true });
    const cs = makeCombatState({ isActive: true, round: 1, turnIndex: 0, initiative: [entry], enemies: [enemy] });
    const result = resolveAllEnemyTurns([ch], cs);
    expect(result.combatEnded).toBe(true);
  });

  it('TPK (all party dead)', () => {
    const ch = makeCharacter({ id: 'hero', name: 'Hero', hp: { current: 0, max: 12 } });
    const enemy = makeEnemy({ id: 'e1', name: 'Goblin' });
    const entry = makeInitiativeEntry({ id: 'e1', name: 'Goblin', initiative: 15, type: 'enemy', hasActedThisTurn: false });
    const cs = makeCombatState({ isActive: true, round: 1, turnIndex: 0, initiative: [entry], enemies: [enemy] });
    const result = resolveAllEnemyTurns([ch], cs);
    expect(result.combatEnded).toBe(true);
  });

  it('Safe counter (20 iterations max)', () => {
    vi.mocked(cryptoRoll).mockReturnValue(10);
    const ch = makeCharacter({ id: 'hero', name: 'Hero' });
    const enemy = makeEnemy({ id: 'e1', name: 'Goblin' });
    const entry = makeInitiativeEntry({ id: 'e1', name: 'Goblin', initiative: 15, type: 'enemy', hasActedThisTurn: false });
    const cs = makeCombatState({ isActive: true, round: 1, turnIndex: 0, initiative: [entry], enemies: [enemy] });
    const result = resolveAllEnemyTurns([ch], cs);
    expect(result.combatEnded).toBe(false);
    expect(cs.isActive).toBe(true);
  });

  it('Combat not active breaks immediately', () => {
    const cs = makeCombatState({ isActive: false });
    const result = resolveAllEnemyTurns([], cs);
    expect(result.messages).toHaveLength(0);
    expect(result.combatEnded).toBe(true);
    expect(cs.isActive).toBe(false);
  });
});




describe('checkVictoryConditions', () => {
  it('All enemies dead victory', () => {
    const cs = makeCombatState({ isActive: true, enemies: [makeEnemy({ id: 'e1', isDead: true })] });
    const result = checkVictoryConditions(cs, [makeCharacter()]);
    expect(result.ended).toBe(true);
    expect(result.victory).toBe(true);
  });

  it('All party dead TPK', () => {
    const cs = makeCombatState({ isActive: true, enemies: [makeEnemy({ id: 'e1' })] });
    const dying = makeCharacter({ id: 'hero', hp: { current: 0, max: 12 } });
    const result = checkVictoryConditions(cs, [dying]);
    expect(result.ended).toBe(true);
    expect(result.victory).toBe(false);
  });

  it('Still active no result', () => {
    const cs = makeCombatState({ isActive: true, enemies: [makeEnemy({ id: 'e1' })] });
    const result = checkVictoryConditions(cs, [makeCharacter()]);
    expect(result.ended).toBe(false);
  });

  it('Combat already ended no-op', () => {
    const cs = makeCombatState({ isActive: false, enemies: [makeEnemy({ id: 'e1', isDead: true })] });
    const result = checkVictoryConditions(cs, [makeCharacter({ hp: { current: 0, max: 12 } })]);
    expect(result.ended).toBe(false);
  });
});




describe('rollDeathSave', () => {
  it('Nat20 revives with 1 HP', () => {
    vi.mocked(cryptoRoll).mockReturnValue(20);
    const ch = makeCharacter({ hp: { current: 0, max: 12 }, deathSaves: { successes: 1, failures: 1, isStable: false } });
    const entry = makeInitiativeEntry({ id: 'hero-1', name: 'Valerius', initiative: 10, type: 'player', isDead: false });
    const cs = makeCombatState({ isActive: true, initiative: [entry] });
    const result = rollDeathSave(ch, cs);
    expect(result.revived).toBe(true);
    expect(ch.hp.current).toBe(1);
    expect(ch.deathSaves?.successes).toBe(0);
    expect(ch.deathSaves?.failures).toBe(0);
    expect(entry.isDead).toBe(false);
  });

  it('3 successes stable', () => {
    vi.mocked(cryptoRoll).mockReturnValue(15);
    const ch = makeCharacter({ hp: { current: 0, max: 12 }, deathSaves: { successes: 2, failures: 0, isStable: false } });
    const cs = makeCombatState({ isActive: true });
    const result = rollDeathSave(ch, cs);
    expect(result.isStable).toBe(true);
    expect(result.successes).toBe(3);
  });

  it('3 failures dead', () => {
    vi.mocked(cryptoRoll).mockReturnValue(3);
    const ch = makeCharacter({ hp: { current: 0, max: 12 }, deathSaves: { successes: 0, failures: 2, isStable: false } });
    const entry = makeInitiativeEntry({ id: 'hero-1', name: 'Valerius', initiative: 10, type: 'player' });
    const cs = makeCombatState({ isActive: true, initiative: [entry] });
    const result = rollDeathSave(ch, cs);
    expect(result.died).toBe(true);
    expect(result.failures).toBe(3);
    expect(entry.isDead).toBe(true);
  });

  it('Single success (1/3)', () => {
    vi.mocked(cryptoRoll).mockReturnValue(12);
    const ch = makeCharacter({ hp: { current: 0, max: 12 }, deathSaves: { successes: 0, failures: 0, isStable: false } });
    const cs = makeCombatState();
    const result = rollDeathSave(ch, cs);
    expect(result.revived).toBe(false);
    expect(result.died).toBe(false);
    expect(result.successes).toBe(1);
  });

  it('Single failure (1/3)', () => {
    vi.mocked(cryptoRoll).mockReturnValue(4);
    const ch = makeCharacter({ hp: { current: 0, max: 12 }, deathSaves: { successes: 0, failures: 0, isStable: false } });
    const cs = makeCombatState();
    const result = rollDeathSave(ch, cs);
    expect(result.failures).toBe(1);
  });

  it('Already stable no-op', () => {
    const ch = makeCharacter({ hp: { current: 0, max: 12 }, deathSaves: { successes: 3, failures: 0, isStable: true } });
    const cs = makeCombatState();
    const result = rollDeathSave(ch, cs);
    expect(result.isStable).toBe(true);
    expect(cryptoRoll).not.toHaveBeenCalled();
  });

  it('No prior deathSaves auto-created', () => {
    vi.mocked(cryptoRoll).mockReturnValue(11);
    const ch = makeCharacter({ hp: { current: 0, max: 12 } });
    expect(ch.deathSaves).toBeUndefined();
    const cs = makeCombatState();
    const result = rollDeathSave(ch, cs);
    expect(result.successes).toBe(1);
    expect(ch.deathSaves).toBeDefined();
  });
});




describe('makeSavingThrow', () => {
  it('Basic save success', () => {
    vi.mocked(cryptoRoll).mockReturnValue(14);
    const ch = makeCharacter();
    const result = makeSavingThrow(ch, 'dex', 14);
    expect(result.success).toBe(true);
  });

  it('Basic save failure', () => {
    vi.mocked(cryptoRoll).mockReturnValue(9);
    const ch = makeCharacter();
    const result = makeSavingThrow(ch, 'dex', 14);
    expect(result.success).toBe(false);
  });

  it('Nat20 reported (no auto-success)', () => {
    vi.mocked(cryptoRoll).mockReturnValue(20);
    const ch = makeCharacter();
    const result = makeSavingThrow(ch, 'dex', 25);
    expect(result.nat20).toBe(true);
    expect(result.success).toBe(false);
  });

  it('Resilient feat bonus', () => {
    vi.mocked(cryptoRoll).mockReturnValue(10);
    const ch = makeCharacter({ feats: ['resilient'], featChoices: { resilient: { saveStat: 'con' } } });
    const result = makeSavingThrow(ch, 'con', 12);
    expect(result.success).toBe(true);
    expect(result.modifier).toBeGreaterThan(0);
  });

  it('Resilient wrong stat', () => {
    vi.mocked(cryptoRoll).mockReturnValue(10);
    const ch = makeCharacter({ feats: ['resilient'], featChoices: { resilient: { saveStat: 'con' } } });
    const result = makeSavingThrow(ch, 'dex', 10);
    expect(result.success).toBe(true);
    expect(result.modifier).toBe(0);
  });

  it('Shield Master +2 on dex save', () => {
    vi.mocked(cryptoRoll).mockReturnValue(10);
    const ch = makeCharacter({ feats: ['shield-master'] });
    const result = makeSavingThrow(ch, 'dex', 12);
    expect(result.success).toBe(true);
    expect(result.modifier).toBe(2);
  });
});




describe('selectBestTarget', () => {
  it('Returns lowest HP ratio', () => {
    const low = makeCharacter({ id: 'low', hp: { current: 2, max: 20 } });
    const high = makeCharacter({ id: 'high', hp: { current: 18, max: 20 } });
    const result = selectBestTarget([high, low]);
    expect(result?.id).toBe('low');
  });

  it('Returns undefined when all dead', () => {
    const dead = makeCharacter({ id: 'dead', hp: { current: 0, max: 12 } });
    const result = selectBestTarget([dead]);
    expect(result).toBeUndefined();
  });

  it('Excludes stable characters', () => {
    const stable = makeCharacter({ id: 'stable', hp: { current: 0, max: 12 }, deathSaves: { successes: 3, failures: 0, isStable: true } });
    const alive = makeCharacter({ id: 'alive', hp: { current: 10, max: 20 } });
    const result = selectBestTarget([stable, alive]);
    expect(result?.id).toBe('alive');
  });
});




describe('useCharacterReaction', () => {
  it('First use succeeds', () => {
    const ch = makeCharacter({ reactionAvailable: true, reactionUsedThisTurn: false });
    const result = useCharacterReaction(ch);
    expect(result.success).toBe(true);
    expect(ch.reactionAvailable).toBe(false);
  });

  it('Second use fails', () => {
    const ch = makeCharacter({ reactionAvailable: false, reactionUsedThisTurn: true });
    const result = useCharacterReaction(ch);
    expect(result.success).toBe(false);
  });
});




describe('updateCombatantDeathStatus', () => {
  it('Sets both initiative entry and enemy', () => {
    const enemy = makeEnemy({ id: 'e1', name: 'Goblin' });
    const entry = makeInitiativeEntry({ id: 'e1', name: 'Goblin', type: 'enemy' });
    const cs = makeCombatState({ initiative: [entry], enemies: [enemy] });
    updateCombatantDeathStatus(cs, 'e1', true);
    expect(entry.isDead).toBe(true);
    expect(enemy.isDead).toBe(true);
  });

  it('No-op if ID not found', () => {
    const enemy = makeEnemy({ id: 'e1' });
    const cs = makeCombatState({ enemies: [enemy] });
    updateCombatantDeathStatus(cs, 'nonexistent', true);
    expect(enemy.isDead).toBe(false);
  });
});




describe('getCurrentCombatActor', () => {
  it('Returns current actor', () => {
    const entry = makeInitiativeEntry({ id: 'p1', name: 'Hero', type: 'player' });
    const cs = makeCombatState({ isActive: true, turnIndex: 0, initiative: [entry] });
    const actor = getCurrentCombatActor(cs);
    expect(actor).toEqual({ name: 'Hero', type: 'player', id: 'p1' });
  });

  it('Returns null when combat not active', () => {
    const cs = makeCombatState({ isActive: false });
    const actor = getCurrentCombatActor(cs);
    expect(actor).toBeNull();
  });
});




describe('Integration chains', () => {
  it('Add enemy init combat verify initiative', () => {
    vi.mocked(cryptoRoll).mockReturnValue(10);
    const ch = makeCharacter({ id: 'hero', name: 'Hero' });
    const { enemy } = addEnemyToCombat({ name: 'Goblin' }, makeCombatState());
    const { combatState } = initializeCombat([ch], [enemy]);
    expect(combatState.isActive).toBe(true);
    expect(combatState.initiative).toHaveLength(2);
    expect(combatState.enemies).toHaveLength(1);
    expect(combatState.enemies[0].name).toBe('Goblin');
  });

  it('Advance turn with condition tick', () => {
    const ch = makeCharacter({ id: 'p1', name: 'Hero' });
    applyCondition(ch, { id: 'poisoned', source: 'test', duration: 2, saveEnd: 'con', saveDC: 12 });
    const enemy = makeEnemy({ id: 'e1', name: 'Goblin' });
    const e1 = makeInitiativeEntry({ id: 'p1', name: 'Hero', initiative: 15, type: 'player', hasActedThisTurn: false });
    const e2 = makeInitiativeEntry({ id: 'e1', name: 'Goblin', initiative: 10, type: 'enemy', hasActedThisTurn: false });
    const cs = makeCombatState({ isActive: true, round: 1, turnIndex: 0, initiative: [e1, e2], enemies: [enemy] });
    vi.mocked(cryptoRoll).mockReturnValueOnce(8).mockReturnValueOnce(10);
    const result = advanceToNextTurn(cs, [ch], [enemy]);
    expect(result.saveMessages).toHaveLength(1);
    const r2 = advanceToNextTurn(cs, [ch], [enemy]);
    expect(r2.roundChanged).toBe(true);
  });

  it('Attack kill enemy check victory', () => {
    vi.mocked(cryptoRoll).mockReturnValue(15);
    const ch = makeCharacter({ id: 'hero', name: 'Hero' });
    const enemy = makeEnemy({ id: 'e1', name: 'Goblin' });
    const entry = makeInitiativeEntry({ id: 'e1', name: 'Goblin', initiative: 10, type: 'enemy', hasActedThisTurn: false });
    const cs = makeCombatState({ isActive: true, round: 1, turnIndex: 0, initiative: [entry], enemies: [enemy] });
    enemy.isDead = true;
    entry.isDead = true;
    const vc = checkVictoryConditions(cs, [ch]);
    expect(vc.ended).toBe(true);
    expect(vc.victory).toBe(true);
  });

  it('Multi-round combat flow', () => {
    vi.mocked(cryptoRoll).mockReturnValue(10);
    const ch = makeCharacter({ id: 'hero', name: 'Hero' });
    const enemy = makeEnemy({ id: 'e1', name: 'Goblin' });
    const pe = makeInitiativeEntry({ id: 'hero', name: 'Hero', initiative: 15, type: 'player', hasActedThisTurn: false });
    const ee = makeInitiativeEntry({ id: 'e1', name: 'Goblin', initiative: 10, type: 'enemy', hasActedThisTurn: false });
    const cs = makeCombatState({ isActive: true, round: 1, turnIndex: 0, initiative: [pe, ee], enemies: [enemy] });
    advanceToNextTurn(cs, [ch], [enemy]);
    expect(cs.turnIndex).toBe(1);
    expect(pe.hasActedThisTurn).toBe(true);
    advanceToNextTurn(cs, [ch], [enemy]);
    expect(cs.round).toBe(2);
    expect(cs.turnIndex).toBe(0);
  });
});
