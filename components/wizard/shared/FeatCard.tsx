import React from 'react';
import { FeatDefinition } from '../../../utils/feats';

interface FeatCardProps {
  feat: FeatDefinition;
  isSelected: boolean;
  meetsPrereqs: boolean;
  validationReason?: string;
  onSelect: () => void;
  onViewDetail: () => void;
}

const FeatCard: React.FC<FeatCardProps> = ({
  feat, isSelected, meetsPrereqs, validationReason,
  onSelect, onViewDetail,
}) => (
  <div
    onClick={() => meetsPrereqs && onSelect()}
    className={`p-3 rounded-lg border transition-all text-left cursor-pointer flex items-start gap-3 ${
      isSelected
        ? 'border-amber-700 bg-amber-950/30'
        : meetsPrereqs
        ? 'border-stone-800 bg-stone-950/30 hover:bg-stone-900/40 hover:border-stone-700'
        : 'border-stone-900 bg-stone-950/10 opacity-50 cursor-not-allowed'
    }`}
  >
    <div className="w-9 h-9 rounded-lg bg-stone-900 border border-stone-800 flex items-center justify-center shrink-0">
      <i className={`fas ${feat.icon} text-amber-500 text-sm`}></i>
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-stone-200 truncate">{feat.name}</h4>
        <button
          onClick={(e) => { e.stopPropagation(); onViewDetail(); }}
          className="text-stone-500 hover:text-stone-200 text-xs"
          title="View details"
        >
          <i className="fas fa-info-circle"></i>
        </button>
      </div>
      <p className="text-[10px] text-amber-500 font-mono uppercase tracking-wider">{feat.shortName}</p>
      <p className="text-[10px] text-stone-400 mt-1 line-clamp-2">{feat.mechanicalEffect}</p>
      {!meetsPrereqs && validationReason && (
        <p className="text-[9px] text-red-400 mt-1 flex items-center gap-1">
          <i className="fas fa-lock text-[8px]"></i> {validationReason}
        </p>
      )}
    </div>
  </div>
);

export default FeatCard;
