import { describe, it, expect } from 'vitest';
import { lookupSRDItem, SRD_ITEMS } from '../../utils/srdItems';

describe('SRD Items', () => {
  describe('lookupSRDItem', () => {
    it('finds by exact name (case-insensitive)', () => {
      const item = lookupSRDItem('Longsword');
      expect(item).toBeDefined();
      expect(item?.name).toBe('Longsword');
      expect(item?.type).toBe('weapon');
    });

    it('finds by lowercase exact name', () => {
      const item = lookupSRDItem('plate armor');
      expect(item).toBeDefined();
      expect(item?.name).toBe('Plate Armor');
    });

    it('returns undefined for truly unknown items without substring overlap', () => {
      expect(lookupSRDItem('Excalibur')).toBeUndefined();
      expect(lookupSRDItem('Zyxwv')).toBeUndefined();
    });

    it('matches healing potion aliases', () => {
      const item1 = lookupSRDItem('healing potion');
      expect(item1).toBeDefined();
      expect(item1?.name).toBe('Potion of Healing');
      const item2 = lookupSRDItem('red potion');
      expect(item2).toBeDefined();
      expect(item2?.name).toBe('Potion of Healing');
      const item3 = lookupSRDItem('potion');
      expect(item3).toBeDefined();
      expect(item3?.name).toBe('Potion of Healing');
    });

    it('matches greater healing potion', () => {
      const item = lookupSRDItem('greater healing potion');
      expect(item).toBeDefined();
      expect(item?.name).toBe('Potion of Healing');
    });

    it('matches superior healing potion', () => {
      const item = lookupSRDItem('superior healing potion');
      expect(item).toBeDefined();
      expect(item?.name).toBe('Potion of Healing');
    });

    it('matches dagger by partial name', () => {
      const item = lookupSRDItem('rusty dagger');
      expect(item).toBeDefined();
      expect(item?.name).toBe('Dagger');
    });

    it('matches shield', () => {
      const item = lookupSRDItem('wooden shield');
      expect(item).toBeDefined();
      expect(item?.name).toBe('Shield');
    });

    it('matches chain mail', () => {
      const item1 = lookupSRDItem('chain mail');
      expect(item1).toBeDefined();
      expect(item1?.name).toBe('Chain Mail');
      const item2 = lookupSRDItem('chainmail');
      expect(item2).toBeDefined();
      expect(item2?.name).toBe('Chain Mail');
    });

    it('falls back to substring match', () => {
      const item = lookupSRDItem('Backpack');
      expect(item).toBeDefined();
      expect(item?.name).toBe('Backpack');
    });

    it('matches rock and stone variants', () => {
      const item1 = lookupSRDItem('stone');
      expect(item1).toBeDefined();
      expect(item1?.name).toBe('Rock');
      const item2 = lookupSRDItem('rock');
      expect(item2).toBeDefined();
      expect(item2?.name).toBe('Rock');
    });

    it('matches leather armor', () => {
      const item = lookupSRDItem('leather armor');
      expect(item).toBeDefined();
      expect(item?.name).toBe('Leather Armor');
    });

    it('empty string falls through to substring match (finds first item)', () => {
      const item = lookupSRDItem('');
      expect(item).toBeDefined();
    });

    it('whitespace string behaves like empty after trim', () => {
      const item = lookupSRDItem('   ');
      expect(item).toBeDefined();
    });
  });

  describe('SRD_ITEMS array', () => {
    it('has at least 30 items', () => {
      expect(SRD_ITEMS.length).toBeGreaterThanOrEqual(30);
    });

    it('every item has name, type, rarity, description', () => {
      for (const item of SRD_ITEMS) {
        expect(item.name).toBeTruthy();
        expect(item.type).toBeTruthy();
        expect(item.rarity).toBeTruthy();
        expect(item.description).toBeTruthy();
      }
    });

    it('has items of every expected type', () => {
      const types = new Set(SRD_ITEMS.map(i => i.type));
      expect(types.has('weapon')).toBe(true);
      expect(types.has('armor')).toBe(true);
      expect(types.has('potion')).toBe(true);
      expect(types.has('shield')).toBe(true);
      expect(types.has('gear')).toBe(true);
    });
  });
});
