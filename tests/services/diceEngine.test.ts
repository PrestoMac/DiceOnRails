import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCryptoRoll = vi.hoisted(() => vi.fn());
vi.mock('../../utils/random', () => ({ cryptoRoll: mockCryptoRoll }));

import {
  rollDice,
  rollDiceWithAdvantage,
  calculateModifier,
  getProficiencyBonus,
  rollAttackRoll,
  rollDamage,
  rollSkillCheck,
  rollSavingThrow,
  rollDeathSave,
} from '../../services/diceEngine';

const defaultStats = { str: 16, dex: 14, con: 14, int: 8, wis: 12, cha: 10 };

function makeAttackParams(overrides: Partial<Parameters<typeof rollAttackRoll>[0]> = {}): Parameters<typeof rollAttackRoll>[0] {
  return {
    attackerLevel: 1,
    attackerStats: { str: 16, dex: 14 },
    weaponProperties: [],
    weaponName: 'Longsword',
    targetAc: 14,
    isOffHand: false,
    ...overrides,
  };
}

function makeDamageParams(overrides: Partial<Parameters<typeof rollDamage>[0]> = {}): Parameters<typeof rollDamage>[0] {
  return {
    weaponDamageDice: '1d8',
    weaponDamageType: 'piercing',
    modifier: 0,
    isCritical: false,
    isOffHand: false,
    ...overrides,
  };
}

function makeSkillParams(overrides: Partial<Parameters<typeof rollSkillCheck>[0]> = {}): Parameters<typeof rollSkillCheck>[0] {
  return {
    characterStats: defaultStats,
    characterLevel: 1,
    skillName: 'athletics',
    skillProficiency: 0,
    difficulty: 14,
    ...overrides,
  };
}

function makeSavingThrowParams(overrides: Partial<Parameters<typeof rollSavingThrow>[0]> = {}): Parameters<typeof rollSavingThrow>[0] {
  return {
    characterStats: defaultStats,
    characterLevel: 1,
    stat: 'str',
    dc: 14,
    ...overrides,
  };
}

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

describe('rollDiceWithAdvantage', () => {
  it('returns first roll when no advantage', () => {
    mockCryptoRoll.mockReturnValue(10);
    expect(rollDiceWithAdvantage(1, 20, false)).toBe(10);
  });

  it('returns max of two rolls with advantage', () => {
    mockCryptoRoll.mockReturnValueOnce(5).mockReturnValueOnce(15);
    expect(rollDiceWithAdvantage(1, 20, true)).toBe(15);
  });

  it('handles identical rolls', () => {
    mockCryptoRoll.mockReturnValue(8);
    expect(rollDiceWithAdvantage(1, 20, true)).toBe(8);
  });

  it('returns first when it is higher', () => {
    mockCryptoRoll.mockReturnValueOnce(18).mockReturnValueOnce(7);
    expect(rollDiceWithAdvantage(1, 20, true)).toBe(18);
  });

  it('works with multiple dice', () => {
    mockCryptoRoll.mockReturnValueOnce(6).mockReturnValueOnce(3).mockReturnValueOnce(4).mockReturnValueOnce(9);
    expect(rollDiceWithAdvantage(2, 6, true)).toBe(13);
  });
});

describe('calculateModifier', () => {
  it('stat 10 returns 0', () => expect(calculateModifier(10)).toBe(0));
  it('stat 20 returns +5', () => expect(calculateModifier(20)).toBe(5));
  it('stat 30 returns +10', () => expect(calculateModifier(30)).toBe(10));
  it('stat 0 returns -5', () => expect(calculateModifier(0)).toBe(-5));
  it('stat 1 returns -5', () => expect(calculateModifier(1)).toBe(-5));
  it('stat 8 returns -1', () => expect(calculateModifier(8)).toBe(-1));
  it('stat 9 returns -1', () => expect(calculateModifier(9)).toBe(-1));
  it('stat 11 returns 0', () => expect(calculateModifier(11)).toBe(0));
  it('stat -5 returns -8', () => expect(calculateModifier(-5)).toBe(-8));
});

