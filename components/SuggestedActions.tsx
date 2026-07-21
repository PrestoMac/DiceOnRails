import React from 'react';

export interface SuggestedActionsProps {
  suggestions: string[];
  /** Pre-fill the input with the chosen suggestion. */
  onPick: (text: string) => void;
  /** Dismiss the panel until the next turn. */
  onDismiss?: () => void;
}

/** Collapsible panel of LLM-driven suggested actions shown above the InputArea. */
const SuggestedActions: React.FC<SuggestedActionsProps> = ({ suggestions, onPick, onDismiss }) => {
  if (!suggestions || suggestions.length === 0) return null;
  return (
    <div className="border-t border-stone-800 bg-gradient-to-b from-amber-950/10 to-transparent px-4 pt-2 pb-1">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-1">
          <i className="fas fa-lightbulb text-[10px] text-amber-500"></i>
          <span className="text-[10px] uppercase font-bold text-amber-500 tracking-widest">Suggested Actions</span>
          <div className="flex-1 h-px bg-stone-800"></div>
          {onDismiss && (
            <button onClick={onDismiss} className="text-stone-600 hover:text-stone-400 text-[10px]" aria-label="Dismiss suggestions">
              <i className="fas fa-times"></i>
            </button>
          )}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-stone-700 scrollbar-track-transparent" style={{ scrollbarWidth: 'thin' }}>
          {suggestions.map((s, i) => (
            <button
              key={`${s}-${i}`}
              onClick={() => onPick(s)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-all shrink-0 bg-amber-900/30 text-amber-200 border border-amber-800/40 hover:bg-amber-800/50 hover:border-amber-600/60 hover:text-amber-100"
              title="Click to fill input — press Enter to send"
            >
              <i className="fas fa-arrow-right text-[8px] opacity-70"></i>
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SuggestedActions;
