import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getEffects,
  applyEffects,
  DamageTakenContext,
  AttackRollContext,
  SaveRollContext,
  SkillCheckContext,
  AcContext,
} from '../../services/effectDispatcher';
import { getClassDef, getRaceDef, getSubclassDef, getProficiencyBonus } from '../../services/classEngine';
import { getFeatById } from '../../utils/feats';
import { Character } from '../../types';

vi.mock('../../services/classEngine', () => ({
  getClassDef: vi.fn(),
  getRaceDef: vi.fn(),
  getSubclassDef: vi.fn(),
  getProficiencyBonus: vi.fn(),
}));

vi.mock('../../utils/feats', () => ({
  getFeatById: vi.fn(),
}));

vi.mock('../../utils/random', () => ({
  cryptoRoll: vi.fn(),
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
  it('rerolls natural 1s for Halfling Lucky', async () => {
    const { cryptoRoll } = await import('../../utils/random');
    vi.mocked(cryptoRoll).mockReturnValue(19); // reroll -> 19
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
      attackBonus: 0,
    };
    const result = applyEffects(char, 'onAttackRoll', ctx);
    expect(result.roll).not.toBe(1);
  });
});

describe('applyEffects — onSaveRoll', () => {
  it('rerolls natural 1s on saving throws for Halfling Lucky', async () => {
    const { cryptoRoll } = await import('../../utils/random');
    vi.mocked(cryptoRoll).mockReturnValue(19); // reroll -> 19
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
    const ctx: SaveRollContext = {
      _hook: 'onSaveRoll',
      roll: 1,
      stat: 'dex',
      character: char,
      hasAdvantage: false,
      extraModifier: 0,
    };
    const result = applyEffects(char, 'onSaveRoll', ctx);
    expect(result.roll).not.toBe(1);
  });
});