describe('getProficiencyBonus', () => {
  const pb = (l: number) => getProficiencyBonus({ level: l });
  it('level 1 returns 2', () => expect(pb(1)).toBe(2));
  it('level 4 returns 2', () => expect(pb(4)).toBe(2));
  it('level 5 returns 3', () => expect(pb(5)).toBe(3));
  it('level 9 returns 4', () => expect(pb(9)).toBe(4));
  it('level 13 returns 5', () => expect(pb(13)).toBe(5));
  it('level 17 returns 6', () => expect(pb(17)).toBe(6));
  it('level 20 returns 6', () => expect(pb(20)).toBe(6));
  it('level 0 returns 1', () => expect(pb(0)).toBe(1));
  it('level -3 returns 1', () => expect(pb(-3)).toBe(1));
});

describe('rollAttackRoll', () => {
  it('melee hit', () => {
    mockCryptoRoll.mockReturnValue(10);
    const result = rollAttackRoll(makeAttackParams({ targetAc: 14 }));
    expect(result.hit).toBe(true);
    expect(result.total).toBe(15);
    expect(result.dieRoll).toBe(10);
  });

  it('melee miss', () => {
    mockCryptoRoll.mockReturnValue(10);
    const result = rollAttackRoll(makeAttackParams({ targetAc: 16 }));
    expect(result.hit).toBe(false);
    expect(result.total).toBe(15);
  });

  it('ranged uses dex modifier', () => {
    mockCryptoRoll.mockReturnValue(10);
    const result = rollAttackRoll(makeAttackParams({ weaponProperties: ['ranged'], targetAc: 14 }));
    expect(result.hit).toBe(true);
    expect(result.total).toBe(14);
  });

  it('bow name detected as ranged', () => {
    mockCryptoRoll.mockReturnValue(10);
    const result = rollAttackRoll(makeAttackParams({ weaponName: 'Shortbow', targetAc: 14 }));
    expect(result.hit).toBe(true);
    expect(result.total).toBe(14);
  });

  it('crossbow name detected as ranged', () => {
    mockCryptoRoll.mockReturnValue(10);
    const result = rollAttackRoll(makeAttackParams({ weaponName: 'Hand Crossbow', targetAc: 14 }));
    expect(result.hit).toBe(true);
    expect(result.total).toBe(14);
  });

  it('javelin name detected as ranged', () => {
    mockCryptoRoll.mockReturnValue(10);
    const result = rollAttackRoll(makeAttackParams({ weaponName: 'Javelin', targetAc: 14 }));
    expect(result.hit).toBe(true);
    expect(result.total).toBe(14);
  });

  it('dart name detected as ranged', () => {
    mockCryptoRoll.mockReturnValue(10);
    const result = rollAttackRoll(makeAttackParams({ weaponName: 'Dart', targetAc: 14 }));
    expect(result.hit).toBe(true);
    expect(result.total).toBe(14);
  });

  it('sling name detected as ranged', () => {
    mockCryptoRoll.mockReturnValue(10);
    const result = rollAttackRoll(makeAttackParams({ weaponName: 'Sling', targetAc: 14 }));
    expect(result.hit).toBe(true);
    expect(result.total).toBe(14);
  });

  it('nat20 auto-hit regardless of AC', () => {
    mockCryptoRoll.mockReturnValue(20);
    const result = rollAttackRoll(makeAttackParams({ targetAc: 999 }));
    expect(result.isCritical).toBe(true);
    expect(result.hit).toBe(true);
    expect(result.dieRoll).toBe(20);
  });

  it('nat1 auto-miss regardless of AC', () => {
    mockCryptoRoll.mockReturnValue(1);
    const result = rollAttackRoll(makeAttackParams({ targetAc: 0 }));
    expect(result.isFumble).toBe(true);
    expect(result.hit).toBe(false);
    expect(result.dieRoll).toBe(1);
  });

  it('Alert feat does not affect attack roll (B1 — was incorrectly adding +5)', () => {
    mockCryptoRoll.mockReturnValue(10);
    const result = rollAttackRoll(makeAttackParams({ targetAc: 19, hasAlertFeat: true }));
    expect(result.total).toBe(15);
    expect(result.hit).toBe(false);
  });

  it('offhand flag does not affect attack roll', () => {
    mockCryptoRoll.mockReturnValue(10);
    const result = rollAttackRoll(makeAttackParams({ isOffHand: true }));
    expect(result.hit).toBe(true);
    expect(result.total).toBe(15);
  });

  it('uses correct proficiency at level 1', () => {
    mockCryptoRoll.mockReturnValue(10);
    const result = rollAttackRoll(makeAttackParams({ attackerLevel: 1, targetAc: 15 }));
    expect(result.total).toBe(15);
    expect(result.hit).toBe(true);
  });

  it('uses correct proficiency at level 20', () => {
    mockCryptoRoll.mockReturnValue(10);
    const result = rollAttackRoll(makeAttackParams({ attackerLevel: 20, targetAc: 19 }));
    expect(result.total).toBe(19);
    expect(result.hit).toBe(true);
  });

  it('hits when total equals AC exactly', () => {
    mockCryptoRoll.mockReturnValue(10);
    const result = rollAttackRoll(makeAttackParams({ targetAc: 15 }));
    expect(result.total).toBe(15);
    expect(result.hit).toBe(true);
  });
});

