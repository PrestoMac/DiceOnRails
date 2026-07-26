import { describe, it, expect, vi } from 'vitest';
import {
  BACKGROUNDS_CATALOG,
  BACKGROUNDS_BY_ID,
  ALIGNMENTS,
  ALIGNMENTS_BY_ID,
  BackgroundDefinition,
} from '../../data/backgrounds';
import { rollTraitFromTable, getBackgroundDef, getAlignmentName } from '../../utils/backgrounds';

describe('backgrounds catalog (SRD 5.1)', () => {
  it('contains the 13 SRD 5.1 backgrounds', () => {
    expect(BACKGROUNDS_CATALOG).toHaveLength(13);
    const ids = BACKGROUNDS_CATALOG.map(b => b.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'acolyte', 'charlatan', 'criminal', 'entertainer', 'folk-hero',
        'guild-artisan', 'hermit', 'noble', 'outlander', 'sage',
        'sailor', 'soldier', 'urchin',
      ]),
    );
  });

  it('every background has a full set of trait tables of the right SRD size', () => {
    for (const bg of BACKGROUNDS_CATALOG as BackgroundDefinition[]) {
      expect(bg.personalityTraits.length).toBeGreaterThanOrEqual(6);
      expect(bg.personalityTraits.length).toBeLessThanOrEqual(8);
      expect(bg.ideals).toHaveLength(6);
      expect(bg.bonds).toHaveLength(6);
      expect(bg.flaws).toHaveLength(6);
      expect(bg.feature.name).toBeTruthy();
      expect(bg.feature.description.length).toBeGreaterThan(20);
      // every ideal carries an alignment tag
      for (const ideal of bg.ideals) {
        expect(typeof ideal.alignment).toBe('string');
        expect(ideal.text.length).toBeGreaterThan(5);
      }
    }
  });

  it('has unique background ids', () => {
    const ids = BACKGROUNDS_CATALOG.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('BACKGROUNDS_BY_ID mirrors the catalog', () => {
    expect(BACKGROUNDS_BY_ID['acolyte'].name).toBe('Acolyte');
    expect(BACKGROUNDS_BY_ID['sage']).toBeDefined();
  });

  it('contains the 9 canonical alignments in grid order', () => {
    expect(ALIGNMENTS).toHaveLength(9);
    expect(ALIGNMENTS.map(a => a.id)).toEqual(['lg', 'ng', 'cg', 'ln', 'tn', 'cn', 'le', 'ne', 'ce']);
    expect(ALIGNMENTS_BY_ID['tn'].name).toBe('True Neutral');
  });
});

describe('rollTraitFromTable', () => {
  it('returns undefined for an empty table', () => {
    expect(rollTraitFromTable([])).toBeUndefined();
  });

  it('returns an element from the table', () => {
    const table = ['a', 'b', 'c', 'd'];
    const result = rollTraitFromTable(table, () => 2); // cryptoRoll returns [1, sides]; 2 -> index 1
    expect(result).toBe('b');
  });

  it('respects an injected RNG (deterministic)', () => {
    const table = ['x', 'y', 'z'];
    expect(rollTraitFromTable(table, () => 1)).toBe('x');
    expect(rollTraitFromTable(table, () => 3)).toBe('z');
  });

  it('clamps an out-of-range RNG result into the table bounds', () => {
    const table = ['only'];
    expect(rollTraitFromTable(table, () => 99)).toBe('only');
  });

  it('rolls against a real SRD background table', () => {
    const acolyte = BACKGROUNDS_BY_ID['acolyte'];
    vi.spyOn(Math, 'random');
    const result = rollTraitFromTable(acolyte.flaws);
    expect(acolyte.flaws).toContain(result);
  });
});

describe('background/alignment lookups', () => {
  it('getBackgroundDef returns undefined for empty/unknown ids', () => {
    expect(getBackgroundDef(undefined)).toBeUndefined();
    expect(getBackgroundDef('')).toBeUndefined();
    expect(getBackgroundDef('nonexistent')).toBeUndefined();
  });

  it('getAlignmentName resolves a full name', () => {
    expect(getAlignmentName('cg')).toBe('Chaotic Good');
    expect(getAlignmentName(undefined)).toBeUndefined();
  });
});
