import { describe, it, expect } from 'vitest';
import { lookupMonster, getMonstersByCR, getMonstersByType, getMonstersByCRRange, SRD_MONSTERS } from '../../utils/monsters';

describe('SRD Monster Manual', () => {
  describe('lookupMonster', () => {
    it('finds a goblin by exact name', () => {
      const m = lookupMonster('Goblin');
      expect(m).toBeDefined();
      expect(m?.name).toBe('Goblin');
      expect(m?.cr).toBe(0.25);
      expect(m?.xp).toBe(50);
      expect(m?.ac).toBe(15);
      expect(m?.attacks.length).toBeGreaterThanOrEqual(2);
    });

    it('finds an orc by exact name', () => {
      const m = lookupMonster('Orc');
      expect(m).toBeDefined();
      expect(m?.name).toBe('Orc');
      expect(m?.cr).toBe(0.5);
      expect(m?.xp).toBe(100);
      expect(m?.stats.str).toBe(16);
    });

    it('finds a monster case-insensitively', () => {
      const m = lookupMonster('goblin');
      expect(m).toBeDefined();
      expect(m?.name).toBe('Goblin');
    });

    it('finds by partial alias', () => {
      const m = lookupMonster('rat');
      expect(m).toBeDefined();
      expect(m?.name).toBe('Giant Rat');
    });

    it('finds "spider" as Giant Spider', () => {
      const m = lookupMonster('spider');
      expect(m).toBeDefined();
      expect(m?.name).toBe('Giant Spider');
    });

    it('finds "skeleton warrior" as Skeleton', () => {
      const m = lookupMonster('skeleton warrior');
      expect(m).toBeDefined();
      expect(m?.name).toBe('Skeleton');
    });

    it('returns undefined for unknown monsters', () => {
      const m = lookupMonster('Flumph');
      expect(m).toBeUndefined();
    });

    it('all monsters have required fields', () => {
      for (const m of SRD_MONSTERS) {
        expect(m.name).toBeTruthy();
        expect(m.ac).toBeGreaterThan(0);
        expect(m.hp).toBeGreaterThan(0);
        expect(m.stats.str).toBeGreaterThan(0);
        expect(m.attacks.length).toBeGreaterThan(0);
        expect(m.attacks[0].toHit).toBeDefined();
        expect(m.attacks[0].damageDice).toBeTruthy();
        expect(m.attacks[0].damageType).toBeTruthy();
        expect(m.cr).toBeGreaterThanOrEqual(0);
        expect(m.xp).toBeGreaterThanOrEqual(10);
      }
    });
  });

  describe('getMonstersByCR', () => {
    it('returns monsters at or below a given CR', () => {
      const lowCR = getMonstersByCR(0.25);
      expect(lowCR.length).toBeGreaterThan(0);
      for (const m of lowCR) {
        expect(m.cr).toBeLessThanOrEqual(0.25);
      }
    });

    it('returns all monsters at high CR', () => {
      const all = getMonstersByCR(10);
      expect(all.length).toBe(SRD_MONSTERS.length);
    });
  });

  describe('getMonstersByType', () => {
    it('finds undead monsters', () => {
      const undead = getMonstersByType('undead');
      expect(undead.length).toBeGreaterThan(0);
      for (const m of undead) {
        expect(m.type).toBe('undead');
      }
    });

    it('finds beast monsters', () => {
      const beasts = getMonstersByType('beast');
      expect(beasts.length).toBeGreaterThan(0);
      for (const m of beasts) {
        expect(m.type).toBe('beast');
      }
    });

    it('returns empty for unknown type', () => {
      expect(getMonstersByType('dragon')).toHaveLength(0);
    });
  });

  describe('getMonstersByCRRange', () => {
    it('returns monsters in a CR range', () => {
      const mid = getMonstersByCRRange(1, 3);
      expect(mid.length).toBeGreaterThan(0);
      for (const m of mid) {
        expect(m.cr).toBeGreaterThanOrEqual(1);
        expect(m.cr).toBeLessThanOrEqual(3);
      }
    });
  });
});
