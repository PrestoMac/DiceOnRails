import { Character, InventoryItem, Currency, Enemy, MCPResponse } from '../types';
import { canEquipArmor, getArmorTypeFromItem } from './classEngine';
import { supabase } from './supabaseClient';
import { getHeavyArmorMasterReduction } from './featsService';
import { applyEffects, DamageTakenContext } from './effectDispatcher';

/** Normalizes a total copper-piece amount into GP/SP/CP currency values, ensuring non-negative. */
export function normalizeCurrency(totalCp: number): Currency {
  const safeTotal = Math.max(0, totalCp);
  const gp = Math.floor(safeTotal / 100);
  const remainderAfterGp = safeTotal % 100;
  const sp = Math.floor(remainderAfterGp / 10);
  const cp = remainderAfterGp % 10;
  return { gp, sp, cp };
}

/** Adjusts a character's currency by adding or subtracting GP/SP/CP, returning the new balance or an insufficent-funds error. */
export function adjustCharacterCurrency(
  character: Character, gp: number, sp: number, cp: number
): { character: Character; totalCp: number; message: string } {
  const totalAdjustment = (Number(gp) || 0) * 100 + (Number(sp) || 0) * 10 + (Number(cp) || 0);
  const currentTotalCp = (character.currency.gp * 100) + (character.currency.sp * 10) + character.currency.cp;
  const newTotalCp = currentTotalCp + totalAdjustment;

  if (newTotalCp < 0) {
    return { character, totalCp: currentTotalCp, message: `Insufficient funds. ${character.name} has only ${currentTotalCp} CP equivalent.` };
  }

  const updatedCharacter = { ...character, currency: normalizeCurrency(newTotalCp) };
  return {
    character: updatedCharacter,
    totalCp: newTotalCp,
    message: `Currency adjusted for ${character.name}. New balance: ${updatedCharacter.currency.gp} GP, ${updatedCharacter.currency.sp} SP, ${updatedCharacter.currency.cp} CP.`
  };
}

/** Applies equip/unequip effects to a character's inventory, auto-unequipping other armor/shield items on equip. */
export function applyEquipmentEffects(
  character: Character, item: InventoryItem, action: 'equip' | 'unequip'
): Character {
  if (action === 'equip' && (item.type === 'armor' || item.type === 'shield')) {
    if (!canEquipArmor(character, getArmorTypeFromItem(item))) return character;
  }

  const updatedInventory = character.inventory.map(i => {
    if (i.name === item.name) return { ...i, equipped: action === 'equip' };
    if (action === 'equip' && (item.type === 'armor' || item.type === 'shield') &&
        (i.type === 'armor' || i.type === 'shield') && i.equipped) {
      return { ...i, equipped: false };
    }
    return i;
  });

  return { ...character, inventory: updatedInventory };
}

/** Cleans an item name by splitting on conjunctions and truncating to 60 characters. */
function cleanItemName(itemName: string): string {
  return itemName?.split(/\s+(?:and|or|then|while|to|into)\s+/)[0]?.trim()?.slice(0, 60) || 'unknown item';
}

/** Adds an item (or increases its quantity) in a character's inventory, merging with existing stacks of the same name. */
export function addInventoryItem(
  character: Character, itemName: string, quantity: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  itemMeta?: { type?: string; rarity?: string; description?: string; stats?: Record<string, any>; equipped?: boolean }
): { character: Character; message: string } {
  const cleanName = cleanItemName(itemName);
  const existingIdx = character.inventory.findIndex(i => i.name.toLowerCase() === cleanName.toLowerCase());

  if (existingIdx > -1) {
    const updatedInventory = [...character.inventory];
    updatedInventory[existingIdx] = {
      ...updatedInventory[existingIdx],
      quantity: updatedInventory[existingIdx].quantity + quantity,
      ...(itemMeta?.type && { type: itemMeta.type as unknown as InventoryItem['type'] }),
      ...(itemMeta?.rarity && { rarity: itemMeta.rarity as unknown as InventoryItem['rarity'] }),
      ...(itemMeta?.description && { description: itemMeta.description }),
      ...(itemMeta?.stats && { stats: itemMeta.stats }),
      ...(itemMeta?.equipped !== undefined && { equipped: itemMeta.equipped })
    };
    return {
      character: { ...character, inventory: updatedInventory },
      message: `Increased ${updatedInventory[existingIdx].name} quantity by ${quantity} for ${character.name}.`
    };
  }

  const newItem: InventoryItem = {
    name: cleanName, quantity, type: (itemMeta?.type as unknown as InventoryItem['type']) || 'other',
    rarity: (itemMeta?.rarity as unknown as InventoryItem['rarity']) || 'common',
    description: itemMeta?.description || `A custom ${cleanName} found in the world.`,
    weight: 0, cost: '0 gp', stats: itemMeta?.stats || {}, equipped: itemMeta?.equipped || false
  };

  return {
    character: { ...character, inventory: [...character.inventory, newItem] },
    message: `Added ${quantity}x ${cleanName} to ${character.name}'s inventory.`
  };
}