describe('applyEffects — onSkillCheck', () => {
  it('Jack of All Trades adds half proficiency to non-proficient skills', () => {
    vi.mocked(getRaceDef).mockReturnValue(undefined);
    vi.mocked(getClassDef).mockReturnValue({
      id: 'bard', name: 'Bard', hitDie: 8, hpBase: 8, hpPerLevel: 6,
      primaryStat: 'cha', savingThrowProfs: ['dex', 'cha'], armorProfs: ['light'],
      weaponProfs: { simple: true, martial: false },
      skillChoices: { count: 3, from: ['performance'] },
      startingEquipment: [], recommendedStats: { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 16 },
      statPriority: ['cha', 'dex', 'con', 'int', 'wis', 'str'],
      features: [
        { id: 'jack-of-all-trades', name: 'Jack of All Trades', description: '', level: 2, kind: 'passive', effect: { kind: 'jack-of-all-trades' } },
      ],
      subclasses: [], subclassLevel: 3, icon: '', description: '', flavor: '',
    });
    vi.mocked(getSubclassDef).mockReturnValue(undefined);
    vi.mocked(getProficiencyBonus).mockReturnValue(2); // L2 proficiency bonus

    // Bard L2 with no skill ranks in athletics (rank 0 = non-proficient)
    const char = makeChar({ class: 'bard', level: 2, skills: { athletics: 0 } });
    const ctx: SkillCheckContext = {
      _hook: 'onSkillCheck',
      roll: 10,
      skillName: 'athletics',
      skillBonus: 0,
      character: char,
    };
    const result = applyEffects(char, 'onSkillCheck', ctx);
    // Proficiency bonus at L2 is +2, half = +1
    expect(result.skillBonus).toBe(1);
  });

  it('Jack of All Trades does NOT add bonus to proficient skills', () => {
    vi.mocked(getRaceDef).mockReturnValue(undefined);
    vi.mocked(getClassDef).mockReturnValue({
      id: 'bard', name: 'Bard', hitDie: 8, hpBase: 8, hpPerLevel: 6,
      primaryStat: 'cha', savingThrowProfs: ['dex', 'cha'], armorProfs: ['light'],
      weaponProfs: { simple: true, martial: false },
      skillChoices: { count: 3, from: ['performance'] },
      startingEquipment: [], recommendedStats: { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 16 },
      statPriority: ['cha', 'dex', 'con', 'int', 'wis', 'str'],
      features: [
        { id: 'jack-of-all-trades', name: 'Jack of All Trades', description: '', level: 2, kind: 'passive', effect: { kind: 'jack-of-all-trades' } },
      ],
      subclasses: [], subclassLevel: 3, icon: '', description: '', flavor: '',
    });
    vi.mocked(getSubclassDef).mockReturnValue(undefined);

    // Bard L2 with Athletics rank 1 (proficient) — note: skill keys are lowercase
    const char = makeChar({ class: 'bard', level: 2, skills: { athletics: 1 } });
    const ctx: SkillCheckContext = {
      _hook: 'onSkillCheck',
      roll: 10,
      skillName: 'athletics',
      skillBonus: 2,
      character: char,
    };
    const result = applyEffects(char, 'onSkillCheck', ctx);
    expect(result.skillBonus).toBe(2); // unchanged
  });

  it('Reliable Talent floors proficient skill rolls at 10', () => {
    vi.mocked(getRaceDef).mockReturnValue(undefined);
    vi.mocked(getClassDef).mockReturnValue({
      id: 'rogue', name: 'Rogue', hitDie: 8, hpBase: 8, hpPerLevel: 6,
      primaryStat: 'dex', savingThrowProfs: ['dex', 'int'], armorProfs: ['light'],
      weaponProfs: { simple: true, martial: true },
      skillChoices: { count: 4, from: ['stealth'] },
      startingEquipment: [], recommendedStats: { str: 8, dex: 16, con: 14, int: 10, wis: 12, cha: 10 },
      statPriority: ['dex', 'con', 'int', 'wis', 'cha', 'str'],
      features: [
        { id: 'reliable-talent', name: 'Reliable Talent', description: '', level: 11, kind: 'passive', effect: { kind: 'reliable-talent' } },
      ],
      subclasses: [], subclassLevel: 3, icon: '', description: '', flavor: '',
    });
    vi.mocked(getSubclassDef).mockReturnValue(undefined);

    // Rogue L11 with stealth rank 1 (proficient), rolls a 5
    const char = makeChar({ class: 'rogue', level: 11, skills: { stealth: 1 } });
    const ctx: SkillCheckContext = {
      _hook: 'onSkillCheck',
      roll: 5,
      skillName: 'stealth',
      skillBonus: 4,
      character: char,
    };
    const result = applyEffects(char, 'onSkillCheck', ctx);
    expect(result.roll).toBe(10);
  });

  it('Reliable Talent does NOT floor non-proficient skill rolls', () => {
    vi.mocked(getRaceDef).mockReturnValue(undefined);
    vi.mocked(getClassDef).mockReturnValue({
      id: 'rogue', name: 'Rogue', hitDie: 8, hpBase: 8, hpPerLevel: 6,
      primaryStat: 'dex', savingThrowProfs: ['dex', 'int'], armorProfs: ['light'],
      weaponProfs: { simple: true, martial: true },
      skillChoices: { count: 4, from: ['stealth'] },
      startingEquipment: [], recommendedStats: { str: 8, dex: 16, con: 14, int: 10, wis: 12, cha: 10 },
      statPriority: ['dex', 'con', 'int', 'wis', 'cha', 'str'],
      features: [
        { id: 'reliable-talent', name: 'Reliable Talent', description: '', level: 11, kind: 'passive', effect: { kind: 'reliable-talent' } },
      ],
      subclasses: [], subclassLevel: 3, icon: '', description: '', flavor: '',
    });
    vi.mocked(getSubclassDef).mockReturnValue(undefined);

    // Rogue L11 with no athletics rank (non-proficient), rolls a 5
    const char = makeChar({ class: 'rogue', level: 11, skills: { athletics: 0 } });
    const ctx: SkillCheckContext = {
      _hook: 'onSkillCheck',
      roll: 5,
      skillName: 'athletics',
      skillBonus: 0,
      character: char,
    };
    const result = applyEffects(char, 'onSkillCheck', ctx);
    expect(result.roll).toBe(5); // unchanged
  });
});

