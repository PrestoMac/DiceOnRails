import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getEffects,
  applyEffects,
  DamageTakenContext,
  AttackRollContext,
} from '../../services/effectDispatcher';
import { getClassDef, getRaceDef, getSubclassDef } from '../../services/classEngine';
import { getFeatById } from '../../utils/feats';
import { Character } from '../../types';

vi.mock('../../services/classEngine', () => ({
  getClassDef: vi.fn(),
  getRaceDef: vi.fn(),
  getSubclassDef: vi.fn(),
}));

vi.mock('../../utils/feats', () => ({
  getFeatById: vi.fn(),
}));

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    id: 'test-char',
    name: 'Test',
    class: 'fighter',
    race: 'human',
    level: 1,
    hp: { current: 10, max: 10 },
    stats: { str: 12, dex: 12, con: 12, int: 12, wis: 12, cha: 12 },
    inventory: [],
    currency: { gp: 0, sp: 0, cp: 0 },
    location: 'Test Location',
    experience: 0,
    experienceToNextLevel: 300,
    unusedStatPoints: 0,
    maxHpBonus: 0,
    hitDice: { current: 1, max: 1 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getEffects', () => {
  it('collects racial trait effects', () => {
    vi.mocked(getRaceDef).mockReturnValue({
      id: 'dwarf',
      name: 'Dwarf',
      description: '',
      asi: { str: 0, dex: 0, con: 2, int: 0, wis: 0, cha: 0 },
      speed: 25,
      size: 'medium',
      traits: [
        { id: 'dwarven-resilience', name: 'Dwarven Resilience', description: '', kind: 'passive', effect: { kind: 'damage-resistance', payload: { type: 'poison' } } },
      ],
      languages: ['common', 'dwarvish'],
      icon: '',
      flavor: '',
    });
    vi.mocked(getClassDef).mockReturnValue(undefined);

    const char = makeChar({ race: 'dwarf', racialTraits: ['dwarven-resilience'] });
    const result = getEffects(char, 'damage-resistance');
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('race');
    expect(result[0].payload.type).toBe('poison');
  });

  it('collects class feature effects (level-gated)', () => {
    vi.mocked(getRaceDef).mockReturnValue(undefined);
    vi.mocked(getClassDef).mockReturnValue({
      id: 'barbarian',
      name: 'Barbarian',
      hitDie: 12,
      hpBase: 12,
      hpPerLevel: 7,
      primaryStat: 'str',
      savingThrowProfs: ['str', 'con'],
      armorProfs: ['light', 'medium', 'shield'],
      weaponProfs: { simple: true, martial: true },
      skillChoices: { count: 2, from: ['athletics'] },
      startingEquipment: [],
      recommendedStats: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 },
      statPriority: ['str', 'con', 'dex', 'wis', 'cha', 'int'],
      features: [
        { id: 'rage', name: 'Rage', description: '', level: 1, kind: 'resource', grantsResource: 'rage', effect: { kind: 'damage-bonus', payload: { amount: '2', condition: 'raging' } } },
        { id: 'brutal-critical', name: 'Brutal Critical', description: '', level: 9, kind: 'passive', effect: { kind: 'crit-bonus-dice', payload: { count: 1 } } },
      ],
      subclasses: [],
      subclassLevel: 3,
      icon: '',
      description: '',
      flavor: '',
    });
    vi.mocked(getSubclassDef).mockReturnValue(undefined);

    const lvl1 = makeChar({ class: 'barbarian', level: 1 });
    expect(getEffects(lvl1, 'damage-bonus')).toHaveLength(1);
    expect(getEffects(lvl1, 'crit-bonus-dice')).toHaveLength(0);

    const lvl9 = makeChar({ class: 'barbarian', level: 9 });
    expect(getEffects(lvl9, 'crit-bonus-dice')).toHaveLength(1);
  });

  it('collects subclass effects', () => {
    vi.mocked(getRaceDef).mockReturnValue(undefined);
    vi.mocked(getClassDef).mockReturnValue(undefined);
    vi.mocked(getSubclassDef).mockReturnValue({
      id: 'draconic-bloodline',
      parentClass: 'sorcerer',
      name: 'Draconic Bloodline',
      description: '',
      features: [
        { id: 'draconic-resilience', name: 'Draconic Resilience', description: '', level: 1, kind: 'passive', effect: { kind: 'ac-formula', payload: { formula: '13 + DEX' } } },
      ],
    });

    const char = makeChar({ class: 'sorcerer', subclassId: 'draconic-bloodline', level: 1 });
    const result = getEffects(char, 'ac-formula');
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('subclass');
  });

  it('handles both feat effect shapes', () => {
    vi.mocked(getRaceDef).mockReturnValue(undefined);
    vi.mocked(getClassDef).mockReturnValue(undefined);
    vi.mocked(getSubclassDef).mockReturnValue(undefined);
    vi.mocked(getFeatById).mockReturnValue({
      id: 'tough',
      name: 'Tough',
      category: 'general',
      shortName: 'Tough',
      icon: '',
      description: '',
      mechanicalEffect: '',
      effectType: 'modifier',
      effect: { kind: 'hp-per-level', payload: { amount: 2 } },
      effectPayload: { kind: 'hp-per-level', amount: 2 },
    });

    const char = makeChar({ feats: ['tough'] });
    const result = getEffects(char, 'hp-per-level');
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('feat');
    expect(result[0].payload.amount).toBe(2);
  });
});

