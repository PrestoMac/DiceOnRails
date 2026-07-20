import React from 'react';
import AdjBtn from '../../shared/AdjBtn';
import AddBtn from '../../shared/AddBtn';

/** Props for the SkillRow component. */
interface SkillRowProps {
  label: string;
  statKey: string;
  rank: number;
  totalRank: number;
  totalMod: number;
  remainingPoints: number;
  onAllocate: (delta: number) => void;
  recommended?: boolean;
  description?: string;
}

/** Single skill row with label, stat key badge, rank adjusters (+/-), total modifier display, and optional recommendation badge. */
const SkillRow: React.FC<SkillRowProps> = ({
  label, statKey, rank, totalRank, totalMod, remainingPoints,
  onAllocate, recommended, description,
}) => (
  <div className="flex flex-col bg-stone-950/30 border border-stone-850 hover:border-stone-800 rounded-lg p-3 transition-all hover:bg-stone-950/50">
    <div className="flex items-center gap-3">
      <div className="flex-1 text-left">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-stone-200">{label}</span>
          {recommended && (
            <span className="text-[8px] uppercase font-bold text-amber-600 bg-amber-950/20 border border-amber-900/30 px-1 rounded">Recommended</span>
          )}
          <span className="text-[9px] uppercase font-mono px-1 rounded bg-stone-900 border border-stone-800 text-stone-400">{statKey}</span>
        </div>
        {description && <span className="text-[10px] text-stone-500 line-clamp-1">{description}</span>}
      </div>
      <div className="flex items-center gap-2">
        <AdjBtn onClick={() => onAllocate(-1)} disabled={rank <= 0} />
        <div className="w-8 text-center">
          <span className={`text-sm font-bold font-mono ${rank > 0 ? 'text-green-400' : 'text-stone-300'}`}>{totalRank}</span>
        </div>
        <AddBtn onClick={() => onAllocate(1)} disabled={remainingPoints <= 0 || totalRank >= 20} />
      </div>
      <div className="w-16 text-right">
        <span className={`text-xs font-mono font-bold ${totalMod >= 0 ? 'text-green-500' : 'text-red-400'}`}>{totalMod >= 0 ? '+' : ''}{totalMod} MOD</span>
        <span className="text-[9px] text-stone-500 block">(Rank {totalRank})</span>
      </div>
    </div>
  </div>
);

export default SkillRow;
