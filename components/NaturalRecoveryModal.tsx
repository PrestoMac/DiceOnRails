import React, { useState, useMemo } from 'react';
import { Character } from '../types';
import { CLASSES_BY_ID } from '../utils/classes';

interface NaturalRecoveryModalProps {
  character: Character;
  isOpen: boolean;
  onClose: () => void;
  onRecover: (selections: Array<{ level: number; count: number }>) => void;
}

const MAX_SLOT_LEVEL = 5;

const NaturalRecoveryModal: React.FC<NaturalRecoveryModalProps> = ({ character, isOpen, onClose, onRecover }) => {
  const maxLevels = useMemo(() => Math.ceil(character.level / 2), [character.level]);

  const initialSlots = useMemo(() => {
    const slots: Record<number, { max: number; current: number }> = {};
    for (let i = 1; i <= MAX_SLOT_LEVEL; i++) {
      const res = character.resources?.find(r => r.id === `spell-slot-${i}`);
      if (res) slots[i] = { max: res.max, current: res.current };
    }
    return slots;
  }, [character.resources]);

  const [allocations, setAllocations] = useState<Record<number, number>>(() => {
    const init: Record<number, number> = {};
    for (const level of Object.keys(initialSlots)) {
      init[Number(level)] = 0;
    }
    return init;
  });

  const totalAllocated = useMemo(() =>
    Object.entries(allocations).reduce((sum, [level, count]) => sum + Number(level) * count, 0),
    [allocations]
  );

  const canRecover = totalAllocated > 0 && totalAllocated <= maxLevels;

  const handleChange = (level: number, delta: number) => {
    setAllocations(prev => {
      const slot = initialSlots[level];
      if (!slot) return prev;
      const current = prev[level] ?? 0;
      const next = Math.max(0, Math.min(current + delta, slot.max - slot.current));
      const newTotal = Object.entries({ ...prev, [level]: next })
        .reduce((sum, [l, c]) => sum + Number(l) * c, 0);
      if (newTotal > maxLevels) return prev;
      return { ...prev, [level]: next };
    });
  };

  const handleConfirm = () => {
    const selections = Object.entries(allocations)
      .filter(([, count]) => count > 0)
      .map(([level, count]) => ({ level: Number(level), count }));
    if (selections.length > 0) {
      onRecover(selections);
      onClose();
    }
  };

  const handleClose = () => {
    setAllocations(() => {
      const init: Record<number, number> = {};
      for (const level of Object.keys(initialSlots)) init[Number(level)] = 0;
      return init;
    });
    onClose();
  };

  if (!isOpen) return null;

  const hasSlots = Object.keys(initialSlots).length > 0;

  return (
    <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm" onClick={handleClose}>
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-stone-900 border border-stone-700 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-stone-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-amber-500 fantasy-font tracking-wide">Natural Recovery</h2>
            <p className="text-xs text-stone-400 mt-0.5">
              {character.name} &middot; Level {character.level} {CLASSES_BY_ID[character.class]?.name || character.class}
            </p>
          </div>
          <button onClick={handleClose} className="p-1.5 hover:bg-stone-800 rounded-lg text-stone-500 hover:text-stone-300 transition-colors">
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="px-5 py-3 bg-stone-950/50 border-b border-stone-800 flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-stone-400">Recovery Capacity</span>
          <span className={`font-mono text-sm font-bold ${totalAllocated > maxLevels ? 'text-red-500' : 'text-amber-400'}`}>
            {totalAllocated} / {maxLevels} levels
          </span>
        </div>

        <div className="px-5 py-4 space-y-2 max-h-64 overflow-y-auto">
          {!hasSlots && (
            <p className="text-sm text-stone-500 text-center py-4">No spell slots available.</p>
          )}
          {Object.entries(initialSlots).map(([levelStr, slot]) => {
            const level = Number(levelStr);
            const alloc = allocations[level] ?? 0;
            const canIncrement = slot.current + alloc < slot.max && totalAllocated + level <= maxLevels;
            const canDecrement = alloc > 0;
            return (
              <div key={level} className="flex items-center justify-between bg-stone-950 rounded-lg px-3 py-2 border border-stone-800">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-stone-200 w-16">Level {level}</span>
                  <span className="text-xs text-stone-500 font-mono">
                    {slot.current}/{slot.max}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleChange(level, -1)}
                    disabled={!canDecrement}
                    className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold transition-all ${
                      canDecrement
                        ? 'bg-stone-800 text-stone-300 hover:bg-stone-700 hover:text-white'
                        : 'bg-stone-900 text-stone-700 cursor-not-allowed'
                    }`}
                  >
                    <i className="fas fa-minus"></i>
                  </button>
                  <span className="font-mono text-sm font-bold text-amber-400 w-5 text-center">{alloc}</span>
                  <button
                    onClick={() => handleChange(level, 1)}
                    disabled={!canIncrement}
                    className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold transition-all ${
                      canIncrement
                        ? 'bg-stone-800 text-stone-300 hover:bg-stone-700 hover:text-white'
                        : 'bg-stone-900 text-stone-700 cursor-not-allowed'
                    }`}
                  >
                    <i className="fas fa-plus"></i>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3 border-t border-stone-800 flex gap-3 justify-end">
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-stone-800 text-stone-400 hover:bg-stone-700 hover:text-stone-300 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canRecover}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
              canRecover
                ? 'bg-amber-700 hover:bg-amber-600 text-white shadow-lg shadow-amber-900/20'
                : 'bg-stone-800 text-stone-600 cursor-not-allowed'
            }`}
          >
            Recover Slots
          </button>
        </div>
      </div>
    </div>
  );
};

export default NaturalRecoveryModal;
