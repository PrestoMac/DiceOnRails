import React from 'react';
import { Character } from '../../types';
import { getMod } from '../../services/classEngine';
import AdjBtn from '../shared/AdjBtn';
import AddBtn from '../shared/AddBtn';

const STAT_LABELS: Record<string, string> = { str:'STR', dex:'DEX', con:'CON', int:'INT', wis:'WIS', cha:'CHA' };
const STAT_LABELS_FULL: Record<string, string> = { str:'Strength', dex:'Dexterity', con:'Constitution', int:'Intelligence', wis:'Wisdom', cha:'Charisma' };

interface StatsAllocationPanelProps {
  stats: Character['stats'];
  selectedAllocations: Partial<Record<keyof Character['stats'], number>>;
  remainingPoints: number;
  onAllocate: (stat: keyof Character['stats'], delta: number) => void;
  maxValue?: number;
}

const StatRow: React.FC<{
  stat: string;
  currentValue: number;
  allocation: number;
  newValue: number;
  modifier: number;
  disableAdd: boolean;
  onAllocate: (stat: any, delta: number) => void;
  hover?: boolean;
}> = ({ stat, currentValue: cv, allocation: al, newValue: nv, modifier: nm, disableAdd, onAllocate, hover }) => (
  <div className={`flex items-center gap-3 bg-stone-950/40 border border-stone-850 rounded-lg p-3${hover ? ' hover:bg-stone-950/60 transition-colors' : ''}`}>
    <div className="w-20 text-left">
      <div className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">{STAT_LABELS[stat]}</div>
      <div className="text-[10px] text-stone-500">{STAT_LABELS_FULL[stat]}</div>
    </div>
    <div className="flex items-center gap-2">
      <AdjBtn onClick={() => onAllocate(stat, -1)} disabled={al <= 0} />
      <div className="w-10 text-center">
        <span className={`text-base font-bold font-mono ${al > 0 ? 'text-green-400' : 'text-stone-100'}`}>{nv}</span>
      </div>
      <AddBtn onClick={() => onAllocate(stat, 1)} disabled={disableAdd} />
    </div>
    <div className="ml-auto text-right">
      <span className={`text-[10px] font-mono ${nm >= 0 ? 'text-green-500' : 'text-red-400'}`}>{nm >= 0 ? '+' : ''}{nm} MOD</span>
      {al > 0 && <span className="text-green-500 text-[10px] ml-1 block font-bold">+{al} (Was {cv})</span>}
    </div>
  </div>
);

const StatsAllocationPanel: React.FC<StatsAllocationPanelProps> = ({ stats, selectedAllocations, remainingPoints, onAllocate, maxValue = 20 }) => (
  <div className="space-y-3 py-2 animate-in fade-in duration-350">
    <div className="flex justify-between items-center bg-stone-950/60 p-3 rounded-lg border border-stone-850 mb-2">
      <span className="text-xs text-stone-400">Available Attribute Points:</span>
      <span className={`text-lg font-bold font-mono ${remainingPoints > 0 ? 'text-amber-500 animate-pulse' : 'text-green-500'}`}>{remainingPoints}</span>
    </div>
    {(Object.keys(stats) as (keyof Character['stats'])[]).map(stat => {
      const cv = stats[stat], al = selectedAllocations[stat] || 0, nv = cv + al, nm = getMod(nv);
      return (
        <StatRow key={stat} stat={stat} currentValue={cv} allocation={al} newValue={nv} modifier={nm}
          disableAdd={remainingPoints <= 0 || nv >= maxValue} onAllocate={onAllocate} hover />
      );
    })}
  </div>
);

export default StatsAllocationPanel;
