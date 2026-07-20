import React from 'react';
import { Character } from '../../types';
import { getMod } from '../../services/classEngine';

interface StatBlockProps {
  stats: Character['stats'];
  className?: string;
}

const STAT_LABELS: Record<string, string> = { str:'STR', dex:'DEX', con:'CON', int:'INT', wis:'WIS', cha:'CHA' };

const StatBlock: React.FC<StatBlockProps> = ({ stats, className = '' }) => (
  <div className={`grid grid-cols-3 gap-3 ${className}`}>
    {(Object.entries(stats) as [string, number][]).map(([stat, val]) => (
      <div key={stat} className="bg-stone-900/50 border border-stone-800 p-2 rounded text-center">
        <div className="text-[10px] uppercase text-stone-500 font-bold">{STAT_LABELS[stat] || stat}</div>
        <div className="text-xl font-bold text-stone-100">{val}</div>
        <div className="text-[10px] text-amber-600 font-medium">{getMod(val) >= 0 ? '+' : ''}{getMod(val)}</div>
      </div>
    ))}
  </div>
);

export default StatBlock;
