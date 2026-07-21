import React from 'react';
import { CONDITION_INFO } from '../../data/conditionInfo';
import { EXHAUSTION_LEVELS } from '../../data/conditionInfo';

/** Browsable grid of conditions + exhaustion levels. */
const ConditionsTab: React.FC = () => {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[10px] uppercase font-bold text-amber-600 tracking-widest mb-2 border-b border-stone-850 pb-1">Standard Conditions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Object.entries(CONDITION_INFO).map(([id, info]) => (
            <div key={id} className={`border rounded-lg p-2.5 ${info.tone === 'buff' ? 'bg-emerald-950/10 border-emerald-900/40' : info.tone === 'debuff' ? 'bg-red-950/10 border-red-900/40' : 'bg-stone-950/40 border-stone-800'}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <i className={`fas ${info.icon} ${info.tone === 'buff' ? 'text-emerald-400' : info.tone === 'debuff' ? 'text-red-400' : 'text-amber-400'} text-[10px]`}></i>
                <h4 className="text-xs font-bold text-stone-200 capitalize">{id}</h4>
                {info.tone && <span className="text-[8px] uppercase text-stone-600 ml-auto">{info.tone}</span>}
              </div>
              <p className="text-[10px] text-stone-400 leading-relaxed mb-1">{info.summary}</p>
              {info.effects && info.effects.length > 0 && (
                <ul className="text-[9px] text-stone-500 space-y-0.5 list-disc list-inside">
                  {info.effects.map((eff, i) => <li key={i}>{eff}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-[10px] uppercase font-bold text-orange-600 tracking-widest mb-2 border-b border-stone-850 pb-1">Exhaustion Levels (cumulative)</h3>
        <div className="space-y-1">
          {EXHAUSTION_LEVELS.map(l => (
            <div key={l.level} className="bg-orange-950/10 border border-orange-900/30 rounded p-2 flex items-center gap-3">
              <span className="text-xs font-bold font-mono text-orange-400 shrink-0 w-8">L{l.level}</span>
              <div>
                <div className="text-xs font-bold text-stone-300">{l.label}</div>
                <div className="text-[10px] text-stone-500">{l.description}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[9px] text-stone-600 mt-2 italic">A Long Rest reduces exhaustion by 1 level.</p>
      </div>
    </div>
  );
};

export default ConditionsTab;
