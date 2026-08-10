import React, { useState } from 'react';
import Button from '../../primitives/Button';
import Chip from '../../primitives/Chip';
import Tabs from '../../primitives/Tabs';
import Tooltip from '../../primitives/Tooltip';
import { cx } from '../../primitives/cx';
import type { InventoryItem } from '../../../../types';
import { ShopItem } from '../../../creation/types';
import { lookupSRDItem } from '../../../../utils/srdItems';
import { SHOP_ITEMS } from '../../../creation/constants';
import { calculateAC, getSellBase } from '../forgeUtils';
import { getEffectiveAsiMap } from '../../../creation/asiUtils';
import type { ForgeStepProps } from '../forgeTypes';

export type GearStepV2Props = ForgeStepProps;

type ShopFilter = 'All' | 'Weapon' | 'Armor' | 'Consumable' | 'Gear';

/** Forge step 8: starting armory — port of the legacy GearStep (buy/sell/equip economy). */
const GearStepV2: React.FC<GearStepV2Props> = ({ wizard, updateWizard }) => {
  const { selectedRace, stats, inventory, goldPool } = wizard;

  const [shopFilter, setShopFilter] = useState<ShopFilter>('All');
  const [mobileTab, setMobileTab] = useState<'equipment' | 'shop'>('shop');

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

  const dexBonus = getEffectiveAsiMap(selectedRace, wizard.selectedSubraceId, wizard.halfElfChoice1, wizard.halfElfChoice2).dex || 0;
  const estimatedAC = calculateAC(inventory, stats.dex + dexBonus);
  const gp = Math.floor(goldPool);
  const sp = Math.round((goldPool % 1) * 10);

  const equipmentPanel = (
    <div className="flex flex-col bg-obsidian-900/70 rounded-xl border border-white/[0.06] p-3 min-h-0 h-full">
      <h3 className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-parchment-mute mb-2 border-b border-white/[0.06] pb-2">
        Your Equipment
      </h3>
      <ul className="flex-1 overflow-y-auto space-y-1.5 pr-1 v2-scrollbar min-h-[200px]">
        {inventory.map((item, idx) => {
          const perUnit = parseFloat((getSellBase(item.name) * 0.5).toFixed(2));
          const isEquippable = item.type === 'weapon' || item.type === 'armor' || item.type === 'shield';
          return (
            <li
              key={idx}
              className={cx(
                'flex justify-between items-center text-xs p-2 rounded-lg border transition-colors gap-2',
                item.equipped ? 'bg-verdant-500/[0.06] border-verdant-500/25' : 'bg-obsidian-850/60 border-white/[0.05]',
              )}
            >
              <div className="flex flex-col text-left min-w-0">
                <span className="font-bold text-parchment capitalize truncate">{item.name}</span>
                <span className="text-[9px] text-parchment-faint">Qty: {item.quantity}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {isEquippable && (
                  <button
                    type="button"
                    onClick={() => handleToggleEquip(idx)}
                    className={cx(
                      'px-2 py-1 rounded-md text-[9px] uppercase font-bold border transition-all cursor-pointer',
                      item.equipped
                        ? 'bg-verdant-500/20 text-verdant-300 border-verdant-500/40 hover:bg-verdant-500/30'
                        : 'bg-obsidian-800/60 text-parchment-mute border-white/[0.08] hover:text-parchment hover:border-white/20',
                    )}
                    title={item.equipped ? 'Unequip' : 'Equip'}
                  >
                    {item.equipped ? 'Equipped' : 'Equip'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleSellItem(idx)}
                  className="px-2 py-1 bg-blood-500/10 hover:bg-blood-500/20 text-blood-400 rounded-md text-[9px] uppercase font-bold border border-blood-500/25 transition-all cursor-pointer"
                  title={`Sell one for ${perUnit} GP`}
                >
                  Sell +{perUnit}g
                </button>
              </div>
            </li>
          );
        })}
        {inventory.length === 0 && (
          <li className="text-center text-[10px] text-parchment-faint py-10 italic">Your pack is empty.</li>
        )}
      </ul>
    </div>
  );

  const shopPanel = (
    <div className="flex flex-col bg-obsidian-900/70 rounded-xl border border-white/[0.06] p-3 min-h-0 h-full">
      <h3 className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-parchment-mute mb-2 border-b border-white/[0.06] pb-2">
        Available Gear
      </h3>
      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 v2-scrollbar min-h-[200px]">
        {SHOP_ITEMS.filter(i => shopFilter === 'All' || i.category === shopFilter).map(item => (
          <div
            key={item.name}
            className="flex items-center justify-between text-xs p-2 bg-obsidian-850/60 border border-white/[0.05] rounded-lg hover:border-white/[0.12] transition-colors gap-3"
          >
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="font-bold text-parchment">{item.name}</span>
                <Chip className="text-[8px] px-1.5 py-0 uppercase font-mono">{item.category}</Chip>
              </div>
              <p className="text-[9px] text-parchment-faint line-clamp-1 mt-0.5">{item.description}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-mono text-ember-300 font-bold text-[10px] whitespace-nowrap">{item.price} GP</span>
              <Button size="sm" variant="subtle" disabled={goldPool < item.price} onClick={() => handleBuyItem(item)}>
                Buy
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-400/90">
          <i className="fas fa-shield-halved text-[10px] mr-2" aria-hidden="true" />Starting Armory
        </p>
        <p className="text-[11px] text-parchment-faint mt-1">Spend your gold to customize your starting kit.</p>
      </div>

      <div className="flex justify-between items-center bg-obsidian-900/70 px-3 py-2.5 rounded-xl border border-white/[0.06] text-xs gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-parchment-mute">Pocket Gold:</span>
          <span className="text-ember-300 font-bold font-mono text-base">
            {gp} GP{sp > 0 ? ` ${sp} SP` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip
            content="Armor Class formula: Unarmored = 10 + DEX mod. Light armor = 11 + DEX. Medium armor = 13 + min(DEX, 2). Heavy armor = fixed value. Add shield (+2) if equipped."
            side="bottom"
          >
            <span className="text-parchment-mute flex items-center gap-1 cursor-default">
              Est. AC: <i className="fas fa-circle-info text-[9px] text-parchment-faint" aria-hidden="true" />
            </span>
          </Tooltip>
          <span className="text-frost-300 font-bold font-mono text-base">{estimatedAC}</span>
        </div>
        <div className="flex gap-1 flex-wrap">
          {(['All', 'Weapon', 'Armor', 'Consumable', 'Gear'] as const).map(cat => (
            <Chip key={cat} color="ember" active={shopFilter === cat} onClick={() => setShopFilter(cat)}>
              {cat === 'Consumable' ? 'Potions/Tools' : cat}
            </Chip>
          ))}
        </div>
      </div>

      {/* Desktop: side-by-side panels */}
      <div className="hidden md:grid grid-cols-[2fr_3fr] gap-3 h-[46dvh] min-h-[320px]">
        {equipmentPanel}
        {shopPanel}
      </div>

      {/* Mobile: tab-switched panels */}
      <div className="md:hidden space-y-2">
        <Tabs
          small
          items={[
            { key: 'shop', label: 'Shop', icon: 'fa-store' },
            { key: 'equipment', label: 'Equipment', icon: 'fa-suitcase', badge: inventory.length },
          ]}
          active={mobileTab}
          onChange={key => setMobileTab(key as 'equipment' | 'shop')}
        />
        <div className="h-[46dvh] min-h-[320px]">
          {mobileTab === 'equipment' ? equipmentPanel : shopPanel}
        </div>
      </div>
    </div>
  );
};

export default GearStepV2;
