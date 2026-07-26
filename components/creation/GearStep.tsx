import React, { useState } from 'react';
import { InventoryItem } from '../../types';
import { StepProps, ShopItem } from './types';
import { lookupSRDItem } from '../../utils/srdItems';
import { getMod } from '../../services/classEngine';
import { SHOP_ITEMS } from './constants';
import { getEffectiveAsiMap } from './asiUtils';
import Tooltip from '../ui/Tooltip';

type ShopFilter = 'All' | 'Weapon' | 'Armor' | 'Consumable' | 'Gear';

const calculateAC = (inv: InventoryItem[], dexScore: number): number => {
  const dexMod = getMod(dexScore);
  const armor = inv.find(i => i.type === 'armor' && i.equipped);
  const shield = inv.find(i => i.type === 'shield' && i.equipped);
  const shieldBonus = shield ? (shield.stats?.acBonus || 2) : 0;
  if (!armor) return 10 + dexMod + shieldBonus;
  const formula = armor.stats?.acFormula;
  if (formula === 'light') return 11 + dexMod + shieldBonus;
  if (formula === 'medium') return (armor.stats?.acBonus || 13) + Math.min(dexMod, 2) + shieldBonus;
  if (formula === 'heavy') return (armor.stats?.acBonus || 16) + shieldBonus;
  return 10 + dexMod + shieldBonus;
};

/** Resolves a sell-base price (GP) for an inventory item: the shop price if the item is in the shop, otherwise the SRD catalog cost, falling back to 2 GP. */
function getSellBase(name: string): number {
  const shopItem = SHOP_ITEMS.find(i => i.name.toLowerCase() === name.toLowerCase());
  if (shopItem) return shopItem.price;
  const srd = lookupSRDItem(name);
  const match = (srd?.cost || '').match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 2;
}

