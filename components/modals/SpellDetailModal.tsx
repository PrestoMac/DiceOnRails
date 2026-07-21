import React from 'react';
import { SpellDefinition } from '../../types';

export interface SpellDetailModalProps {
  spell: SpellDefinition | null;
  onClose: () => void;
}

/** Reusable modal showing full spell details: level/school, casting params, damage, description. */
const SpellDetailModal: React.FC<SpellDetailModalProps> = ({ spell, onClose }) => {
  if (!spell) return null;

  return (
    <div
      className="fixed inset-0 z-[200] bg-stone-950/80 flex items-center justify-center p-6 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-stone-900 border border-stone-700 rounded-2xl p-6 max-w-md w-full shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="fantasy-font text-2xl text-amber-400">{spell.name}</h2>
            <p className="text-[10px] text-stone-500 uppercase tracking-widest mt-0.5">
              {spell.level === 0 ? 'Cantrip' : `Level ${spell.level} Spell`}
              {' · '}{spell.school}
            </p>
          </div>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-200 text-xl" aria-label="Close">
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="space-y-3 text-xs text-stone-300">
          <div className="grid grid-cols-2 gap-2 bg-stone-950/50 rounded-lg p-3 border border-stone-800">
            <div>
              <span className="text-stone-500 uppercase text-[9px] font-bold">Casting Time</span>
              <p className="font-bold capitalize">{spell.castingTime}</p>
            </div>
            <div>
              <span className="text-stone-500 uppercase text-[9px] font-bold">Range</span>
              <p className="font-bold">{spell.range}</p>
            </div>
            <div>
              <span className="text-stone-500 uppercase text-[9px] font-bold">Duration</span>
              <p className="font-bold">{spell.duration}</p>
            </div>
            <div>
              <span className="text-stone-500 uppercase text-[9px] font-bold">Concentration</span>
              <p className="font-bold">{spell.requiresConcentration ? 'Yes' : 'No'}</p>
            </div>
          </div>
          {spell.damage && (
            <div className="bg-red-950/20 border border-red-900/30 rounded-lg p-2">
              <span className="text-[9px] uppercase font-bold text-red-400">Damage</span>
              <p className="font-mono font-bold text-red-300">
                {spell.damage.dice} {spell.damage.type}
              </p>
            </div>
          )}
          {spell.healing && (
            <div className="bg-emerald-950/20 border border-emerald-900/30 rounded-lg p-2">
              <span className="text-[9px] uppercase font-bold text-emerald-400">Healing</span>
              <p className="font-mono font-bold text-emerald-300">{spell.healing}</p>
            </div>
          )}
          <p className="text-stone-400 leading-relaxed">{spell.description}</p>
        </div>
      </div>
    </div>
  );
};

export default SpellDetailModal;
