import { describe, it, expect } from 'vitest';
import { RACES_CATALOG, RACES_BY_ID } from '../../utils/races';

describe('races catalog', () => {
  it('has 9 races', () => {
    expect(RACES_CATALOG.length).toBe(9);
  });

  it('every race has required fields', () => {
    for (const r of RACES_CATALOG) {
      expect(r.id).toBeTruthy();
      expect(r.name).toBeTruthy();
      expect(r.speed).toBeGreaterThan(0);
      expect(r.size).toMatch(/^(small|medium)$/);
      expect(r.asi).toBeTruthy();
      expect(r.languages.length).toBeGreaterThan(0);
    }
  });

  it('RACES_BY_ID has all races', () => {
    for (const r of RACES_CATALOG) {
      expect(RACES_BY_ID[r.id]).toBeDefined();
      expect(RACES_BY_ID[r.id].name).toBe(r.name);
    }
  });

  it('every race with fixed ASI has 6 entries', () => {
    for (const r of RACES_CATALOG) {
      if (typeof r.asi === 'object') {
        expect(Object.keys(r.asi).length).toBe(6);
      }
    }
  });

  it('half-elf uses flexible-2 ASI', () => {
    const halfElf = RACES_CATALOG.find(r => r.id === 'half-elf');
    expect(halfElf).toBeDefined();
    expect(halfElf?.asi).toBe('flexible-2');
    expect(halfElf?.asiChoice).toBe(1);
  });

  it('every trait has valid fields', () => {
    for (const r of RACES_CATALOG) {
      for (const t of r.traits) {
        expect(t.id).toBeTruthy();
        expect(t.name).toBeTruthy();
        expect(t.description).toBeTruthy();
        expect(t.kind).toMatch(/^(passive|resource|action|spell-like)$/);
      }
    }
  });
});
