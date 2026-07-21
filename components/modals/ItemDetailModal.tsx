import React from 'react';
import { InventoryItem } from '../../types';

const rarityStyle = (rarity?: string) =>
  rarity === 'uncommon' ? 'text-blue-400 border-l-blue-500' :
  rarity === 'rare' ? 'text-purple-400 border-l-purple-500' :
  rarity === 'very rare' ? 'text-pink-400 border-l-pink-500' :
  rarity === 'legendary' ? 'text-amber-500 border-l-amber-500' :
  'text-stone-400 border-l-stone-500';

export interface ItemDetailModalProps {
  item: InventoryItem | null;
  onClose: () => void;
}

/** Modal showing full item details: rarity, type, damage/AC/healing stats, weight, cost. */
const ItemDetailModal: React.FC<ItemDetailModalProps> = ({ item, onClose }) => {
  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-[200] bg-stone-950/80 flex items-center justify-center p-6 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className={`bg-stone-900 border border-stone-700 rounded-2xl p-6 max-w-md w-full shadow-2xl border-l-4 ${rarityStyle(item.rarity)}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="fantasy-font text-2xl text-stone-100">{item.name}</h2>
            <div className="flex items-center gap-1.5 text-[9px] uppercase font-bold tracking-wider mt-0.5">
              <span className={rarityStyle(item.rarity)}>{item.rarity || 'common'}</span>
              <span className="text-stone-600">•</span>
              <span className="text-stone-400">{item.type || 'item'}</span>
              {item.quantity > 1 && (
                <span className="text-stone-600">×{item.quantity}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-200 text-xl" aria-label="Close">
            <i className="fas fa-times"></i>
          </button>
        </div>
        <p className="text-xs text-stone-400 italic font-medium leading-relaxed mb-3">
          "{item.description || 'No description available.'}"
        </p>
        <div className="border-t border-stone-900 my-1"></div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] font-mono">
          {item.type === 'weapon' && item.stats && (
            <>
              <div className="text-stone-500">Damage:</div>
              <div className="text-stone-200 text-right">{item.stats.damage} {item.stats.damageType}</div>
              {item.stats.properties?.length ? (
                <>
                  <div className="text-stone-500">Properties:</div>
                  <div className="text-stone-200 text-right">{item.stats.properties.join(', ')}</div>
                </>
              ) : null}
            </>
          )}
          {item.type === 'armor' && item.stats && (
            <>
              <div className="text-stone-500">Armor Class:</div>
              <div className="text-stone-200 text-right">{item.stats.acFormula}</div>
              {item.stats.strengthReq ? (
                <>
                  <div className="text-stone-500">Strength Req:</div>
                  <div className="text-stone-200 text-right">{item.stats.strengthReq}</div>
                </>
              ) : null}
              {item.stats.stealthDisadv ? (
                <>
                  <div className="text-stone-500">Stealth:</div>
                  <div className="text-red-400 text-right">Disadvantage</div>
                </>
              ) : null}
            </>
          )}
          {item.type === 'shield' && item.stats && (
            <>
              <div className="text-stone-500">Armor Class:</div>
              <div className="text-stone-200 text-right">+{item.stats.acBonus}</div>
            </>
          )}
          {item.type === 'potion' && item.stats && (
            <>
              <div className="text-stone-500">Healing:</div>
              <div className="text-green-400 text-right">{item.stats.healing}</div>
            </>
          )}
          <div className="text-stone-500">Weight:</div>
          <div className="text-stone-300 text-right">{item.weight || 0} lbs</div>
          <div className="text-stone-500">Cost:</div>
          <div className="text-stone-300 text-right">{item.cost || '0 gp'}</div>
        </div>
      </div>
    </div>
  );
};

export default ItemDetailModal;