/** Removes a specified quantity of an item from a character's inventory, deleting the entire stack if the requested quantity is greater than or equal to the stack size. */
export function removeInventoryItem(
  character: Character, itemName: string, quantity: number
): { character: Character; message: string; removedItem?: InventoryItem } {
  const cleanName = cleanItemName(itemName);
  const existingIdx = character.inventory.findIndex(i => i.name.toLowerCase() === cleanName.toLowerCase());

  if (existingIdx === -1) {
    return { character, message: `Could not find ${cleanName} in ${character.name}'s inventory.` };
  }

  const item = character.inventory[existingIdx];
  const updatedInventory = [...character.inventory];

  if (item.quantity <= quantity) {
    updatedInventory.splice(existingIdx, 1);
    return { character: { ...character, inventory: updatedInventory }, message: `Removed all ${item.name} from ${character.name}'s inventory.`, removedItem: item };
  }

  updatedInventory[existingIdx] = { ...item, quantity: item.quantity - quantity };
  return { character: { ...character, inventory: updatedInventory }, message: `Removed ${quantity}x ${cleanName} from ${character.name}'s inventory.` };
}

/** Edits the properties of an inventory item by name, removing the stack if quantity becomes zero or negative. */
export function editInventoryItem(
  character: Character, itemName: string, updates: Partial<InventoryItem>
): { character: Character; message: string } {
  const existingIdx = character.inventory.findIndex(i => i.name.toLowerCase() === itemName.toLowerCase());
  if (existingIdx === -1) return { character, message: `Could not find ${itemName} to edit.` };

  const updatedInventory = [...character.inventory];
  const updatedItem = { ...updatedInventory[existingIdx], ...updates };

  if (updatedItem.quantity <= 0) {
    updatedInventory.splice(existingIdx, 1);
    return { character: { ...character, inventory: updatedInventory }, message: `Removed all ${updatedItem.name} from ${character.name}'s inventory.` };
  }

  updatedInventory[existingIdx] = updatedItem;
  return { character: { ...character, inventory: updatedInventory }, message: `Modified ${itemName} in ${character.name}'s inventory.` };
}

/** Inflicts damage on a target (character or enemy), accounting for immunities, resistances, vulnerabilities, temp HP, and Heavy Armor Master. */
export function inflictDamageOnTarget(
  target: Character | Enemy, amount: number, damageType?: string
): { target: Character | Enemy; actualDamage: number; message: string } {
  let dmg = Math.max(0, Number(amount) || 0);

  if (damageType && 'damageImmunities' in target) {
    const enemy = target as Enemy;
    if (enemy.damageImmunities?.some(d => d.toLowerCase().includes(damageType.toLowerCase()))) {
      dmg = 0;
    } else if (enemy.damageResistances?.some(d => d.toLowerCase().includes(damageType.toLowerCase()))) {
      dmg = Math.floor(dmg / 2);
    } else if (enemy.damageVulnerabilities?.some(d => d.toLowerCase().includes(damageType.toLowerCase()))) {
      dmg *= 2;
    }
  }

  if ('hp' in target && 'stats' in target) {
    const char = target as Character;
    const ctx: DamageTakenContext = {
      _hook: 'onDamageTaken',
      amount: dmg,
      damageType: damageType || '',
      target: char,
    };
    const afterEffects = applyEffects(char, 'onDamageTaken', ctx);
    dmg = Math.max(0, afterEffects.amount - getHeavyArmorMasterReduction(char, damageType));
  }

  const currentHp = target.hp.current;
  let remainingDmg = dmg;

  if ('tempHp' in target && target.tempHp && target.tempHp > 0) {
    const absorbed = Math.min(target.tempHp, remainingDmg);
    target.tempHp -= absorbed;
    remainingDmg -= absorbed;
  }

  const newHp = Math.max(0, currentHp - remainingDmg);
  const updatedTarget = { ...target, hp: { ...target.hp, current: newHp } };
  if ('isDead' in target) (updatedTarget as Enemy).isDead = newHp === 0;

  const message = newHp === 0 && currentHp > 0
    ? `${target.name} took ${dmg} damage${damageType ? ' (' + damageType + ')' : ''}. ${target.name} is defeated!`
    : `${target.name} took ${dmg} damage${damageType ? ' (' + damageType + ')' : ''}. Current HP: ${newHp}/${target.hp.max}`;

  return { target: updatedTarget, actualDamage: dmg, message };
}

