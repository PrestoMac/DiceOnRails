import { describe, it, expect } from 'vitest';
import { GLOSSARY } from '../../data/glossary';

describe('GLOSSARY', () => {
  it('is non-empty and alphabetized by term', () => {
    expect(GLOSSARY.length).toBeGreaterThan(15);
    const terms = GLOSSARY.map(g => g.term.toLowerCase());
    const sorted = [...terms].sort();
    expect(terms).toEqual(sorted);
  });

  it('includes core jargon: AC, DC, ASI, Cantrip, Concentration, Proficiency', () => {
    const terms = new Set(GLOSSARY.map(g => g.term.toLowerCase()));
    expect(terms.has('ac (armor class)')).toBe(true);
    expect(terms.has('dc (difficulty class)')).toBe(true);
    expect(terms.has('asi')).toBe(true);
    expect(terms.has('cantrip')).toBe(true);
    expect(terms.has('concentration')).toBe(true);
    expect(terms.has('proficiency')).toBe(true);
  });

  it('every entry has a non-trivial definition', () => {
    for (const entry of GLOSSARY) {
      expect(entry.definition.length, `${entry.term}`).toBeGreaterThan(20);
    }
  });

  it('every seeAlso reference resolves to an existing term', () => {
    const terms = new Set(GLOSSARY.map(g => g.term.toLowerCase()));
    for (const entry of GLOSSARY) {
      for (const ref of entry.seeAlso ?? []) {
        const hasExact = terms.has(ref.toLowerCase());
        const hasPartial = GLOSSARY.some(g => g.term.toLowerCase().includes(ref.toLowerCase()));
        expect(hasExact || hasPartial, `${entry.term} -> see also "${ref}" not found`).toBe(true);
      }
    }
  });
});
