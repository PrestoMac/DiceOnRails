import { describe, it, expect } from 'vitest';
import { CLASSES_CATALOG, CLASSES_BY_ID } from '../../utils/classes';

describe('classes catalog', () => {
  it('has 12 classes', () => {
    expect(CLASSES_CATALOG.length).toBe(12);
  });

  it('every class has required fields', () => {
    for (const c of CLASSES_CATALOG) {
      expect(c.id).toBeTruthy();
      expect(c.name).toBeTruthy();
      expect(c.hitDie).toBeGreaterThan(0);
      expect(c.hpBase).toBeGreaterThan(0);
      expect(c.hpPerLevel).toBeGreaterThan(0);
      expect(c.savingThrowProfs.length).toBe(2);
      expect(c.features.length).toBeGreaterThanOrEqual(1);
      expect(c.subclasses.length).toBeGreaterThanOrEqual(1);
      expect(c.skillChoices.count).toBeGreaterThan(0);
      expect(c.skillChoices.from.length).toBeGreaterThan(0);
      expect(c.recommendedStats).toBeTruthy();
      expect(c.statPriority.length).toBe(6);
    }
  });

  it('CLASSES_BY_ID has all classes', () => {
    for (const c of CLASSES_CATALOG) {
      expect(CLASSES_BY_ID[c.id]).toBeDefined();
      expect(CLASSES_BY_ID[c.id].name).toBe(c.name);
    }
  });

  it('every class has valid saving throw proficiencies', () => {
    const validStats = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
    for (const c of CLASSES_CATALOG) {
      for (const prof of c.savingThrowProfs) {
        expect(validStats).toContain(prof);
      }
    }
  });

  it('every class has valid primary stat', () => {
    const validStats = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
    for (const c of CLASSES_CATALOG) {
      expect(validStats).toContain(c.primaryStat);
    }
  });

  it('every subclass has at least 1 feature', () => {
    for (const c of CLASSES_CATALOG) {
      for (const sc of c.subclasses) {
        expect(sc.features.length).toBeGreaterThanOrEqual(1);
        expect(sc.parentClass).toBe(c.id);
      }
    }
  });
});
