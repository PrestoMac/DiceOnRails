import React from 'react';
import AdjBtn from '../../shared/AdjBtn';
import AddBtn from '../../shared/AddBtn';

const STAT_LABELS: Record<string, string> = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };
const STAT_LABELS_FULL: Record<string, string> = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };

/** Props for the StatRow component. */
interface StatRowProps {
  stat: string;
  currentValue: number;
  allocation: number;
  newValue: number;
  modifier: number;
  disableAdd: boolean;
  onAllocate: (stat: string, delta: number) => void;
  hover?: boolean;
  showMod?: boolean;
}

/** Single ability score row with label, +/- controls, current value, and optional modifier display. */
const StatRow: React.FC<StatRowProps> = ({
  stat, currentValue: cv, allocation: al, newValue: nv, modifier: nm,
  disableAdd, onAllocate, hover, showMod = true,
}) => (
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
    {showMod && (
      <div className="ml-auto text-right">
        <span className={`text-[10px] font-mono ${nm >= 0 ? 'text-green-500' : 'text-red-400'}`}>{nm >= 0 ? '+' : ''}{nm} MOD</span>
        {al > 0 && <span className="text-green-500 text-[10px] ml-1 block font-bold">+{al} (Was {cv})</span>}
      </div>
    )}
  </div>
);

export default StatRow;