/** Heals a character by a given amount, capping at their maximum HP. */
export function healCharacter(
  character: Character, amount: number
): { character: Character; actualHealing: number; message: string } {
  const safeAmount = Math.max(0, Number(amount) || 0);
  const maxHeal = character.hp.max - character.hp.current;
  const actualHealing = Math.min(safeAmount, maxHeal);
  const newCurrentHp = character.hp.current + actualHealing;

  return {
    character: { ...character, hp: { ...character.hp, current: newCurrentHp } },
    actualHealing,
    message: `${character.name} healed ${actualHealing} HP. Current HP: ${newCurrentHp}/${character.hp.max}.`
  };
}

/** Looks up an SRD item by name from the Supabase srd_items table. */
export async function lookupItemByName(
  cleanName: string
): Promise<{ data: unknown; error: unknown }> {
  return supabase.from('srd_items').select('*').ilike('name', cleanName).maybeSingle();
}

const GARBAGE_NAMES = /^(?:shop|man|woman|person|halfling|dwarf|elf|goblin|me|myself|yourself|out|in|up|down|some|any|of|the|a|an|it|them|this|that|those|these|there|here|someone|anyone|everyone|nobody)$/i;

/** Processes a full inventory action (add/remove/edit) against the party, returning an MCP response with success status and message. */
export function processInventoryAction(
  party: Character[],
  args: {
    item_name: string;
    action: 'add' | 'remove' | 'edit';
    quantity?: number;
    new_name?: string;
    type?: string;
    rarity?: string;
    description?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stats?: Record<string, any>;
    equipped?: boolean;
  },
  targetId?: string
): MCPResponse {
  const target = party.find(c => c.id === targetId || c.name.toLowerCase() === targetId?.toLowerCase()) || party[0];
  if (!target) return { success: false, data: {}, message: "Target character not found." };

  const cleanName = cleanItemName(args.item_name);

  if (args.action === 'add' && GARBAGE_NAMES.test(cleanName)) {
    return { success: false, data: {}, message: `"${cleanName}" is not a valid item name and was rejected.` };
  }

  const quantity = args.quantity || 1;

  if (args.action === 'add') {
    const result = addInventoryItem(target, cleanName, quantity, {
      type: args.type, rarity: args.rarity, description: args.description, stats: args.stats, equipped: args.equipped
    });
    return { success: true, data: { inventory: result.character.inventory, character: result.character.name }, message: result.message };
  }

  if (args.action === 'remove') {
    const result = removeInventoryItem(target, cleanName, quantity);
    return { success: !result.message.includes('Could not find'), data: { inventory: result.character.inventory, character: result.character.name }, message: result.message };
  }

  if (args.action === 'edit') {
    const updates: Partial<InventoryItem> = {};
    if (args.new_name) updates.name = args.new_name;
    if (quantity !== undefined) updates.quantity = Math.max(0, quantity);
    if (args.type) updates.type = args.type as unknown as InventoryItem['type'];
    if (args.rarity) updates.rarity = args.rarity as unknown as InventoryItem['rarity'];
    if (args.description) updates.description = args.description;
    if (args.stats) updates.stats = args.stats;
    if (args.equipped !== undefined) updates.equipped = args.equipped;

    const result = editInventoryItem(target, cleanName, updates);
    return { success: !result.message.includes('Could not find'), data: { inventory: result.character.inventory, character: result.character.name }, message: result.message };
  }

  return { success: false, data: {}, message: "Invalid action." };
}
