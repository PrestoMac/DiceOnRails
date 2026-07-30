import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getEffects } from '../../services/effectDispatcher';
import { getClassDef, getRaceDef, getSubclassDef } from '../../services/classEngine';
import { getFeatById } from '../../utils/feats';

vi.mock('../../services/classEngine', () => ({
  getClassDef: vi.fn(),
  getRaceDef: vi.fn(),
  getSubclassDef: vi.fn(),
}));

vi.mock('../../utils/feats', () => ({
  getFeatById: vi.fn(),
}));

function makeRace(overrides: Record<string, unknown> = {}) {
  return {
    id: 'human',
    name: 'Human',
    description: '',
    asi: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
    speed: 30,
    size: 'medium' as const,
    traits: [],
    languages: ['common'],
    icon: '',
    flavor: '',
    ...overrides,
  };
}

function makeChar(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test',
    name: 'Test',
    class: 'fighter',
    race: 'human',
    level: 1,
    hp: { current: 10, max: 10 },
    stats: { str: 12, dex: 12, con: 12, int: 12, wis: 12, cha: 12 },
    inventory: [],
    currency: { gp: 0, sp: 0, cp: 0 },
    location: '',
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

describe('getEffects — multi-source stacking', () => {
  it('collects damage-resistance from race + class + subclass', () => {
    vi.mocked(getRaceDef).mockReturnValue(makeRace({
      id: 'tiefling',
      traits: [
        { id: 'hellish-resistance', name: 'Hellish Resistance', description: '', kind: 'passive' as const, effect: { kind: 'damage-resistance' as const, payload: { type: 'fire' } } },
      ],
    }));
    vi.mocked(getClassDef).mockReturnValue({
      id: 'barbarian',
      features: [
        { id: 'rage', name: 'Rage', description: '', level: 1, kind: 'resource' as const, grantsResource: 'rage', effect: { kind: 'damage-resistance' as const, payload: { type: 'bludgeoning' } } },
      ],
      subclasses: [],
    } as ReturnType<typeof getClassDef>);
    vi.mocked(getSubclassDef).mockReturnValue({
      id: 'totem-bear',
      parentClass: 'barbarian',
      name: 'Totem Bear',
      description: '',
      features: [
        { id: 'bear-resist', name: 'Bear Totem', description: '', level: 3, kind: 'passive' as const, effect: { kind: 'damage-resistance' as const, payload: { type: 'cold' } } },
      ],
    });
    vi.mocked(getFeatById).mockReturnValue(undefined);

    const char = makeChar({
      class: 'barbarian',
      race: 'tiefling',
      level: 3,
      subclassId: 'totem-bear',
      racialTraits: ['hellish-resistance'],
    });

    const result = getEffects(char, 'damage-resistance');
    expect(result).toHaveLength(3);
    expect(result.map(r => r.payload.type)).toEqual(expect.arrayContaining(['fire', 'bludgeoning', 'cold']));
  });

  it('level-gates class features', () => {
    vi.mocked(getRaceDef).mockReturnValue(makeRace());
    vi.mocked(getSubclassDef).mockReturnValue(undefined);
    vi.mocked(getFeatById).mockReturnValue(undefined);
    vi.mocked(getClassDef).mockReturnValue({
      id: 'barbarian',
      features: [
        { id: 'brutal-1', name: 'Brutal Crit 1', description: '', level: 9, kind: 'passive' as const, effect: { kind: 'crit-bonus-dice' as const, payload: { count: 1 } } },
        { id: 'brutal-2', name: 'Brutal Crit 2', description: '', level: 13, kind: 'passive' as const, effect: { kind: 'crit-bonus-dice' as const, payload: { count: 2 } } },
        { id: 'brutal-3', name: 'Brutal Crit 3', description: '', level: 17, kind: 'passive' as const, effect: { kind: 'crit-bonus-dice' as const, payload: { count: 3 } } },
      ],
      subclasses: [],
    } as unknown as ReturnType<typeof getClassDef>);

    expect(getEffects(makeChar({ level: 5 }), 'crit-bonus-dice')).toHaveLength(0);
    expect(getEffects(makeChar({ level: 9 }), 'crit-bonus-dice')).toHaveLength(1);
    expect(getEffects(makeChar({ level: 13 }), 'crit-bonus-dice')).toHaveLength(2);
    expect(getEffects(makeChar({ level: 17 }), 'crit-bonus-dice')).toHaveLength(3);
  });

  it('handles sorcerousOrigin fallback for subclass lookup', () => {
    vi.mocked(getRaceDef).mockReturnValue(makeRace());
    vi.mocked(getClassDef).mockReturnValue(undefined);
    vi.mocked(getSubclassDef).mockReturnValue({
      id: 'draconic-bloodline',
      parentClass: 'sorcerer',
      name: 'Draconic Bloodline',
      description: '',
      features: [
        { id: 'draconic-res', name: 'Draconic Resilience', description: '', level: 1, kind: 'passive' as const, effect: { kind: 'ac-formula' as const, payload: { formula: '13 + DEX' } } },
      ],
    });
    vi.mocked(getFeatById).mockReturnValue(undefined);

    const char = makeChar({ class: 'sorcerer', sorcerousOrigin: 'draconic-bloodline', level: 1 });
    const result = getEffects(char, 'ac-formula');
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('subclass');
  });
});
