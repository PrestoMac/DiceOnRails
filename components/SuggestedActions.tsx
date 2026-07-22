import React, { useEffect, useRef } from 'react';

export interface SuggestedActionsProps {
  suggestions: string[];
  /** Immediately send the chosen suggestion as the user's action. */
  onPick: (text: string) => void;
  /** Called when the user explicitly dismisses the suggestions row. */
  onDismiss?: () => void;
  /** Auto-dismiss timeout in ms (default 30s). Pass 0 to disable. */
  autoDismissMs?: number;
}

/** Transient pill row of suggested actions shown after the GM narration. Clicking one sends it immediately. */
const SuggestedActions: React.FC<SuggestedActionsProps> = ({ suggestions, onPick, onDismiss, autoDismissMs = 0 }) => {
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!onDismiss || autoDismissMs <= 0) return;
    timerRef.current = window.setTimeout(() => {
      onDismiss();
    }, autoDismissMs);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [suggestions, onDismiss, autoDismissMs]);

  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="px-4 py-2">
      <div className="max-w-4xl mx-auto flex items-center gap-2">
        <span className="text-[9px] uppercase font-bold text-amber-600 tracking-widest shrink-0">Suggest:</span>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-thin scrollbar-thumb-stone-700" style={{ scrollbarWidth: 'thin' }}>
          {suggestions.map((s, i) => (
            <button
              key={`${s}-${i}`}
              onClick={() => onPick(s)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-all shrink-0 bg-amber-900/30 text-amber-200 border border-amber-800/40 hover:bg-amber-700/50 hover:border-amber-600/60 hover:text-white hover:scale-105 active:scale-95"
            >
              <i className="fas fa-bolt text-[8px] opacity-80"></i>
              {s}
              <i className="fas fa-arrow-right text-[8px] opacity-60 ml-0.5"></i>
            </button>
          ))}
        </div>
        {onDismiss && (
          <button onClick={onDismiss} className="text-stone-600 hover:text-stone-400 text-[9px] shrink-0 ml-1" aria-label="Dismiss suggestions">
            <i className="fas fa-times"></i>
          </button>
        )}
      </div>
    </div>
  );
};

export default SuggestedActions;