describe('rollDamage', () => {
  it('basic 1d8', () => {
    mockCryptoRoll.mockReturnValue(5);
    const result = rollDamage(makeDamageParams());
    expect(result.total).toBe(5);
    expect(result.results).toEqual([5]);
    expect(result.isCritical).toBe(false);
  });

  it('multi-die 2d6', () => {
    mockCryptoRoll.mockReturnValueOnce(3).mockReturnValueOnce(4);
    const result = rollDamage(makeDamageParams({ weaponDamageDice: '2d6' }));
    expect(result.total).toBe(7);
    expect(result.results).toEqual([3, 4]);
  });

  it('flat bonus +3', () => {
    mockCryptoRoll.mockReturnValue(5);
    const result = rollDamage(makeDamageParams({ weaponDamageDice: '1d8+3' }));
    expect(result.total).toBe(8);
    expect(result.results).toEqual([5]);
  });

  it('flat negative -1', () => {
    mockCryptoRoll.mockReturnValue(5);
    const result = rollDamage(makeDamageParams({ weaponDamageDice: '1d8-1' }));
    expect(result.total).toBe(4);
    expect(result.results).toEqual([5]);
  });

  it('crit doubles dice', () => {
    mockCryptoRoll.mockReturnValue(5);
    const result = rollDamage(makeDamageParams({ isCritical: true }));
    expect(result.total).toBe(10);
    expect(result.results).toEqual([5, 5]);
    expect(result.isCritical).toBe(true);
  });

  it('crit on 2d6', () => {
    mockCryptoRoll.mockReturnValueOnce(2).mockReturnValueOnce(3).mockReturnValueOnce(4).mockReturnValueOnce(5);
    const result = rollDamage(makeDamageParams({ weaponDamageDice: '2d6', isCritical: true }));
    expect(result.total).toBe(14);
    expect(result.results).toEqual([2, 3, 4, 5]);
  });

  it('GWF rerolls 1-2', () => {
    mockCryptoRoll.mockReturnValueOnce(1).mockReturnValueOnce(6);
    const result = rollDamage(makeDamageParams({ hasGreatWeaponFighting: true }));
    expect(result.total).toBe(6);
    expect(result.results).toEqual([6]);
  });

  it('GWF does not reroll on 3+', () => {
    mockCryptoRoll.mockReturnValue(5);
    const result = rollDamage(makeDamageParams({ hasGreatWeaponFighting: true }));
    expect(result.total).toBe(5);
    expect(result.results).toEqual([5]);
  });

  it('GWF excluded for offhand', () => {
    mockCryptoRoll.mockReturnValueOnce(1).mockReturnValueOnce(6);
    const result = rollDamage(makeDamageParams({ hasGreatWeaponFighting: true, isOffHand: true }));
    expect(result.total).toBe(1);
    expect(result.results).toEqual([1]);
  });

  it('TWF adds modifier to offhand', () => {
    mockCryptoRoll.mockReturnValue(5);
    const result = rollDamage(makeDamageParams({ isOffHand: true, hasTwoWeaponFighting: true, modifier: 3 }));
    expect(result.total).toBe(8);
    expect(result.results).toEqual([5]);
  });

  it('offhand without TWF gets no modifier', () => {
    mockCryptoRoll.mockReturnValue(5);
    const result = rollDamage(makeDamageParams({ isOffHand: true, modifier: 3 }));
    expect(result.total).toBe(5);
    expect(result.results).toEqual([5]);
  });

  it('main hand includes modifier', () => {
    mockCryptoRoll.mockReturnValue(5);
    const result = rollDamage(makeDamageParams({ modifier: 3 }));
    expect(result.total).toBe(8);
    expect(result.results).toEqual([5]);
  });

  it('unparseable dice string returns fallback', () => {
    const result = rollDamage(makeDamageParams({ weaponDamageDice: 'fire' }));
    expect(result.total).toBe(0);
    expect(result.results).toEqual([]);
  });

  it('empty dice string returns fallback', () => {
    const result = rollDamage(makeDamageParams({ weaponDamageDice: '' }));
    expect(result.total).toBe(0);
    expect(result.results).toEqual([]);
  });

  it('GWF with crit combo', () => {
    mockCryptoRoll.mockReturnValueOnce(2).mockReturnValueOnce(4).mockReturnValueOnce(1).mockReturnValueOnce(5);
    const result = rollDamage(makeDamageParams({ weaponDamageDice: '1d6', isCritical: true, hasGreatWeaponFighting: true }));
    expect(result.total).toBe(9);
    expect(result.results).toEqual([4, 5]);
  });

  it('zero dice count', () => {
    mockCryptoRoll.mockReturnValue(7);
    const result = rollDamage(makeDamageParams({ weaponDamageDice: '0d8' }));
    expect(result.total).toBe(0);
    expect(result.results).toEqual([]);
  });

  it('flat bonus with crit', () => {
    mockCryptoRoll.mockReturnValueOnce(3).mockReturnValueOnce(4);
    const result = rollDamage(makeDamageParams({ weaponDamageDice: '1d6+2', isCritical: true }));
    expect(result.total).toBe(9);
    expect(result.results).toEqual([3, 4]);
  });
});

