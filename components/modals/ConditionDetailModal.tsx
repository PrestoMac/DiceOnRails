import React from 'react';
import { CONDITION_INFO, EXHAUSTION_LEVELS } from '../../data/conditionInfo';

export interface ConditionDetailModalProps {
  /** Either {id,name} of a live condition, or null to close. */
  data: { id: string; name: string } | null;
  onClose: () => void;
}

/** Modal showing full condition effects and an exhaustion level table. */
const ConditionDetailModal: React.FC<ConditionDetailModalProps> = ({ data, onClose }) => {
  if (!data) return null;
  const info = CONDITION_INFO[data.id];

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
          <div className="flex items-center gap-2">
            <i className={`fas ${info?.icon ?? 'fa-circle'} text-amber-400 text-xl`}></i>
            <div>
              <h2 className="fantasy-font text-2xl text-amber-400 capitalize">{data.name}</h2>
              <p className="text-[10px] text-stone-500 uppercase tracking-widest mt-0.5">Condition</p>
            </div>
          </div>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-200 text-xl" aria-label="Close">
            <i className="fas fa-times"></i>
          </button>
        </div>
        {info ? (
          <div className="space-y-3 text-xs text-stone-300">
            <div className="bg-stone-950/50 rounded-lg p-3 border border-stone-800">
              <span className="text-stone-500 uppercase text-[9px] font-bold">Summary</span>
              <p className="text-stone-200 mt-0.5">{info.summary}</p>
            </div>
            {info.effects && info.effects.length > 0 && (
              <div className="bg-stone-950/50 rounded-lg p-3 border border-stone-800">
                <span className="text-stone-500 uppercase text-[9px] font-bold">Mechanical Effects</span>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  {info.effects.map((eff, i) => <li key={i} className="text-stone-300">{eff}</li>)}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-stone-400 italic">No detailed reference for "{data.name}".</p>
        )}

        <details className="mt-4 border-t border-stone-800 pt-3">
          <summary className="text-[10px] uppercase text-amber-700 cursor-pointer font-bold tracking-wider">Exhaustion reference</summary>
          <ul className="mt-2 space-y-0.5">
            {EXHAUSTION_LEVELS.map(l => (
              <li key={l.level} className="text-[10px] text-stone-400">
                <strong className="text-orange-400">L{l.level}:</strong> {l.description}
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
};

export default ConditionDetailModal;
