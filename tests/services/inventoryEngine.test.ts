import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeCharacter, makeWizard, makeBarbarian } from '../helpers/characters';
import type { Enemy, InventoryItem } from '../../types';
import {
  normalizeCurrency,
  adjustCharacterCurrency,
  applyEquipmentEffects,
  addInventoryItem,
  removeInventoryItem,
  editInventoryItem,
  inflictDamageOnTarget,
  healCharacter,
  processInventoryAction,
} from '../../services/inventoryEngine';

vi.mock('../../services/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        ilike: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    })),
  },
}));

const GARBAGE_NAMES = /^(?:shop|man|woman|person|halfling|dwarf|elf|goblin|me|myself|yourself|out|in|up|down|some|any|of|the|a|an|it|them|this|that|those|these|there|here|someone|anyone|everyone|nobody)$/i;

function makeEnemy(overrides: Partial<{
  id: string;
  name: string;
  ac: number;
  hp: { current: number; max: number };
  attacks: Array<{ name: string; toHit: number; damageDice: string; damageType: string }>;
  isDead: boolean;
  damageResistances?: string[];
  damageImmunities?: string[];
  damageVulnerabilities?: string[];
  tempHp?: number;
}> = {}): Enemy {
  return {
    id: 'enemy-1',
    name: 'Goblin',
    ac: 15,
    hp: { current: 30, max: 30 },
    attacks: [{ name: 'Scimitar', toHit: 4, damageDice: '1d6', damageType: 'slashing' }],
    isDead: false,
    damageResistances: [],
    damageImmunities: [],
    damageVulnerabilities: [],
    ...overrides,
  } as Enemy;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('normalizeCurrency', () => {
  it('converts 1234 CP to 12 GP, 3 SP, 4 CP', () => {
    const result = normalizeCurrency(1234);
    expect(result).toEqual({ gp: 12, sp: 3, cp: 4 });
  });

  it('converts 0 CP to all zeros', () => {
    const result = normalizeCurrency(0);
    expect(result).toEqual({ gp: 0, sp: 0, cp: 0 });
  });

  it('converts 99999 CP to 999 GP, 9 SP, 9 CP', () => {
    const result = normalizeCurrency(99999);
    expect(result).toEqual({ gp: 999, sp: 9, cp: 9 });
  });

  it('clamps negative -50 CP to all zeros', () => {
    const result = normalizeCurrency(-50);
    expect(result).toEqual({ gp: 0, sp: 0, cp: 0 });
  });

  it('converts 1 CP to 0 GP, 0 SP, 1 CP', () => {
    const result = normalizeCurrency(1);
    expect(result).toEqual({ gp: 0, sp: 0, cp: 1 });
  });

  it('converts 10 CP to 0 GP, 1 SP, 0 CP', () => {
    const result = normalizeCurrency(10);
    expect(result).toEqual({ gp: 0, sp: 1, cp: 0 });
  });
});

describe('adjustCharacterCurrency', () => {
  it('adds 10 GP', () => {
    const char = makeCharacter();
    const result = adjustCharacterCurrency(char, 10, 0, 0);
    expect(result.character.currency).toEqual({ gp: 25, sp: 5, cp: 0 });
    expect(result.totalCp).toBe(2550);
  });

  it('deducts 5 GP', () => {
    const char = makeCharacter();
    const result = adjustCharacterCurrency(char, -5, 0, 0);
    expect(result.character.currency).toEqual({ gp: 10, sp: 5, cp: 0 });
    expect(result.totalCp).toBe(1050);
  });

  it('deducts a SP/CP combo', () => {
    const char = makeCharacter();
    const result = adjustCharacterCurrency(char, 0, -3, -4);
    expect(result.character.currency).toEqual({ gp: 15, sp: 1, cp: 6 });
    expect(result.totalCp).toBe(1516);
  });

  it('returns insufficient funds when deducting 20 GP', () => {
    const char = makeCharacter();
    const result = adjustCharacterCurrency(char, -20, 0, 0);
    expect(result.character.currency).toEqual({ gp: 15, sp: 5, cp: 0 });
    expect(result.totalCp).toBe(1550);
    expect(result.message).toContain('Insufficient funds');
  });

  it('deducts exact amount to zero', () => {
    const char = makeCharacter();
    const result = adjustCharacterCurrency(char, -15, -5, 0);
    expect(result.character.currency).toEqual({ gp: 0, sp: 0, cp: 0 });
    expect(result.totalCp).toBe(0);
  });

  it('returns insufficient funds when one CP over', () => {
    const char = makeCharacter();
    const result = adjustCharacterCurrency(char, -15, -5, -1);
    expect(result.character.currency).toEqual({ gp: 15, sp: 5, cp: 0 });
    expect(result.message).toContain('Insufficient funds');
  });

  it('handles zero adjustment as a no-op', () => {
    const char = makeCharacter();
    const result = adjustCharacterCurrency(char, 0, 0, 0);
    expect(result.character.currency).toEqual({ gp: 15, sp: 5, cp: 0 });
    expect(result.totalCp).toBe(1550);
  });

  it('treats NaN as 0', () => {
    const char = makeCharacter();
    const result = adjustCharacterCurrency(char, NaN, NaN, NaN);
    expect(result.character.currency).toEqual({ gp: 15, sp: 5, cp: 0 });
  });
});

describe('applyEquipmentEffects', () => {
  it('equips an armor and marks it equipped', () => {
    const char = makeCharacter({
      inventory: [
        { name: 'Longsword', quantity: 1, type: 'weapon', stats: { damage: '1d8' }, equipped: true },
        { name: 'Chain Mail', quantity: 1, type: 'armor', stats: { acFormula: '16' }, equipped: true },
        { name: 'Leather Armor', quantity: 1, type: 'armor', stats: { acFormula: '11+dex' }, equipped: false },
      ],
    });
    const leather = char.inventory.find(i => i.name === 'Leather Armor') as InventoryItem;
    const result = applyEquipmentEffects(char, leather, 'equip');
    const equippedLeather = result.inventory.find(i => i.name === 'Leather Armor');
    const chainMail = result.inventory.find(i => i.name === 'Chain Mail');
    expect(equippedLeather?.equipped).toBe(true);
    expect(chainMail?.equipped).toBe(false);
  });

  it('equipping armor unequips previously equipped armor', () => {
    const char = makeCharacter({
      inventory: [
        { name: 'Longsword', quantity: 1, type: 'weapon', stats: { damage: '1d8' }, equipped: true },
        { name: 'Chain Mail', quantity: 1, type: 'armor', stats: { acFormula: '16' }, equipped: true },
        { name: 'Scale Mail', quantity: 1, type: 'armor', stats: { acFormula: '14+dex(max 2)' }, equipped: false },
      ],
    });
    const scaleMail = char.inventory.find(i => i.name === 'Scale Mail') as InventoryItem;
    const result = applyEquipmentEffects(char, scaleMail, 'equip');
    const chainMail = result.inventory.find(i => i.name === 'Chain Mail');
    expect(chainMail?.equipped).toBe(false);
  });

  it('equipping shield unequips previously equipped shield', () => {
    const char = makeCharacter({
      inventory: [
        { name: 'Longsword', quantity: 1, type: 'weapon', stats: { damage: '1d8' }, equipped: true },
        { name: 'Shield', quantity: 1, type: 'shield', stats: { acBonus: 2 }, equipped: true },
        { name: 'Wooden Shield', quantity: 1, type: 'shield', stats: { acBonus: 2 }, equipped: false },
      ],
    });
    const woodenShield = char.inventory.find(i => i.name === 'Wooden Shield') as InventoryItem;
    const result = applyEquipmentEffects(char, woodenShield, 'equip');
    const shield = result.inventory.find(i => i.name === 'Shield');
    expect(shield?.equipped).toBe(false);
  });

  it('equipping armor also unequips shield because they share the same category check', () => {
    const char = makeCharacter({
      inventory: [
        { name: 'Longsword', quantity: 1, type: 'weapon', stats: { damage: '1d8' }, equipped: true },
        { name: 'Shield', quantity: 1, type: 'shield', stats: { acBonus: 2 }, equipped: true },
        { name: 'Chain Mail', quantity: 1, type: 'armor', stats: { acFormula: '16' }, equipped: true },
        { name: 'Scale Mail', quantity: 1, type: 'armor', stats: { acFormula: '14+dex(max 2)' }, equipped: false },
      ],
    });
    const scaleMail = char.inventory.find(i => i.name === 'Scale Mail') as InventoryItem;
    const result = applyEquipmentEffects(char, scaleMail, 'equip');
    const shield = result.inventory.find(i => i.name === 'Shield');
    expect(shield?.equipped).toBe(false);
  });

  it('unequips armor', () => {
    const char = makeCharacter();
    const chainMail = char.inventory.find(i => i.name === 'Chain Mail') as InventoryItem;
    const result = applyEquipmentEffects(char, chainMail, 'unequip');
    const unequipped = result.inventory.find(i => i.name === 'Chain Mail');
    expect(unequipped?.equipped).toBe(false);
  });

  it('cannot equip armor without proficiency (Wizard)', () => {
    const wizard = makeWizard();
    const chainMail: InventoryItem = {
      name: 'Chain Mail', quantity: 1, type: 'armor', stats: { acFormula: '16' },
    };
    const result = applyEquipmentEffects(wizard, chainMail, 'equip');
    expect(result.inventory).toEqual(wizard.inventory);
  });

  it('cannot equip heavy armor as Barbarian', () => {
    const barb = makeBarbarian();
    const chainMail: InventoryItem = {
      name: 'Chain Mail', quantity: 1, type: 'armor', stats: { acFormula: '16' },
    };
    const result = applyEquipmentEffects(barb, chainMail, 'equip');
    expect(result.inventory).toEqual(barb.inventory);
  });

  it('equipping non-armor skips proficiency check', () => {
    const wizard = makeWizard({
      inventory: [
        { name: 'Spellbook', quantity: 1, type: 'gear' },
        { name: 'Longsword', quantity: 1, type: 'weapon', stats: { damage: '1d8' }, equipped: false },
      ],
    });
    const longsword = wizard.inventory.find(i => i.name === 'Longsword') as InventoryItem;
    const result = applyEquipmentEffects(wizard, longsword, 'equip');
    const equipped = result.inventory.find(i => i.name === 'Longsword');
    expect(equipped?.equipped).toBe(true);
  });

  it('unequips non-armor item', () => {
    const char = makeCharacter();
    const longsword = char.inventory.find(i => i.name === 'Longsword') as InventoryItem;
    const result = applyEquipmentEffects(char, longsword, 'unequip');
    const unequipped = result.inventory.find(i => i.name === 'Longsword');
    expect(unequipped?.equipped).toBe(false);
  });
});

describe('addInventoryItem', () => {
  it('adds a new item to empty inventory', () => {
    const char = makeCharacter({ inventory: [] });
    const result = addInventoryItem(char, 'Potion of Healing', 2);
    expect(result.character.inventory).toHaveLength(1);
    expect(result.character.inventory[0].name).toBe('Potion of Healing');
    expect(result.character.inventory[0].quantity).toBe(2);
  });

  it('stacks with existing item (case-insensitive)', () => {
    const char = makeCharacter();
    const result = addInventoryItem(char, 'longsword', 1);
    const item = result.character.inventory.find(i => i.name.toLowerCase() === 'longsword');
    expect(item?.quantity).toBe(2);
  });

  it('stacks with meta overwrite', () => {
    const char = makeCharacter();
    const result = addInventoryItem(char, 'Longsword', 1, { type: 'weapon', rarity: 'rare' });
    const item = result.character.inventory.find(i => i.name === 'Longsword');
    expect(item?.quantity).toBe(2);
    expect(item?.rarity).toBe('rare');
  });

  it('adds item with full metadata', () => {
    const char = makeCharacter({ inventory: [] });
    const result = addInventoryItem(char, 'Amulet of Health', 1, {
      type: 'gear', rarity: 'rare', description: 'A shimmering amulet', stats: { conBonus: 2 }, equipped: true,
    });
    const item = result.character.inventory[0];
    expect(item.name).toBe('Amulet of Health');
    expect(item.type).toBe('gear');
    expect(item.rarity).toBe('rare');
    expect(item.description).toBe('A shimmering amulet');
    expect(item.stats).toEqual({ conBonus: 2 });
    expect(item.equipped).toBe(true);
  });

  it('truncates conjunctions from item name', () => {
    const char = makeCharacter({ inventory: [] });
    const result = addInventoryItem(char, 'Dagger and Shield', 1);
    expect(result.character.inventory[0].name).toBe('Dagger');
  });

  it('truncates name at 60 characters', () => {
    const char = makeCharacter({ inventory: [] });
    const longName = 'a'.repeat(70);
    const result = addInventoryItem(char, longName, 1);
    expect(result.character.inventory[0].name.length).toBe(60);
    expect(result.character.inventory[0].name).toBe('a'.repeat(60));
  });

  it('allows garbage names at engine level', () => {
    const char = makeCharacter({ inventory: [] });
    const result = addInventoryItem(char, 'shop', 1);
    const item = result.character.inventory.find(i => i.name === 'shop');
    expect(item?.quantity).toBe(1);
  });

  it('adds item with quantity 0', () => {
    const char = makeCharacter({ inventory: [] });
    const result = addInventoryItem(char, 'Potion', 0);
    expect(result.character.inventory[0].quantity).toBe(0);
  });
});

describe('removeInventoryItem', () => {
  it('removes partial quantity', () => {
    const char = makeCharacter({ inventory: [{ name: 'Potion', quantity: 5, type: 'potion' }] });
    const result = removeInventoryItem(char, 'Potion', 3);
    const item = result.character.inventory.find(i => i.name === 'Potion');
    expect(item?.quantity).toBe(2);
    expect(result.message).toContain('Removed 3x');
  });

  it('removes full quantity and splices item', () => {
    const char = makeCharacter({ inventory: [{ name: 'Potion', quantity: 1, type: 'potion' }] });
    const result = removeInventoryItem(char, 'Potion', 1);
    const item = result.character.inventory.find(i => i.name === 'Potion');
    expect(item).toBeUndefined();
    expect(result.removedItem?.name).toBe('Potion');
    expect(result.message).toContain('Removed all');
  });

  it('returns message when removing more than available', () => {
    const char = makeCharacter({ inventory: [{ name: 'Potion', quantity: 2, type: 'potion' }] });
    const result = removeInventoryItem(char, 'Potion', 5);
    expect(result.character.inventory).toHaveLength(0);
    expect(result.removedItem?.name).toBe('Potion');
  });

  it('returns not found message for non-existent item', () => {
    const char = makeCharacter();
    const result = removeInventoryItem(char, 'Potion of Healing', 1);
    expect(result.character).toBe(char);
    expect(result.message).toContain('Could not find');
  });

  it('matches item case-insensitively', () => {
    const char = makeCharacter();
    const result = removeInventoryItem(char, 'LONGSWORD', 1);
    const item = result.character.inventory.find(i => i.name === 'Longsword');
    expect(item).toBeUndefined();
  });

  it('handles conjunctions in item name for removal', () => {
    const char = makeCharacter();
    const result = removeInventoryItem(char, 'Longsword and Shield', 1);
    const item = result.character.inventory.find(i => i.name === 'Longsword');
    expect(item).toBeUndefined();
  });
});

describe('editInventoryItem', () => {
  it('updates quantity', () => {
    const char = makeCharacter();
    const result = editInventoryItem(char, 'Longsword', { quantity: 3 });
    const item = result.character.inventory.find(i => i.name === 'Longsword');
    expect(item?.quantity).toBe(3);
  });

  it('updates name, type, and rarity', () => {
    const char = makeCharacter();
    const result = editInventoryItem(char, 'Longsword', { name: 'Greatsword', type: 'weapon', rarity: 'rare' });
    const item = result.character.inventory.find(i => i.name === 'Greatsword');
    expect(item?.type).toBe('weapon');
    expect(item?.rarity).toBe('rare');
  });

  it('auto-removes item when quantity set to 0', () => {
    const char = makeCharacter();
    const result = editInventoryItem(char, 'Longsword', { quantity: 0 });
    const item = result.character.inventory.find(i => i.name === 'Longsword');
    expect(item).toBeUndefined();
    expect(result.message).toContain('Removed all');
  });

  it('auto-removes item when quantity set to negative', () => {
    const char = makeCharacter();
    const result = editInventoryItem(char, 'Longsword', { quantity: -1 });
    const item = result.character.inventory.find(i => i.name === 'Longsword');
    expect(item).toBeUndefined();
  });

  it('returns not found message for non-existent item', () => {
    const char = makeCharacter();
    const result = editInventoryItem(char, 'NonExistent', { quantity: 1 });
    expect(result.character).toBe(char);
    expect(result.message).toContain('Could not find');
  });

  it('performs partial update with only type change', () => {
    const char = makeCharacter();
    const result = editInventoryItem(char, 'Longsword', { type: 'gear' });
    const item = result.character.inventory.find(i => i.name === 'Longsword');
    expect(item?.type).toBe('gear');
    expect(item?.quantity).toBe(1);
  });
});

describe('inflictDamageOnTarget', () => {
  it('deals plain damage to a character', () => {
    const char = makeCharacter();
    const result = inflictDamageOnTarget(char, 5);
    expect(result.actualDamage).toBe(5);
    expect(result.target.hp.current).toBe(7);
  });

  it('deals plain damage to an enemy', () => {
    const enemy = makeEnemy();
    const result = inflictDamageOnTarget(enemy, 5);
    expect(result.actualDamage).toBe(5);
    expect(result.target.hp.current).toBe(25);
  });

  it('defeats an enemy when HP reaches 0', () => {
    const enemy = makeEnemy();
    const result = inflictDamageOnTarget(enemy, 30);
    const updatedEnemy = result.target as Enemy;
    expect(updatedEnemy.isDead).toBe(true);
    expect(result.message).toContain('is defeated');
  });

  it('deals 0 damage to immune enemy', () => {
    const enemy = makeEnemy({ damageImmunities: ['fire'] });
    const result = inflictDamageOnTarget(enemy, 20, 'fire');
    expect(result.actualDamage).toBe(0);
    expect(result.target.hp.current).toBe(30);
  });

  it('halves damage for resistant enemy', () => {
    const enemy = makeEnemy({ damageResistances: ['cold'] });
    const result = inflictDamageOnTarget(enemy, 13, 'cold');
    expect(result.actualDamage).toBe(6);
    expect(result.target.hp.current).toBe(24);
  });

  it('doubles damage for vulnerable enemy', () => {
    const enemy = makeEnemy({ damageVulnerabilities: ['radiant'] });
    const result = inflictDamageOnTarget(enemy, 10, 'radiant');
    expect(result.actualDamage).toBe(20);
    expect(result.target.hp.current).toBe(10);
  });

  it('skips enemy damage type branch when no damageType provided', () => {
    const enemy = makeEnemy({ damageImmunities: ['fire'] });
    const result = inflictDamageOnTarget(enemy, 10);
    expect(result.actualDamage).toBe(10);
    expect(result.target.hp.current).toBe(20);
  });

  it('partially absorbs damage with temp HP on character', () => {
    const char = makeCharacter({ tempHp: 5 });
    const result = inflictDamageOnTarget(char, 8);
    expect(result.actualDamage).toBe(8);
    expect(result.target.tempHp).toBe(0);
    expect(result.target.hp.current).toBe(9);
  });

  it('fully absorbs damage with temp HP on enemy', () => {
    const enemy = makeEnemy({ tempHp: 10 });
    const result = inflictDamageOnTarget(enemy, 5);
    expect(result.actualDamage).toBe(5);
    expect(result.target.tempHp).toBe(5);
    expect(result.target.hp.current).toBe(30);
  });

  it('reduces bludgeoning damage with Heavy Armor Master', () => {
    const char = makeCharacter({ feats: ['heavy-armor-master'] });
    const result = inflictDamageOnTarget(char, 5, 'bludgeoning');
    expect(result.actualDamage).toBe(2);
    expect(result.target.hp.current).toBe(10);
  });

  it('only reduces B/P/S with Heavy Armor Master, not other types', () => {
    const char = makeCharacter({ feats: ['heavy-armor-master'] });
    const result = inflictDamageOnTarget(char, 5, 'fire');
    expect(result.actualDamage).toBe(5);
    expect(result.target.hp.current).toBe(7);
  });

  it('clamps negative damage to 0', () => {
    const char = makeCharacter();
    const result = inflictDamageOnTarget(char, -10);
    expect(result.actualDamage).toBe(0);
    expect(result.target.hp.current).toBe(12);
  });

  it('treats NaN damage as 0', () => {
    const char = makeCharacter();
    const result = inflictDamageOnTarget(char, NaN);
    expect(result.actualDamage).toBe(0);
    expect(result.target.hp.current).toBe(12);
  });

  it('matches damage type case-insensitively on enemy', () => {
    const enemy = makeEnemy({ damageVulnerabilities: ['Radiant'] });
    const result = inflictDamageOnTarget(enemy, 10, 'radiant');
    expect(result.actualDamage).toBe(20);
    expect(result.target.hp.current).toBe(10);
  });

  it('floors HAM reduction at 0', () => {
    const char = makeCharacter({ feats: ['heavy-armor-master'] });
    const result = inflictDamageOnTarget(char, 1, 'bludgeoning');
    expect(result.actualDamage).toBe(0);
    expect(result.target.hp.current).toBe(12);
  });
});

describe('healCharacter', () => {
  it('heals normally', () => {
    const char = makeCharacter({ hp: { current: 5, max: 12 } });
    const result = healCharacter(char, 3);
    expect(result.actualHealing).toBe(3);
    expect(result.character.hp.current).toBe(8);
  });

  it('caps healing at max HP', () => {
    const char = makeCharacter({ hp: { current: 10, max: 12 } });
    const result = healCharacter(char, 5);
    expect(result.actualHealing).toBe(2);
    expect(result.character.hp.current).toBe(12);
  });

  it('heals 0 amount', () => {
    const char = makeCharacter({ hp: { current: 5, max: 12 } });
    const result = healCharacter(char, 0);
    expect(result.actualHealing).toBe(0);
    expect(result.character.hp.current).toBe(5);
  });

  it('clamps negative heal to 0', () => {
    const char = makeCharacter({ hp: { current: 5, max: 12 } });
    const result = healCharacter(char, -10);
    expect(result.actualHealing).toBe(0);
    expect(result.character.hp.current).toBe(5);
  });

  it('treats NaN as 0', () => {
    const char = makeCharacter({ hp: { current: 5, max: 12 } });
    const result = healCharacter(char, NaN);
    expect(result.actualHealing).toBe(0);
    expect(result.character.hp.current).toBe(5);
  });

  it('does nothing at full HP', () => {
    const char = makeCharacter();
    const result = healCharacter(char, 10);
    expect(result.actualHealing).toBe(0);
    expect(result.character.hp.current).toBe(12);
  });

  it('heals from 0 HP', () => {
    const char = makeCharacter({ hp: { current: 0, max: 12 } });
    const result = healCharacter(char, 5);
    expect(result.actualHealing).toBe(5);
    expect(result.character.hp.current).toBe(5);
  });
});

describe('processInventoryAction', () => {
  it('adds item to party[0] when no targetId given', () => {
    const char = makeCharacter({ inventory: [] });
    const result = processInventoryAction([char], { item_name: 'Potion', action: 'add', quantity: 3 });
    expect(result.success).toBe(true);
    const item = result.data.inventory.find((i: InventoryItem) => i.name === 'Potion');
    expect(item.quantity).toBe(3);
  });

  it('adds item to character by id', () => {
    const char1 = makeCharacter({ id: 'hero-1', inventory: [] });
    const char2 = makeCharacter({ id: 'hero-2', name: 'Archer', inventory: [] });
    const result = processInventoryAction(
      [char1, char2],
      { item_name: 'Arrows', action: 'add', quantity: 20 },
      'hero-2',
    );
    expect(result.success).toBe(true);
    const item = (result.data.inventory as InventoryItem[]).find(i => i.name === 'Arrows');
    expect(item?.quantity).toBe(20);
    expect(result.data.character).toBe('Archer');
  });

  it('adds item to character by name (case-insensitive)', () => {
    const char1 = makeCharacter({ id: 'hero-1', inventory: [] });
    const char2 = makeCharacter({ id: 'hero-2', name: 'Archer', inventory: [] });
    const result = processInventoryAction(
      [char1, char2],
      { item_name: 'Arrows', action: 'add', quantity: 10 },
      'archer',
    );
    expect(result.success).toBe(true);
    const item = (result.data.inventory as InventoryItem[]).find(i => i.name === 'Arrows');
    expect(item?.quantity).toBe(10);
    expect(result.data.character).toBe('Archer');
  });

  it('rejects garbage names with add action', () => {
    const char = makeCharacter();
    const result = processInventoryAction([char], { item_name: 'shop', action: 'add' });
    expect(result.success).toBe(false);
    expect(result.message).toContain('not a valid item name');
  });

  it('rejects every garbage word', () => {
    const char = makeCharacter();
    const garbageWords = [
      'shop', 'man', 'woman', 'person', 'halfling', 'dwarf', 'elf', 'goblin',
      'me', 'myself', 'yourself', 'out', 'in', 'up', 'down', 'some', 'any',
      'of', 'the', 'a', 'an', 'it', 'them', 'this', 'that', 'those', 'these',
      'there', 'here', 'someone', 'anyone', 'everyone', 'nobody',
    ];
    for (const word of garbageWords) {
      const result = processInventoryAction([char], { item_name: word, action: 'add' });
      expect(result.success).toBe(false);
      expect(result.message).toBe(`"${word}" is not a valid item name and was rejected.`);
    }
  });

  it('routes remove action correctly', () => {
    const char = makeCharacter();
    const result = processInventoryAction([char], { item_name: 'Longsword', action: 'remove' });
    expect(result.success).toBe(true);
    const item = (result.data.inventory as InventoryItem[]).find(i => i.name === 'Longsword');
    expect(item).toBeUndefined();
  });

  it('routes remove for non-existent item', () => {
    const char = makeCharacter();
    const result = processInventoryAction([char], { item_name: 'Potion', action: 'remove' });
    expect(result.success).toBe(false);
    expect(result.message).toContain('Could not find');
  });

  it('routes edit action correctly', () => {
    const char = makeCharacter();
    const result = processInventoryAction(
      [char],
      { item_name: 'Longsword', action: 'edit', quantity: 5 },
    );
    expect(result.success).toBe(true);
    const item = (result.data.inventory as InventoryItem[]).find(i => i.name === 'Longsword');
    expect(item?.quantity).toBe(5);
  });

  it('routes edit for non-existent item', () => {
    const char = makeCharacter();
    const result = processInventoryAction(
      [char],
      { item_name: 'Potion of Healing', action: 'edit', quantity: 2 },
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain('Could not find');
  });

  it('returns target not found for empty party', () => {
    const result = processInventoryAction([], { item_name: 'Potion', action: 'add' });
    expect(result.success).toBe(false);
    expect(result.message).toBe('Target character not found.');
  });

  it('returns invalid action for unknown action', () => {
    const char = makeCharacter();
    const result = processInventoryAction(
      [char],
      { item_name: 'Potion', action: 'use' } as unknown as { item_name: string; action: 'add' | 'remove' | 'edit' },
    );
    expect(result.success).toBe(false);
    expect(result.message).toBe('Invalid action.');
  });

  it('defaults quantity to 1', () => {
    const char = makeCharacter({ inventory: [] });
    const result = processInventoryAction([char], { item_name: 'Potion', action: 'add' });
    expect(result.success).toBe(true);
    const item = result.data.inventory.find((i: InventoryItem) => i.name === 'Potion');
    expect(item.quantity).toBe(1);
  });
});

describe('GARBAGE_NAMES regex', () => {
  it('rejects every garbage word', () => {
    const garbageWords = [
      'shop', 'man', 'woman', 'person', 'halfling', 'dwarf', 'elf', 'goblin',
      'me', 'myself', 'yourself', 'out', 'in', 'up', 'down', 'some', 'any',
      'of', 'the', 'a', 'an', 'it', 'them', 'this', 'that', 'those', 'these',
      'there', 'here', 'someone', 'anyone', 'everyone', 'nobody',
    ];
    for (const word of garbageWords) {
      expect(GARBAGE_NAMES.test(word)).toBe(true);
    }
  });

  it('allows legitimate item names', () => {
    expect(GARBAGE_NAMES.test('Longsword')).toBe(false);
    expect(GARBAGE_NAMES.test('Potion of Healing')).toBe(false);
    expect(GARBAGE_NAMES.test('Dragon Scale')).toBe(false);
    expect(GARBAGE_NAMES.test('+1 Plate Mail')).toBe(false);
  });
});
