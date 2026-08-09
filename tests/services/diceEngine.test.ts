import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCryptoRoll = vi.hoisted(() => vi.fn());
vi.mock('../../utils/random', () => ({ cryptoRoll: mockCryptoRoll }));

import { rollDice, rollDeathSave } from '../../services/diceEngine';
import { makeCharacter } from '../helpers/characters';

beforeEach(() => {
  vi.clearAllMocks();
  mockCryptoRoll.mockReset();
});

describe('rollDice', () => {
  it('sums a single die roll', () => {
    mockCryptoRoll.mockReturnValue(7);
    expect(rollDice(1, 20)).toBe(7);
  });

  it('sums multiple dice rolls', () => {
    mockCryptoRoll.mockReturnValueOnce(3).mockReturnValueOnce(4).mockReturnValueOnce(5);
    expect(rollDice(3, 6)).toBe(12);
  });

  it('returns 0 for zero count', () => {
    expect(rollDice(0, 20)).toBe(0);
  });

  it('handles different sides', () => {
    mockCryptoRoll.mockReturnValue(1);
    expect(rollDice(1, 4)).toBe(1);
  });

  it('handles large count', () => {
    mockCryptoRoll.mockReturnValue(2);
    expect(rollDice(10, 6)).toBe(20);
  });
});

describe('rollDeathSave', () => {
  it('treats a stable character as stable without rolling', () => {
    const ch = makeCharacter({ deathSaves: { successes: 2, failures: 0, isStable: true } });
    const res = rollDeathSave(ch);
    expect(res.isStable).toBe(true);
    expect(res.roll).toBe(0);
    expect(res.revived).toBe(false);
  });

  it('revives on a natural 20', () => {
    const ch = makeCharacter();
    mockCryptoRoll.mockReturnValue(20);
    const res = rollDeathSave(ch);
    expect(res.revived).toBe(true);
    expect(res.rollSuccess).toBe(true);
    expect(ch.hp.current).toBe(1);
  });

  it('counts a roll of 10+ as a success', () => {
    const ch = makeCharacter();
    mockCryptoRoll.mockReturnValue(15);
    const res = rollDeathSave(ch);
    expect(res.rollSuccess).toBe(true);
    expect(res.successes).toBe(1);
  });

  it('counts a roll below 10 as a failure', () => {
    const ch = makeCharacter();
    mockCryptoRoll.mockReturnValue(4);
    const res = rollDeathSave(ch);
    expect(res.rollSuccess).toBe(false);
    expect(res.failures).toBe(1);
  });

  it('stabilizes after three successes', () => {
    const ch = makeCharacter();
    mockCryptoRoll.mockReturnValue(15);
    rollDeathSave(ch);
    rollDeathSave(ch);
    const res = rollDeathSave(ch);
    expect(res.isStable).toBe(true);
  });

  it('kills after three failures', () => {
    const ch = makeCharacter();
    mockCryptoRoll.mockReturnValue(4);
    rollDeathSave(ch);
    rollDeathSave(ch);
    const res = rollDeathSave(ch);
    expect(res.died).toBe(true);
  });
});
