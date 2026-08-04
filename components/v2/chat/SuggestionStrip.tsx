import React from 'react';
import IconButton from '../primitives/IconButton';

interface SuggestionStripProps {
  suggestions: string[];
  onPick: (text: string) => void;
  onDismissAll?: () => void;
}

/** Horizontal snap-scroll row of suggested-action chips above the composer. */
const SuggestionStrip: React.FC<SuggestionStripProps> = ({ suggestions, onPick, onDismissAll }) => {
  if (suggestions.length === 0) return null;
  return (
    <div className="px-3 py-2 border-t border-white/[0.05] bg-obsidian-950/60">
      <div className="flex items-center gap-2 mb-1 px-1">
        <span className="font-display text-[9px] uppercase font-semibold tracking-[0.2em] text-ember-500/70">
          Suggested actions
        </span>
        <div className="flex-1 h-px bg-white/[0.04]" />
      </div>
      <div className="flex items-center gap-2 overflow-x-auto v2-noscroll snap-x pb-0.5">
        {suggestions.map((s, i) => (
          <button
            key={`${s}-${i}`}
            type="button"
            onClick={() => onPick(s)}
            className="snap-start shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-full bg-obsidian-800 border border-white/10 hover:border-ember-500/50 text-sm text-parchment-dim hover:text-parchment transition-colors cursor-pointer"
          >
            <i className="fas fa-bolt text-[10px] text-ember-500/80" aria-hidden="true" />
            <span className="whitespace-nowrap">{s}</span>
          </button>
        ))}
        {onDismissAll && (
          <IconButton
            icon="fa-xmark"
            size="sm"
            tip="Dismiss suggestions"
            onClick={(e) => {
              e.stopPropagation();
              onDismissAll();
            }}
            className="shrink-0"
          />
        )}
      </div>
    </div>
  );
};

export default SuggestionStrip;
