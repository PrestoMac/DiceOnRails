import { describe, it, expect } from 'vitest';
import { CONDITION_INFO, EXHAUSTION_LEVELS, getExhaustionSummary } from '../../data/conditionInfo';

describe('CONDITION_INFO', () => {
  it('contains the canonical SRD conditions', () => {
    const required = [
      'blinded', 'charmed', 'deafened', 'frightened', 'grappled',
      'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned',
      'prone', 'restrained', 'stunned', 'unconscious',
    ];
    for (const id of required) {
      expect(CONDITION_INFO[id], `expected entry for ${id}`).toBeDefined();
    }
  });

  it('every entry has an icon and a non-empty summary', () => {
    for (const [id, entry] of Object.entries(CONDITION_INFO)) {
      expect(entry.icon, `${id}.icon`).toBeTruthy();
      expect(entry.icon.startsWith('fa-'), `${id}.icon should be fa-*`).toBe(true);
      expect(entry.summary.length, `${id}.summary length`).toBeGreaterThan(10);
    }
  });

  it('marks buff-tone conditions with their tone', () => {
    expect(CONDITION_INFO['bless'].tone).toBe('buff');
    expect(CONDITION_INFO['heroism'].tone).toBe('buff');
    expect(CONDITION_INFO['mage-armor-ac'].tone).toBe('buff');
    expect(CONDITION_INFO['shield-ac'].tone).toBe('buff');
    expect(CONDITION_INFO['shield-of-faith-ac'].tone).toBe('buff');
    expect(CONDITION_INFO['divine-favor'].tone).toBe('buff');
  });

  it('marks bane as a debuff', () => {
    expect(CONDITION_INFO['bane'].tone).toBe('debuff');
  });

  it('includes spell-derived buff conditions (hunters-mark, magic-weapon, etc.)', () => {
    expect(CONDITION_INFO['hunters-mark']).toBeDefined();
    expect(CONDITION_INFO['magic-weapon']).toBeDefined();
    expect(CONDITION_INFO['branding-smite']).toBeDefined();
  });
});

describe('EXHAUSTION_LEVELS', () => {
  it('has exactly six levels numbered 1..6', () => {
    expect(EXHAUSTION_LEVELS).toHaveLength(6);
    expect(EXHAUSTION_LEVELS.map(l => l.level)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('level 6 is death', () => {
    expect(EXHAUSTION_LEVELS[5].description.toLowerCase()).toContain('death');
  });

  it('level 1 imposes disadvantage on ability checks', () => {
    expect(EXHAUSTION_LEVELS[0].description.toLowerCase()).toContain('disadvantage');
    expect(EXHAUSTION_LEVELS[0].description.toLowerCase()).toContain('ability check');
  });

  it('each level has a non-empty label and description', () => {
    for (const lvl of EXHAUSTION_LEVELS) {
      expect(lvl.label.length).toBeGreaterThan(0);
      expect(lvl.description.length).toBeGreaterThan(0);
    }
  });
});

describe('getExhaustionSummary', () => {
  it('returns empty for 0 or invalid input', () => {
    expect(getExhaustionSummary(0)).toBe('');
    expect(getExhaustionSummary(-1)).toBe('');
  });

  it('accumulates effects cumulatively', () => {
    const l1 = getExhaustionSummary(1);
    const l3 = getExhaustionSummary(3);
    expect(l3.length).toBeGreaterThan(l1.length);
    expect(l3.toLowerCase()).toContain('disadvantage on ability checks');
    expect(l3.toLowerCase()).toContain('speed halved');
    expect(l3.toLowerCase()).toContain('saving throws');
  });

  it('includes death at level 6', () => {
    expect(getExhaustionSummary(6).toLowerCase()).toContain('death');
  });
});
