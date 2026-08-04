import React from 'react';
import BattleMapPanel from '../../BattleMapPanel';
import { cx } from '../primitives/cx';
import { Z } from '../primitives/layers';
import IconButton from '../primitives/IconButton';

interface MapOverlayProps {
  open: boolean;
  onClose: () => void;
  panelProps: React.ComponentProps<typeof BattleMapPanel>;
}

/** Right-side slide-over hosting the VTT battle map (wraps the legacy panel — never reimplements it). */
const MapOverlay: React.FC<MapOverlayProps> = ({ open, onClose, panelProps }) => {
  if (!open) return null;

  return (
    <aside
      className={cx(
        'fixed right-0 top-14 bottom-0 w-full max-w-[420px] flex flex-col bg-obsidian-900 border-l border-ember-500/25 shadow-[-18px_0_50px_rgba(0,0,0,0.55)] animate-slide-up',
        Z.menu,
      )}
      role="dialog"
      aria-label="Battle Map"
    >
      <header className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] shrink-0">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-ember-500/10 border border-ember-500/25 text-ember-400 text-xs">
          <i className="fas fa-map" aria-hidden="true" />
        </span>
        <h2 className="flex-1 font-display text-sm font-bold uppercase tracking-[0.16em] text-parchment truncate">
          Battle Map
        </h2>
        <IconButton icon="fa-xmark" tip="Close battle map" size="sm" onClick={onClose} />
      </header>
      <div className="flex-1 min-h-0 overflow-hidden v2-scrollbar">
        <BattleMapPanel {...panelProps} />
      </div>
    </aside>
  );
};

export default MapOverlay;