describe('applyEffects — onSaveRoll (Diamond Soul)', () => {
  it('Diamond Soul adds proficiency bonus to non-proficient saves', () => {
    vi.mocked(getRaceDef).mockReturnValue(undefined);
    vi.mocked(getClassDef).mockReturnValue({
      id: 'monk', name: 'Monk', hitDie: 8, hpBase: 8, hpPerLevel: 6,
      primaryStat: 'dex', savingThrowProfs: ['str', 'dex'], armorProfs: ['none'],
      weaponProfs: { simple: true, martial: true },
      skillChoices: { count: 2, from: ['acrobatics'] },
      startingEquipment: [], recommendedStats: { str: 10, dex: 16, con: 14, int: 10, wis: 16, cha: 8 },
      statPriority: ['dex', 'wis', 'con', 'int', 'cha', 'str'],
      features: [
        { id: 'diamond-soul', name: 'Diamond Soul', description: '', level: 14, kind: 'passive', effect: { kind: 'diamond-soul' } },
      ],
      subclasses: [], subclassLevel: 3, icon: '', description: '', flavor: '',
    });
    vi.mocked(getSubclassDef).mockReturnValue(undefined);
    vi.mocked(getProficiencyBonus).mockReturnValue(5); // L14 proficiency bonus

    // Monk L14 — proficient in STR/DEX saves, NOT WIS
    const char = makeChar({ class: 'monk', level: 14 });
    const ctx: SaveRollContext = {
      _hook: 'onSaveRoll',
      roll: 10,
      stat: 'wis',
      character: char,
      hasAdvantage: false,
      extraModifier: 0,
    };
    const result = applyEffects(char, 'onSaveRoll', ctx);
    // Proficiency bonus at L14 is +5
    expect(result.extraModifier).toBe(5);
  });

  it('Diamond Soul does NOT add proficiency to already-proficient saves', () => {
    vi.mocked(getRaceDef).mockReturnValue(undefined);
    vi.mocked(getClassDef).mockReturnValue({
      id: 'monk', name: 'Monk', hitDie: 8, hpBase: 8, hpPerLevel: 6,
      primaryStat: 'dex', savingThrowProfs: ['str', 'dex'], armorProfs: ['none'],
      weaponProfs: { simple: true, martial: true },
      skillChoices: { count: 2, from: ['acrobatics'] },
      startingEquipment: [], recommendedStats: { str: 10, dex: 16, con: 14, int: 10, wis: 16, cha: 8 },
      statPriority: ['dex', 'wis', 'con', 'int', 'cha', 'str'],
      features: [
        { id: 'diamond-soul', name: 'Diamond Soul', description: '', level: 14, kind: 'passive', effect: { kind: 'diamond-soul' } },
      ],
      subclasses: [], subclassLevel: 3, icon: '', description: '', flavor: '',
    });
    vi.mocked(getSubclassDef).mockReturnValue(undefined);
    vi.mocked(getProficiencyBonus).mockReturnValue(5); // L14 proficiency bonus

    const char = makeChar({ class: 'monk', level: 14 });
    const ctx: SaveRollContext = {
      _hook: 'onSaveRoll',
      roll: 10,
      stat: 'dex', // Monk IS proficient in DEX saves
      character: char,
      hasAdvantage: false,
      extraModifier: 0,
    };
    const result = applyEffects(char, 'onSaveRoll', ctx);
    expect(result.extraModifier).toBe(0);
  });
});

