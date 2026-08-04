import React from 'react';
import Button from '../primitives/Button';

interface BatchBarProps {
  pendingCount: number;
  onProcessBatch: () => void;
}

/** Pinned multiplayer bar above the composer: flushes all pending party messages as one collaborative turn. */
const BatchBar: React.FC<BatchBarProps> = ({ pendingCount, onProcessBatch }) => {
  if (pendingCount <= 0) return null;
  return (
    <div className="px-3 pt-2 pb-3 border-t border-white/[0.05] bg-obsidian-950/60" data-tour="process-batch">
      <div className="animate-ember-glow rounded-xl border border-ember-500/40 bg-gradient-to-r from-ember-900/40 via-obsidian-900/70 to-obsidian-900/70 px-4 py-3 flex items-center gap-3">
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-ember-500/10 border border-ember-500/30 shrink-0">
          <i className="fas fa-dice-d20 text-ember-400 text-lg" aria-hidden="true" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.15em] text-parchment">
            {pendingCount} {pendingCount === 1 ? 'action' : 'actions'} awaiting
          </p>
          <p className="text-[11px] text-parchment-mute mt-0.5">
            All queued party messages resolve together.
          </p>
        </div>
        <Button size="sm" icon="fa-dice-d20" onClick={onProcessBatch}>
          Take the Turn
        </Button>
      </div>
    </div>
  );
};

export default BatchBar;