describe('rollSkillCheck', () => {
  it('athletics success with proficiency', () => {
    mockCryptoRoll.mockReturnValue(12);
    const result = rollSkillCheck(makeSkillParams({ skillName: 'athletics', skillProficiency: 1, difficulty: 14 }));
    expect(result.success).toBe(true);
    expect(result.total).toBe(17);
  });

  it('athletics failure with proficiency', () => {
    mockCryptoRoll.mockReturnValue(9);
    const result = rollSkillCheck(makeSkillParams({ skillName: 'athletics', skillProficiency: 1, difficulty: 15 }));
    expect(result.success).toBe(false);
    expect(result.total).toBe(14);
  });

  it('stealth uses dex modifier', () => {
    mockCryptoRoll.mockReturnValue(10);
    const result = rollSkillCheck(makeSkillParams({ skillName: 'stealth', skillProficiency: 1, difficulty: 14 }));
    expect(result.success).toBe(true);
    expect(result.total).toBe(14);
  });

  it('arcana uses int modifier', () => {
    mockCryptoRoll.mockReturnValue(10);
    const result = rollSkillCheck(makeSkillParams({ skillName: 'arcana', skillProficiency: 1, difficulty: 11 }));
    expect(result.success).toBe(true);
    expect(result.total).toBe(11);
  });

  it('persuasion uses cha modifier', () => {
    mockCryptoRoll.mockReturnValue(10);
    const result = rollSkillCheck(makeSkillParams({ skillName: 'persuasion', skillProficiency: 1, difficulty: 12 }));
    expect(result.success).toBe(true);
    expect(result.total).toBe(12);
  });

  it('non-proficient receives no proficiency bonus', () => {
    mockCryptoRoll.mockReturnValue(10);
    const result = rollSkillCheck(makeSkillParams({ skillName: 'athletics', skillProficiency: 0, difficulty: 13 }));
    expect(result.success).toBe(true);
    expect(result.total).toBe(13);
  });

  it('normalizes skill name stripping "check"', () => {
    mockCryptoRoll.mockReturnValue(12);
    const result = rollSkillCheck(makeSkillParams({ skillName: 'Athletics check', skillProficiency: 1, difficulty: 14 }));
    expect(result.success).toBe(true);
    expect(result.total).toBe(17);
  });

  it('normalizes skill name stripping "roll"', () => {
    mockCryptoRoll.mockReturnValue(10);
    const result = rollSkillCheck(makeSkillParams({ skillName: 'stealth roll', skillProficiency: 1, difficulty: 14 }));
    expect(result.success).toBe(true);
    expect(result.total).toBe(14);
  });

  it('normalizes skill name stripping "save"', () => {
    mockCryptoRoll.mockReturnValue(10);
    const result = rollSkillCheck(makeSkillParams({ skillName: 'arcana save', skillProficiency: 1, difficulty: 11 }));
    expect(result.success).toBe(true);
    expect(result.total).toBe(11);
  });

  it('normalizes skill name stripping "saving throw"', () => {
    mockCryptoRoll.mockReturnValue(10);
    const result = rollSkillCheck(makeSkillParams({ skillName: 'persuasion saving throw', skillProficiency: 1, difficulty: 12 }));
    expect(result.success).toBe(true);
    expect(result.total).toBe(12);
  });

  it('unknown skill falls back to str', () => {
    mockCryptoRoll.mockReturnValue(10);
    const result = rollSkillCheck(makeSkillParams({ skillName: 'unknown_skill', difficulty: 13 }));
    expect(result.success).toBe(true);
    expect(result.total).toBe(13);
  });

  it('substring match finds correct stat', () => {
    mockCryptoRoll.mockReturnValue(12);
    const result = rollSkillCheck(makeSkillParams({ skillName: 'ath', skillProficiency: 1, difficulty: 14 }));
    expect(result.success).toBe(true);
    expect(result.total).toBe(17);
  });

  it('hits DC exactly', () => {
    mockCryptoRoll.mockReturnValue(9);
    const result = rollSkillCheck(makeSkillParams({ skillName: 'athletics', skillProficiency: 1, difficulty: 14 }));
    expect(result.total).toBe(14);
    expect(result.success).toBe(true);
  });

  it('uses proficiency bonus at level 1', () => {
    mockCryptoRoll.mockReturnValue(9);
    const result = rollSkillCheck(makeSkillParams({ characterLevel: 1, skillName: 'athletics', skillProficiency: 1, difficulty: 14 }));
    expect(result.total).toBe(14);
    expect(result.success).toBe(true);
  });

  it('uses proficiency bonus at level 20', () => {
    mockCryptoRoll.mockReturnValue(5);
    const result = rollSkillCheck(makeSkillParams({ characterLevel: 20, skillName: 'athletics', skillProficiency: 1, difficulty: 14 }));
    expect(result.total).toBe(14);
    expect(result.success).toBe(true);
  });

  it('Resilient feat adds prof bonus to matching stat skill checks (B2 fix)', () => {
    mockCryptoRoll.mockReturnValue(12);
    const result = rollSkillCheck(makeSkillParams({ skillName: 'athletics', skillProficiency: 1, difficulty: 14, hasResilient: true, resilientStat: 'str' }));
    expect(result.total).toBe(19);
    expect(result.success).toBe(true);
  });

  it('Shield Master adds +2 to DEX skill checks (B2 fix)', () => {
    mockCryptoRoll.mockReturnValue(12);
    const result = rollSkillCheck(makeSkillParams({ skillName: 'stealth', skillProficiency: 1, difficulty: 14, hasShieldMaster: true, shieldEquipped: true }));
    expect(result.total).toBe(18);
    expect(result.success).toBe(true);
  });
});

