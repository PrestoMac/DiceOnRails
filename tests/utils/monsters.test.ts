import { describe, it, expect } from 'vitest';
import { lookupMonster, SRD_MONSTERS } from '../../utils/monsters';

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
});