/** Gear purchasing step. Displays starting gold, a shop with filtered items, and the character's current inventory with buy/sell/equip functionality. */
const GearStep: React.FC<StepProps & { onBackToSpells: () => void; onBackToFeats: () => void; onBackToSubclass: () => void; needsSpellsStep: boolean; needsSubclassStep: boolean }> = ({
  wizardState, updateWizard, onNext, onBackToSpells, onBackToFeats, onBackToSubclass, needsSpellsStep, needsSubclassStep,
}) => {
  const { selectedRace, stats, inventory, goldPool } = wizardState;
  const stepCls = "space-y-6 animate-in fade-in duration-500";

  const [shopFilter, setShopFilter] = useState<ShopFilter>('All');

  const handleBuyItem = (item: ShopItem) => {
    if (goldPool < item.price) return;
    const newGold = parseFloat((goldPool - item.price).toFixed(2));
    const ei = inventory.findIndex(i => i.name.toLowerCase() === item.name.toLowerCase());
    let newInventory: InventoryItem[];
    if (ei > -1) {
      newInventory = [...inventory];
      newInventory[ei] = { ...newInventory[ei], quantity: newInventory[ei].quantity + 1 };
    } else {
      const srd = lookupSRDItem(item.name);
      const resolvedType = (srd?.type || item.category.toLowerCase()) as InventoryItem['type'];
      // Auto-equip a freshly bought weapon/armor/shield when nothing currently
      // occupies that slot — mirrors how starting equipment is equipped.
      const slotEmpty = !inventory.some(i => i.type === resolvedType && i.equipped);
      const shouldEquip = slotEmpty && (resolvedType === 'weapon' || resolvedType === 'armor' || resolvedType === 'shield');
      newInventory = [...inventory, {
        name: item.name, quantity: 1,
        type: resolvedType,
        rarity: srd?.rarity || 'common',
        description: srd?.description || item.description || 'No description available.',
        weight: srd?.weight || 0,
        cost: srd?.cost || `${item.price} gp`,
        stats: srd?.stats || {},
        equipped: shouldEquip,
      }];
    }
    updateWizard({ goldPool: newGold, inventory: newInventory });
  };

  const handleSellItem = (idx: number) => {
    const item = inventory[idx];
    const perUnit = parseFloat((getSellBase(item.name) * 0.5).toFixed(2));
    const newGold = parseFloat((goldPool + perUnit).toFixed(2));
    const newInventory = [...inventory];
    if (item.quantity > 1) {
      newInventory[idx] = { ...item, quantity: item.quantity - 1 };
    } else {
      newInventory.splice(idx, 1);
    }
    updateWizard({ goldPool: newGold, inventory: newInventory });
  };

  const handleToggleEquip = (idx: number) => {
    const item = inventory[idx];
    const willEquip = !item.equipped;
    const next = inventory.map((it, i) => {
      if (i === idx) return { ...it, equipped: willEquip };
      // Enforce a single equipped armor and a single equipped shield.
      if (willEquip && (item.type === 'armor' || item.type === 'shield') && it.type === item.type) {
        return { ...it, equipped: false };
      }
      return it;
    });
    updateWizard({ inventory: next });
  };

  const dexBonus = getEffectiveAsiMap(selectedRace, wizardState.halfElfChoice1, wizardState.halfElfChoice2).dex || 0;
  const estimatedAC = calculateAC(inventory, stats.dex + dexBonus);

  return (
    <div className={`${stepCls} max-h-[75vh] overflow-hidden flex flex-col`}>
      <div className="shrink-0 text-center">
        <h2 className="fantasy-font text-3xl font-bold text-amber-500 uppercase tracking-widest">Starting Armory</h2>
        <p className="text-stone-400 text-xs mt-0.5">Spend your gold to customize your starting kit.</p>
      </div>
      <div className="flex justify-between items-center bg-stone-950/60 p-3 rounded-lg border border-stone-850 shrink-0 text-xs gap-4">
        <div className="flex items-center gap-2">
          <span className="text-stone-400">Pocket Gold:</span>
          <span className="text-amber-500 font-bold font-mono text-base">{goldPool} GP</span>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip content="Armor Class formula: Unarmored = 10 + DEX mod. Light armor = 11 + DEX. Medium armor = 13 + min(DEX, 2). Heavy armor = fixed value. Add shield (+2) if equipped." side="bottom">
            <span className="text-stone-400 flex items-center gap-1">
              Est. AC:
              <i className="fas fa-info-circle text-[9px] text-stone-600"></i>
            </span>
          </Tooltip>
          <span className="text-blue-400 font-bold font-mono text-base">{estimatedAC}</span>
        </div>
        <div className="flex gap-1 bg-stone-900 p-0.5 rounded border border-stone-800 text-[10px]">
          {(['All', 'Weapon', 'Armor', 'Consumable', 'Gear'] as const).map(cat => (
            <button key={cat} onClick={() => setShopFilter(cat)} className={`px-2 py-1 rounded transition-colors ${shopFilter === cat ? 'bg-amber-900/40 text-amber-400' : 'text-stone-500 hover:text-stone-300'}`}>
              {cat === 'Consumable' ? 'Potions/Tools' : cat}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 flex gap-4 min-h-0">
        <div className="w-2/5 flex flex-col bg-stone-950/40 rounded-xl border border-stone-850 p-3 min-h-0">
          <h3 className="text-[10px] uppercase font-bold text-stone-400 tracking-wider mb-2 border-b border-stone-850 pb-1">Your Equipment</h3>
          <ul className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar min-h-0">
            {inventory.map((item, idx) => {
              const perUnit = parseFloat((getSellBase(item.name) * 0.5).toFixed(2));
              const isEquippable = item.type === 'weapon' || item.type === 'armor' || item.type === 'shield';
              return (
                <li key={idx} className="flex justify-between items-center text-xs p-2 bg-stone-900/30 border border-stone-850 rounded hover:bg-stone-900/50 transition-colors">
                  <div className="flex flex-col text-left">
                    <span className="font-bold text-stone-200 capitalize flex items-center gap-1.5">
                      {item.name}
                      {item.equipped && <span className="text-[7px] uppercase font-bold text-green-400 bg-green-950/40 border border-green-900/40 px-1 rounded">Eq</span>}
                    </span>
                    <span className="text-[9px] text-stone-500">Qty: {item.quantity}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {isEquippable && (
                      <button
                        onClick={() => handleToggleEquip(idx)}
                        className={`px-1.5 py-1 rounded text-[9px] uppercase font-bold border transition-all ${item.equipped ? 'bg-green-950/40 text-green-400 border-green-900/40' : 'bg-stone-800/60 text-stone-400 border-stone-700 hover:text-stone-200'}`}
                        title={item.equipped ? 'Unequip' : 'Equip'}
                      >
                        {item.equipped ? 'Eq' : 'Eq'}
                      </button>
                    )}
                    <button
                      onClick={() => handleSellItem(idx)}
                      className="px-2 py-1 bg-red-950/30 hover:bg-red-900/40 text-red-400 rounded text-[9px] uppercase font-bold border border-red-900/20 transition-all"
                      title={`Sell one for ${perUnit} GP`}
                    >
                      Sell +{perUnit}g
                    </button>
                  </div>
                </li>
              );
            })}
            {inventory.length === 0 && <li className="text-center text-[10px] text-stone-600 py-10 italic">Your pack is empty.</li>}
          </ul>
        </div>
        <div className="w-3/5 flex flex-col bg-stone-950/40 rounded-xl border border-stone-850 p-3 min-h-0">
          <h3 className="text-[10px] uppercase font-bold text-stone-400 tracking-wider mb-2 border-b border-stone-850 pb-1">Available Gear</h3>
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar min-h-0">
            {SHOP_ITEMS.filter(i => shopFilter === 'All' || i.category === shopFilter).map(item => (
              <div key={item.name} className="flex items-center justify-between text-xs p-2 bg-stone-900/30 border border-stone-850 rounded hover:bg-stone-900/50 transition-colors gap-3">
                <div className="flex-1 text-left">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-bold text-stone-200">{item.name}</span>
                    <span className="text-[8px] uppercase font-mono text-stone-500 bg-stone-950 px-1 rounded border border-stone-900">{item.category}</span>
                  </div>
                  <p className="text-[9px] text-stone-500 line-clamp-1">{item.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-amber-500 font-bold text-[10px] whitespace-nowrap">{item.price} GP</span>
                  <button
                    onClick={() => handleBuyItem(item)}
                    disabled={goldPool < item.price}
                    className="px-2.5 py-1 bg-amber-700/80 hover:bg-amber-600 disabled:opacity-20 disabled:hover:bg-amber-700/80 text-white rounded text-[9px] uppercase font-bold transition-all border border-amber-600/20"
                  >
                    Buy
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="shrink-0 pt-2 flex gap-3">
        <button
          onClick={() => needsSpellsStep ? onBackToSpells() : needsSubclassStep ? onBackToSubclass() : onBackToFeats()}
          className="w-1/3 py-3 bg-stone-800 hover:bg-stone-700 rounded-lg font-bold text-stone-400 transition-colors uppercase tracking-wider text-xs border border-stone-700"
        >
          Back
        </button>
        <button
          onClick={() => onNext()}
          className="w-2/3 py-3 bg-amber-700 hover:bg-amber-600 rounded-lg font-bold text-white transition-all uppercase tracking-wider text-xs shadow-lg shadow-amber-950/40"
        >
          Review Hero
        </button>
      </div>
    </div>
  );
};

export default GearStep;