describe('applyEffects — onCharacterCreated (armor-proficiency)', () => {
  it('adds the granted armor proficiency to character.armorProfs', () => {
    vi.mocked(getRaceDef).mockReturnValue(undefined);
    vi.mocked(getClassDef).mockReturnValue(undefined);
    vi.mocked(getSubclassDef).mockReturnValue(undefined);
    vi.mocked(getFeatById).mockReturnValue({
      id: 'heavily-armored', name: 'Bulwark Training', category: 'armor',
      shortName: 'Bulwark', icon: '', description: '', mechanicalEffect: '',
      effectType: 'flag',
      effect: { kind: 'armor-proficiency', payload: { prof: 'heavy' } },
    });

    const char = makeChar({ feats: ['heavily-armored'], armorProfs: [] });
    const ctx = { _hook: 'onCharacterCreated' as const, character: char };
    applyEffects(char, 'onCharacterCreated', ctx);
    expect(char.armorProfs).toContain('heavy');
  });

  it('also grants shield proficiency for Moderately Armored', () => {
    vi.mocked(getRaceDef).mockReturnValue(undefined);
    vi.mocked(getClassDef).mockReturnValue(undefined);
    vi.mocked(getSubclassDef).mockReturnValue(undefined);
    vi.mocked(getFeatById).mockReturnValue({
      id: 'moderately-armored', name: 'Moderately Armored', category: 'armor',
      shortName: 'Med. Armor', icon: '', description: '', mechanicalEffect: '',
      effectType: 'flag',
      effect: { kind: 'armor-proficiency', payload: { prof: 'medium' } },
    });

    const char = makeChar({ feats: ['moderately-armored'], armorProfs: ['light'] });
    const ctx = { _hook: 'onCharacterCreated' as const, character: char };
    applyEffects(char, 'onCharacterCreated', ctx);
    expect(char.armorProfs).toContain('medium');
    expect(char.armorProfs).toContain('shield');
  });

  it('does not duplicate an existing proficiency', () => {
    vi.mocked(getRaceDef).mockReturnValue(undefined);
    vi.mocked(getClassDef).mockReturnValue(undefined);
    vi.mocked(getSubclassDef).mockReturnValue(undefined);
    vi.mocked(getFeatById).mockReturnValue({
      id: 'lightly-armored', name: 'Lightly Armored', category: 'armor',
      shortName: 'Light Armor', icon: '', description: '', mechanicalEffect: '',
      effectType: 'flag',
      effect: { kind: 'armor-proficiency', payload: { prof: 'light' } },
    });

    const char = makeChar({ feats: ['lightly-armored'], armorProfs: ['light'] });
    const ctx = { _hook: 'onCharacterCreated' as const, character: char };
    applyEffects(char, 'onCharacterCreated', ctx);
    expect((char.armorProfs || []).filter(p => p === 'light')).toHaveLength(1);
  });
});

