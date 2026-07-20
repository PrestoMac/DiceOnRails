export * from '../data/srdItems';

import { SRD_ITEMS } from '../data/srdItems';
import { InventoryItem } from '../types';

/**
 * Looks up an SRD item by name with fuzzy matching and common aliases.
 * @param name - The item name or alias.
 * @returns The matching item (without quantity), or undefined if not found.
 */
export function lookupSRDItem(name: string): Omit<InventoryItem, 'quantity'> | undefined {
  const cleanName = name.trim().toLowerCase();

  let found = SRD_ITEMS.find(item => item.name.toLowerCase() === cleanName);
  if (found) return found;

  if (cleanName.includes('healing potion') || cleanName === 'red potion' || cleanName === 'potion') {
    return SRD_ITEMS.find(item => item.name === 'Potion of Healing');
  }
  if (cleanName.includes('greater healing')) {
    return SRD_ITEMS.find(item => item.name === 'Potion of Greater Healing');
  }
  if (cleanName.includes('superior healing')) {
    return SRD_ITEMS.find(item => item.name === 'Potion of Superior Healing');
  }
  if (cleanName.includes('stone') || cleanName === 'rock') {
    return SRD_ITEMS.find(item => item.name === 'Rock');
  }
  if (cleanName.includes('dagger')) {
    return SRD_ITEMS.find(item => item.name === 'Dagger');
  }
  if (cleanName.includes('shortsword')) {
    return SRD_ITEMS.find(item => item.name === 'Shortsword');
  }
  if (cleanName.includes('longsword') || cleanName === 'sword') {
    return SRD_ITEMS.find(item => item.name === 'Longsword');
  }
  if (cleanName.includes('greatsword')) {
    return SRD_ITEMS.find(item => item.name === 'Greatsword');
  }
  if (cleanName.includes('shield')) {
    return SRD_ITEMS.find(item => item.name === 'Shield');
  }
  if (cleanName.includes('leather')) {
    return SRD_ITEMS.find(item => item.name === 'Leather Armor');
  }
  if (cleanName.includes('chain mail') || cleanName.includes('chainmail')) {
    return SRD_ITEMS.find(item => item.name === 'Chain Mail');
  }
  if (cleanName.includes('thieves') && cleanName.includes('tool')) {
    return SRD_ITEMS.find(item => item.name === 'Thieves\' Tools');
  }
  if (cleanName.includes('rope') && (cleanName.includes('hempen') || cleanName.includes('50'))) {
    return SRD_ITEMS.find(item => item.name === 'Rope, Hempen (50 ft)');
  }
  if (cleanName.includes('light hammer')) {
    return SRD_ITEMS.find(item => item.name === 'Light Hammer');
  }

  found = SRD_ITEMS.find(item => cleanName.includes(item.name.toLowerCase()) || item.name.toLowerCase().includes(cleanName));
  if (found) return found;

  return undefined;
}
