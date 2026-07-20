export interface ShopItem {
  name: string;
  category: 'Weapon' | 'Armor' | 'Gear' | 'Consumable';
  price: number;
  description: string;
}

export const SHOP_ITEMS: ShopItem[] = [
  { name: 'Greatsword', category: 'Weapon', price: 50, description: '2d6 slashing, heavy, two-handed sword' },
  { name: 'Longsword', category: 'Weapon', price: 15, description: '1d8 slashing, versatile (1d10)' },
  { name: 'Shortsword', category: 'Weapon', price: 10, description: '1d6 piercing, finesse, light sword' },
  { name: 'Dagger', category: 'Weapon', price: 2, description: '1d4 piercing, finesse, light, thrown' },
  { name: 'Shortbow', category: 'Weapon', price: 25, description: '1d6 piercing, range 80/320, two-handed. Includes quiver with 20 arrows' },
  { name: 'Quarterstaff', category: 'Weapon', price: 0.2, description: '1d6 bludgeoning, versatile (1d8)' },
  { name: 'Mace', category: 'Weapon', price: 5, description: '1d6 bludgeoning hammer-like weapon' },
  { name: 'Chain Mail', category: 'Armor', price: 75, description: 'Heavy Armor, AC 16, Str 13 req, stealth disadvantage' },
  { name: 'Chain Shirt', category: 'Armor', price: 50, description: 'Medium Armor, AC 13 + Dex mod (max 2)' },
  { name: 'Leather Armor', category: 'Armor', price: 10, description: 'Light Armor, AC 11 + Dex mod' },
  { name: 'Hide Armor', category: 'Armor', price: 10, description: 'Medium Armor, AC 12 + Dex mod (max 2)' },
  { name: 'Shield', category: 'Armor', price: 10, description: 'Shield, +2 AC' },
  { name: 'Potion of Healing', category: 'Consumable', price: 50, description: 'Heals 2d4 + 2 HP when consumed' },
  { name: "Thieves' Tools", category: 'Consumable', price: 25, description: 'Required for picking locks and disarming traps' },
  { name: 'Holy Symbol', category: 'Consumable', price: 5, description: 'Required for divine spellcasting focuses' },
  { name: 'Backpack', category: 'Gear', price: 2, description: 'Container, holds up to 30 lbs of gear' },
  { name: 'Bedroll', category: 'Gear', price: 1, description: 'Sleeping roll for resting in the wild' },
  { name: 'Rope, Hempen (50 ft)', category: 'Gear', price: 1, description: '50 feet of sturdy hemp rope' },
  { name: 'Rations (1 day)', category: 'Gear', price: 0.5, description: 'Dry food and nutrients for one day' },
  { name: 'Waterskin', category: 'Gear', price: 0.2, description: 'Holds 4 pints of clean drinking water' },
  { name: 'Torch', category: 'Gear', price: 0.01, description: 'Burns for 1 hour, providing 20ft bright light' },
];