describe('rollSavingThrow', () => {
  it('non-proficient success', () => {
    mockCryptoRoll.mockReturnValue(12);
    const result = rollSavingThrow(makeSavingThrowParams({ dc: 14 }));
    expect(result.success).toBe(true);
    expect(result.total).toBe(15);
    expect(result.stat).toBe('STR');
  });

  it('non-proficient failure', () => {
    mockCryptoRoll.mockReturnValue(10);
    const result = rollSavingThrow(makeSavingThrowParams({ dc: 14 }));
    expect(result.success).toBe(false);
    expect(result.total).toBe(13);
  });

  it('proficient adds proficiency bonus', () => {
    mockCryptoRoll.mockReturnValue(10);
    const result = rollSavingThrow(makeSavingThrowParams({ proficientInStat: true, dc: 14 }));
    expect(result.success).toBe(true);
    expect(result.total).toBe(15);
  });

  it('Resilient matching stat adds proficiency', () => {
    mockCryptoRoll.mockReturnValue(10);
    const result = rollSavingThrow(makeSavingThrowParams({ stat: 'con', hasResilient: true, resilientStat: 'con', dc: 14 }));
    expect(result.success).toBe(true);
    expect(result.total).toBe(14);
  });

  it('Resilient non-matching stat does not add proficiency', () => {
    mockCryptoRoll.mockReturnValue(10);
    const result = rollSavingThrow(makeSavingThrowParams({ stat: 'con', hasResilient: true, resilientStat: 'str', dc: 14 }));
    expect(result.success).toBe(false);
    expect(result.total).toBe(12);
  });

  it('ShieldMaster adds +2 to dex saves with shield', () => {
    mockCryptoRoll.mockReturnValue(10);
    const result = rollSavingThrow(makeSavingThrowParams({ stat: 'dex', hasShieldMaster: true, shieldEquipped: true, dc: 14 }));
    expect(result.success).toBe(true);
    expect(result.total).toBe(14);
  });

  it('ShieldMaster does not affect non-dex saves', () => {
    mockCryptoRoll.mockReturnValue(10);
    const result = rollSavingThrow(makeSavingThrowParams({ stat: 'str', hasShieldMaster: true, shieldEquipped: true, dc: 14 }));
    expect(result.success).toBe(false);
    expect(result.total).toBe(13);
  });

  it('ShieldMaster requires shield equipped', () => {
    mockCryptoRoll.mockReturnValue(10);
    const result = rollSavingThrow(makeSavingThrowParams({ stat: 'dex', hasShieldMaster: true, shieldEquipped: false, dc: 14 }));
    expect(result.success).toBe(false);
    expect(result.total).toBe(12);
  });

  it('stat name partial match resolves correctly', () => {
    mockCryptoRoll.mockReturnValue(10);
    const result = rollSavingThrow(makeSavingThrowParams({ stat: 'intelligence', dc: 9 }));
    expect(result.total).toBe(9);
    expect(result.success).toBe(true);
    expect(result.stat).toBe('INT');
  });

  it('unknown stat defaults to dex', () => {
    mockCryptoRoll.mockReturnValue(10);
    const result = rollSavingThrow(makeSavingThrowParams({ stat: 'unknown', dc: 12 }));
    expect(result.total).toBe(12);
    expect(result.success).toBe(true);
    expect(result.stat).toBe('DEX');
  });

  it('duplicate proficient and Resilient gives single bonus', () => {
    mockCryptoRoll.mockReturnValue(10);
    const result = rollSavingThrow(makeSavingThrowParams({ proficientInStat: true, hasResilient: true, resilientStat: 'str', dc: 14 }));
    expect(result.total).toBe(15);
    expect(result.success).toBe(true);
  });

  it('hits DC exactly', () => {
    mockCryptoRoll.mockReturnValue(12);
    const result = rollSavingThrow(makeSavingThrowParams({ dc: 15 }));
    expect(result.total).toBe(15);
    expect(result.success).toBe(true);
  });

  it('level 20 proficient', () => {
    mockCryptoRoll.mockReturnValue(7);
    const result = rollSavingThrow(makeSavingThrowParams({ characterLevel: 20, proficientInStat: true, dc: 16 }));
    expect(result.total).toBe(16);
    expect(result.success).toBe(true);
  });

  it('constitution save success', () => {
    mockCryptoRoll.mockReturnValue(12);
    const result = rollSavingThrow(makeSavingThrowParams({ stat: 'con', dc: 14 }));
    expect(result.total).toBe(14);
    expect(result.success).toBe(true);
    expect(result.stat).toBe('CON');
  });
});

