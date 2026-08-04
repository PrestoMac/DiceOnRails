import React from 'react';
import Button from '../primitives/Button';

interface EnemyTurnBarProps {
  onResolve: () => void;
}

/** Banner shown during an enemy turn: explains the input lock and lets the engine auto-resolve. */
const EnemyTurnBar: React.FC<EnemyTurnBarProps> = ({ onResolve }) => (
  <div className="flex items-center gap-3 rounded-lg border border-blood-600/40 bg-blood-950/25 px-3 py-2 mb-2 animate-fade-in">
    <i className="fas fa-shield-halved text-blood-400 animate-pulse" aria-hidden="true" />
    <div className="flex-1 min-w-0">
      <p className="font-display text-[11px] uppercase tracking-[0.15em] text-blood-300 font-semibold">
        Enemy Turn Active
      </p>
      <p className="text-[10px] text-parchment-mute mt-0.5">
        Wait for the GM response, or let the engine resolve the enemy&apos;s actions.
      </p>
    </div>
    <Button size="sm" icon="fa-bolt" className="animate-pulse" onClick={onResolve}>
      Resolve Turn
    </Button>
  </div>
);

export default EnemyTurnBar;