describe('applyEffects — onDamageTaken', () => {
  it('applies damage resistance', () => {
    vi.mocked(getRaceDef).mockReturnValue({
      id: 'tiefling',
      name: 'Tiefling',
      description: '',
      asi: { str: 0, dex: 0, con: 0, int: 1, wis: 0, cha: 2 },
      speed: 30,
      size: 'medium',
      darkvision: 60,
      traits: [
        { id: 'hellish-resistance', name: 'Hellish Resistance', description: '', kind: 'passive', effect: { kind: 'damage-resistance', payload: { type: 'fire' } } },
      ],
      languages: ['common', 'infernal'],
      icon: '',
      flavor: '',
    });
    vi.mocked(getClassDef).mockReturnValue(undefined);
    vi.mocked(getSubclassDef).mockReturnValue(undefined);

    const char = makeChar({ race: 'tiefling', racialTraits: ['hellish-resistance'] });
    const ctx: DamageTakenContext = {
      _hook: 'onDamageTaken',
      amount: 30,
      damageType: 'fire',
      target: char,
    };
    const result = applyEffects(char, 'onDamageTaken', ctx);
    expect(result.amount).toBe(15);
  });
});

describe('applyEffects — onAttackRoll', () => {
  it('rerolls natural 1s for Halfling Lucky', () => {
    vi.mocked(getRaceDef).mockReturnValue({
      id: 'halfling',
      name: 'Halfling',
      description: '',
      asi: { str: 0, dex: 2, con: 0, int: 0, wis: 0, cha: 1 },
      speed: 25,
      size: 'small',
      traits: [
        { id: 'lucky', name: 'Lucky', description: '', kind: 'passive', effect: { kind: 'reroll-ones', payload: { scope: 'all' } } },
      ],
      languages: ['common', 'halfling'],
      icon: '',
      flavor: '',
    });
    vi.mocked(getClassDef).mockReturnValue(undefined);
    vi.mocked(getSubclassDef).mockReturnValue(undefined);

    const char = makeChar({ race: 'halfling', racialTraits: ['lucky'] });
    const ctx: AttackRollContext = {
      _hook: 'onAttackRoll',
      roll: 1,
      character: char,
      weaponName: 'dagger',
      targetId: 'goblin-1',
      isRanged: false,
    };
    const result = applyEffects(char, 'onAttackRoll', ctx);
    expect(result.roll).not.toBe(1);
  });
});