describe('applyEffects — computeAc (Defense + fightingStyleTwo)', () => {
  it('Champion L10 with Defense primary + Defense secondary grants +2 AC (idempotent across two fighting-style payloads)', () => {
    vi.mocked(getRaceDef).mockReturnValue(undefined);
    vi.mocked(getClassDef).mockReturnValue({
      id: 'fighter', name: 'Fighter', hitDie: 10, hpBase: 10, hpPerLevel: 6,
      primaryStat: 'str', savingThrowProfs: ['str', 'con'],
      armorProfs: ['light', 'medium', 'heavy', 'shield'],
      weaponProfs: { simple: true, martial: true },
      skillChoices: { count: 2, from: ['athletics'] },
      startingEquipment: [], recommendedStats: { str: 16, dex: 13, con: 14, int: 10, wis: 12, cha: 10 },
      statPriority: ['str', 'con', 'cha', 'dex', 'wis', 'int'],
      features: [
        { id: 'fighting-style', name: 'Fighting Style', description: '', level: 1, kind: 'subclass',
          choice: { label: '', options: [] },
          effect: { kind: 'fighting-style' } },
      ],
      subclasses: [{
        id: 'champion', parentClass: 'fighter', name: 'Champion', description: '',
        features: [
          { id: 'additional-fighting-style', name: 'Additional Fighting Style', description: '', level: 10, kind: 'subclass',
            choice: { label: '', options: [] },
            effect: { kind: 'fighting-style' } },
        ],
      }],
      subclassLevel: 3, icon: '', description: '', flavor: '',
    });
    vi.mocked(getSubclassDef).mockReturnValue({
      id: 'champion', parentClass: 'fighter', name: 'Champion', description: '',
      features: [
        { id: 'additional-fighting-style', name: 'Additional Fighting Style', description: '', level: 10, kind: 'subclass',
          choice: { label: '', options: [] },
          effect: { kind: 'fighting-style' } },
      ],
    });

    const char = makeChar({
      class: 'fighter', subclassId: 'champion', level: 10,
      fightingStyle: 'defense', fightingStyleTwo: 'defense',
    });
    const ctx: AcContext = {
      _hook: 'computeAc',
      baseAc: 16,
      character: char,
      equippedArmor: { name: 'Chain Mail', type: 'heavy' },
      equippedWeaponCount: 1,
    };
    const result = applyEffects(char, 'computeAc', ctx);
    // Two Defense styles stack → +2 AC.
    expect(result.baseAc).toBe(18);
  });

  it('Champion L10 with one Defense style only grants +1 AC (no double-counting)', () => {
    vi.mocked(getRaceDef).mockReturnValue(undefined);
    vi.mocked(getClassDef).mockReturnValue({
      id: 'fighter', name: 'Fighter', hitDie: 10, hpBase: 10, hpPerLevel: 6,
      primaryStat: 'str', savingThrowProfs: ['str', 'con'],
      armorProfs: ['light', 'medium', 'heavy', 'shield'],
      weaponProfs: { simple: true, martial: true },
      skillChoices: { count: 2, from: ['athletics'] },
      startingEquipment: [], recommendedStats: { str: 16, dex: 13, con: 14, int: 10, wis: 12, cha: 10 },
      statPriority: ['str', 'con', 'cha', 'dex', 'wis', 'int'],
      features: [
        { id: 'fighting-style', name: 'Fighting Style', description: '', level: 1, kind: 'subclass',
          choice: { label: '', options: [] },
          effect: { kind: 'fighting-style' } },
      ],
      subclasses: [{
        id: 'champion', parentClass: 'fighter', name: 'Champion', description: '',
        features: [
          { id: 'additional-fighting-style', name: 'Additional Fighting Style', description: '', level: 10, kind: 'subclass',
            choice: { label: '', options: [] },
            effect: { kind: 'fighting-style' } },
        ],
      }],
      subclassLevel: 3, icon: '', description: '', flavor: '',
    });
    vi.mocked(getSubclassDef).mockReturnValue({
      id: 'champion', parentClass: 'fighter', name: 'Champion', description: '',
      features: [
        { id: 'additional-fighting-style', name: 'Additional Fighting Style', description: '', level: 10, kind: 'subclass',
          choice: { label: '', options: [] },
          effect: { kind: 'fighting-style' } },
      ],
    });

    const char = makeChar({
      class: 'fighter', subclassId: 'champion', level: 10,
      fightingStyle: 'defense', fightingStyleTwo: 'archery',
    });
    const ctx: AcContext = {
      _hook: 'computeAc',
      baseAc: 16,
      character: char,
      equippedArmor: { name: 'Chain Mail', type: 'heavy' },
      equippedWeaponCount: 1,
    };
    const result = applyEffects(char, 'computeAc', ctx);
    expect(result.baseAc).toBe(17); // +1 for primary Defense only
  });
});
