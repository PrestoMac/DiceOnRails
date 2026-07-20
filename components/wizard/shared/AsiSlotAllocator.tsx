import React from 'react';
import { Character } from '../../../types';

const STAT_LABELS: Record<string, string> = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };

interface AsiSlotAllocatorProps {
  stats: Character['stats'];
  allocations: Partial<Record<keyof Character['stats'], number>>;
  totalAllocated: number;
  targetTotal: number;
  maxPerStat: number;
  maxValue: number;
  onAllocate: (stat: keyof Character['stats'], delta: number) => void;
}

const AsiSlotAllocator: React.FC<AsiSlotAllocatorProps> = ({
  stats, allocations, totalAllocated, targetTotal, maxPerStat, maxValue, onAllocate,
}) => (
  <div className="space-y-2">
    <div className="flex justify-between items-center bg-stone-950/60 p-2 rounded border border-stone-850">
      <span className="text-[10px] text-stone-400">Points to allocate:</span>
      <span className={`text-sm font-bold font-mono ${totalAllocated === targetTotal ? 'text-green-500' : 'text-amber-500'}`}>
        {totalAllocated}/{targetTotal}
      </span>
    </div>
    <div className="grid grid-cols-3 gap-1.5">
      {(Object.keys(stats) as (keyof Character['stats'])[]).map(stat => {
        const al = allocations[stat] || 0;
        const currentFinal = stats[stat];
        const proposed = currentFinal + al;
        const disableAdd = al >= maxPerStat || totalAllocated >= targetTotal || proposed > maxValue;
        const disableRem = al <= 0;
        return (
          <div key={stat} className="bg-stone-950/40 border border-stone-850 rounded p-2 text-center">
            <div className="text-[9px] uppercase text-stone-500 font-bold">{STAT_LABELS[stat]}</div>
            <div className="flex items-center justify-center gap-0.5 my-1">
              <button onClick={() => onAllocate(stat, -1)} disabled={disableRem} className="w-5 h-5 text-[9px] bg-stone-800 rounded disabled:opacity-30">-</button>
              <span className={`text-xs font-mono font-bold w-7 ${al > 0 ? 'text-green-400' : 'text-stone-300'}`}>{proposed}</span>
              <button onClick={() => onAllocate(stat, 1)} disabled={disableAdd} className="w-5 h-5 text-[9px] bg-stone-800 rounded disabled:opacity-30">+</button>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

export default AsiSlotAllocator;