describe('rollDeathSave', () => {
  it('nat20 returns critical success', () => {
    mockCryptoRoll.mockReturnValue(20);
    const result = rollDeathSave();
    expect(result.success).toBe(true);
    expect(result.isCritical).toBe(true);
    expect(result.isFumble).toBe(false);
  });

  it('roll 10 returns success', () => {
    mockCryptoRoll.mockReturnValue(10);
    const result = rollDeathSave();
    expect(result.success).toBe(true);
    expect(result.isCritical).toBe(false);
    expect(result.isFumble).toBe(false);
  });

  it('roll 19 returns success', () => {
    mockCryptoRoll.mockReturnValue(19);
    const result = rollDeathSave();
    expect(result.success).toBe(true);
    expect(result.isCritical).toBe(false);
    expect(result.isFumble).toBe(false);
  });

  it('roll 9 returns failure', () => {
    mockCryptoRoll.mockReturnValue(9);
    const result = rollDeathSave();
    expect(result.success).toBe(false);
    expect(result.isCritical).toBe(false);
    expect(result.isFumble).toBe(false);
  });

  it('roll 2 returns failure', () => {
    mockCryptoRoll.mockReturnValue(2);
    const result = rollDeathSave();
    expect(result.success).toBe(false);
    expect(result.isCritical).toBe(false);
    expect(result.isFumble).toBe(false);
  });

  it('nat1 returns fumble', () => {
    mockCryptoRoll.mockReturnValue(1);
    const result = rollDeathSave();
    expect(result.success).toBe(false);
    expect(result.isCritical).toBe(false);
    expect(result.isFumble).toBe(true);
  });
});
