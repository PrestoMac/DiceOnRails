import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BEAST_FORMS,
  getBeastForPolymorph,
  applyPolymorph,
  applyWildShape,
  revertTransformation,
  TransformationState,
} from '../../services/transformationEngine';
import { makeCharacter } from '../helpers/characters';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BEAST_FORMS', () => {
  it('contains expected beast keys', () => {
    const keys = Object.keys(BEAST_FORMS);
    expect(keys).toContain('wolf');
    expect(keys).toContain('brown-bear');
    expect(keys).toContain('giant-eagle');
    expect(keys).toContain('dire-wolf');
    expect(keys).toContain('giant-crocodile');
    expect(keys).toContain('tyrannosaurus-rex');
  });

  it('each form has required fields', () => {
    const forms = Object.values(BEAST_FORMS);
    for (const form of forms) {
      expect(form.name).toBeTypeOf('string');
      expect(form.cr).toBeTypeOf('number');
      expect(form.hp.max).toBeTypeOf('number');
      expect(form.hp.current).toBeTypeOf('number');
      expect(form.ac).toBeTypeOf('number');
      expect(form.beastFields?.speed).toBeTypeOf('number');
      expect(Array.isArray(form.attacks)).toBe(true);
      expect(form.stats.str).toBeTypeOf('number');
      expect(form.stats.dex).toBeTypeOf('number');
      expect(form.stats.con).toBeTypeOf('number');
      expect(form.stats.int).toBeTypeOf('number');
      expect(form.stats.wis).toBeTypeOf('number');
      expect(form.stats.cha).toBeTypeOf('number');
    }
  });

  it('attacks array is non-empty for each form', () => {
    const forms = Object.values(BEAST_FORMS);
    for (const form of forms) {
      expect(form.attacks.length).toBeGreaterThan(0);
    }
  });
});

describe('getBeastForPolymorph', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  it('returns an eligible beast for CR 0.25', () => {
    const result = getBeastForPolymorph(0.25);
    expect(result).not.toBeNull();
    expect(result?.cr).toBe(0.25);
  });

  it('returns beast with CR <= 1 for CR 1', () => {
    const result = getBeastForPolymorph(1);
    expect(result).not.toBeNull();
    expect(result?.cr).toBeLessThanOrEqual(1);
  });

  it('returns null for CR 0', () => {
    const result = getBeastForPolymorph(0);
    expect(result).toBeNull();
  });

  it('returns a beast for high CR', () => {
    const result = getBeastForPolymorph(20);
    expect(result).not.toBeNull();
    expect(Object.values(BEAST_FORMS)).toContain(result);
  });

  it('returns null for negative CR', () => {
    const result = getBeastForPolymorph(-1);
    expect(result).toBeNull();
  });
});

describe('applyPolymorph', () => {
  const wolf = BEAST_FORMS['wolf'];

  it('saves original stats', () => {
    const char = makeCharacter();
    const state = applyPolymorph(char, wolf, 60);
    expect(state.originalForm?.stats).toEqual(char.stats);
  });

  it('saves original HP', () => {
    const char = makeCharacter();
    const state = applyPolymorph(char, wolf, 60);
    expect(state.originalForm?.hp).toEqual(char.hp);
  });

  it('sets transformedInto name', () => {
    const char = makeCharacter();
    const state = applyPolymorph(char, wolf, 60);
    expect(state.transformedInto).toBe('Wolf');
  });

  it('sets transformationType to polymorph', () => {
    const char = makeCharacter();
    const state = applyPolymorph(char, wolf, 60);
    expect(state.transformationType).toBe('polymorph');
  });

  it('records duration', () => {
    const char = makeCharacter();
    const state = applyPolymorph(char, wolf, 60);
    expect(state.duration).toBe(60);
  });

  it('records casterId from character id', () => {
    const char = makeCharacter();
    const state = applyPolymorph(char, wolf, 60);
    expect(state.casterId).toBe(char.id);
  });

  it('calculates AC using beast AC or 10+DEX', () => {
    const direWolf = BEAST_FORMS['dire-wolf'];
    const char = makeCharacter();
    const state = applyPolymorph(char, direWolf, 60);
    expect(state.originalForm?.ac).toBe(14);
  });
});

describe('applyWildShape', () => {
  const wolf = BEAST_FORMS['wolf'];

  it('sets transformationType to wild-shape', () => {
    const char = makeCharacter();
    const state = applyWildShape(char, wolf, 60);
    expect(state.transformationType).toBe('wild-shape');
  });

  it('sets transformedInto and duration like polymorph', () => {
    const char = makeCharacter();
    const state = applyWildShape(char, wolf, 120);
    expect(state.transformedInto).toBe('Wolf');
    expect(state.duration).toBe(120);
    expect(state.originalForm).not.toBeNull();
    expect(state.originalForm?.stats).toEqual(char.stats);
    expect(state.originalForm?.hp).toEqual(char.hp);
  });

  it('preserves duration value', () => {
    const char = makeCharacter();
    const state = applyWildShape(char, wolf, 999);
    expect(state.duration).toBe(999);
  });
});

describe('overwrite transformation', () => {
  it('second polymorph overwrites first with fresh originalForm', () => {
    const char = makeCharacter();
    const wolf = BEAST_FORMS['wolf'];
    const bear = BEAST_FORMS['brown-bear'];

    applyPolymorph(char, wolf, 60);
    char.hp.current = 5;

    const second = applyPolymorph(char, bear, 30);
    expect(second.transformedInto).toBe('Brown Bear');
    expect(second.duration).toBe(30);
    expect(second.originalForm?.hp.current).toBe(5);
  });
});

describe('revertTransformation', () => {
  it('returns true when duration is 0', () => {
    const state: TransformationState = {
      originalForm: null,
      transformedInto: 'Wolf',
      transformationType: 'polymorph',
      duration: 0,
      casterId: '',
    };
    expect(revertTransformation(state)).toBe(true);
  });

  it('returns true when duration is negative', () => {
    const state: TransformationState = {
      originalForm: null,
      transformedInto: 'Wolf',
      transformationType: 'polymorph',
      duration: -1,
      casterId: '',
    };
    expect(revertTransformation(state)).toBe(true);
  });

  it('returns false when duration is positive', () => {
    const state: TransformationState = {
      originalForm: null,
      transformedInto: 'Wolf',
      transformationType: 'polymorph',
      duration: 10,
      casterId: '',
    };
    expect(revertTransformation(state)).toBe(false);
  });
});
