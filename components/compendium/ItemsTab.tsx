import React, { useMemo, useState } from 'react';
import { SRD_ITEMS } from '../../utils/srdItems';
import { InventoryItem } from '../../types';
import ItemDetailModal from '../modals/ItemDetailModal';

type ItemFilter = 'all' | 'weapon' | 'armor' | 'shield' | 'potion' | 'gear' | 'other';

const FILTERS: Array<{ key: ItemFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'weapon', label: 'Weapons' },
  { key: 'armor', label: 'Armor' },
  { key: 'shield', label: 'Shields' },
  { key: 'potion', label: 'Potions' },
  { key: 'gear', label: 'Gear' },
];

const rarityColor = (rarity?: string) =>
  rarity === 'uncommon' ? 'text-blue-400' :
  rarity === 'rare' ? 'text-purple-400' :
  rarity === 'very rare' ? 'text-pink-400' :
  rarity === 'legendary' ? 'text-amber-500' :
  'text-stone-400';

/** Filterable SRD items browser. */
const ItemsTab: React.FC = () => {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ItemFilter>('all');
  const [viewing, setViewing] = useState<InventoryItem | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SRD_ITEMS.filter(item => {
      if (filter !== 'all' && item.type !== filter) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        (item.description ?? '').toLowerCase().includes(q)
      );
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [query, filter]);

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search items... (Longsword, Chain Mail, Potion of Healing)"
        className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2.5 text-sm text-stone-200 outline-none focus:border-amber-700"
        aria-label="Search items"
      />
      <div className="flex flex-wrap gap-1">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider transition-all ${
              filter === f.key
                ? 'bg-amber-900/40 text-amber-400 border border-amber-800/30'
                : 'bg-stone-900 text-stone-500 border border-stone-800 hover:text-stone-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <p className="text-[9px] text-stone-600 italic">{filtered.length} of {SRD_ITEMS.length} items</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[50vh] overflow-y-auto custom-scrollbar pr-1">
        {filtered.slice(0, 200).map((item, idx) => {
          const withQuantity: InventoryItem = { ...item, quantity: 1 };
          return (
            <button
              key={`${item.name}-${idx}`}
              onClick={() => setViewing(withQuantity)}
              className="text-left p-2 bg-stone-950/40 border border-stone-800 rounded hover:bg-stone-900/50 hover:border-amber-800/40 transition-all"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-bold text-stone-200 truncate">{item.name}</span>
                <span className={`text-[8px] uppercase font-bold shrink-0 ${rarityColor(item.rarity)}`}>{item.rarity || 'common'}</span>
              </div>
              <div className="flex items-center gap-2 text-[9px] text-stone-500">
                <span className="capitalize">{item.type || 'item'}</span>
                {item.cost && <span>• {item.cost}</span>}
                {item.stats?.damage && <span className="text-red-400 font-mono">• {item.stats.damage}</span>}
                {item.stats?.acFormula && <span className="text-blue-400 font-mono">• {item.stats.acFormula}</span>}
              </div>
            </button>
          );
        })}
      </div>
      <ItemDetailModal item={viewing} onClose={() => setViewing(null)} />
    </div>
  );
};

export default ItemsTab;
