import React from 'react';
import {
  CURRENCY_INFO,
  REST_INFO,
  DEATH_SAVE_INFO,
  EXHAUSTION_INFO,
  COMBAT_RULES,
  DC_TABLE,
  CR_TO_XP,
  DC_TO_XP,
} from '../../data/referenceConstants';

/** Rules reference tab — mirrors what the LLM knows (constants.ts system prompts). */
const RulesTab: React.FC = () => {
  return (
    <div className="space-y-4 text-xs">
      <section>
        <h3 className="text-[10px] uppercase font-bold text-amber-600 tracking-widest mb-2 border-b border-stone-850 pb-1">Currency</h3>
        <div className="bg-stone-950/40 border border-stone-800 rounded-lg p-3 text-stone-300">
          <p className="font-mono text-sm">{CURRENCY_INFO.conversion}</p>
          <div className="flex gap-3 mt-2 text-[10px]">
            <span className="text-amber-400">● Gold (GP)</span>
            <span className="text-stone-400">● Silver (SP)</span>
            <span className="text-orange-700">● Copper (CP)</span>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-[10px] uppercase font-bold text-amber-600 tracking-widest mb-2 border-b border-stone-850 pb-1">Difficulty Classes</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {DC_TABLE.map(d => (
            <div key={d.dc} className="bg-stone-950/40 border border-stone-800 rounded p-2 text-center">
              <div className="text-sm font-bold text-amber-400 font-mono">DC {d.dc}</div>
              <div className="text-[9px] text-stone-500 uppercase">{d.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-[10px] uppercase font-bold text-amber-600 tracking-widest mb-2 border-b border-stone-850 pb-1">Skill Check XP Rewards</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {DC_TO_XP.map(x => (
            <div key={x.dc} className="bg-stone-950/40 border border-stone-800 rounded p-2 text-center">
              <div className="text-[9px] text-stone-500 uppercase">{x.label} (DC {x.dc})</div>
              <div className="text-sm font-bold text-emerald-400 font-mono">+{x.xp} XP</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-[10px] uppercase font-bold text-amber-600 tracking-widest mb-2 border-b border-stone-850 pb-1">Monster CR → XP</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
          {CR_TO_XP.map(x => (
            <div key={x.cr} className="bg-stone-950/40 border border-stone-800 rounded p-1.5 text-center">
              <div className="text-[9px] text-stone-500 uppercase">CR {x.cr}</div>
              <div className="text-xs font-bold text-amber-400 font-mono">{x.xp}</div>
            </div>
          ))}
        </div>
        <p className="text-[9px] text-stone-600 mt-1 italic">Solo play adds +25% Adventurer's Buffer to all XP awards.</p>
      </section>

      <section>
        <h3 className="text-[10px] uppercase font-bold text-amber-600 tracking-widest mb-2 border-b border-stone-850 pb-1">Rest Mechanics</h3>
        <div className="space-y-2">
          {REST_INFO.map(r => (
            <div key={r.key} className="bg-stone-950/40 border border-stone-800 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-sm font-bold text-amber-400">{r.label}</h4>
                <span className="text-[9px] text-stone-500 uppercase">{r.duration}</span>
              </div>
              <p className="text-[11px] text-stone-400 mb-1.5 leading-relaxed">{r.description}</p>
              <ul className="text-[10px] text-stone-300 space-y-0.5 list-disc list-inside">
                {r.restores.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-[10px] uppercase font-bold text-amber-600 tracking-widest mb-2 border-b border-stone-850 pb-1">Death Saves</h3>
        <div className="bg-stone-950/40 border border-stone-800 rounded-lg p-3 space-y-1">
          <p className="text-stone-300">{DEATH_SAVE_INFO.description}</p>
          <p className="text-emerald-400 text-[11px]">✓ {DEATH_SAVE_INFO.success}</p>
          <p className="text-red-400 text-[11px]">✗ {DEATH_SAVE_INFO.failure}</p>
          <p className="text-stone-400 text-[10px]">Nat 20: {DEATH_SAVE_INFO.nat20}</p>
          <p className="text-stone-400 text-[10px]">Nat 1: {DEATH_SAVE_INFO.nat1}</p>
          <p className="text-stone-400 text-[10px]">{DEATH_SAVE_INFO.takingDamage}</p>
        </div>
      </section>

      <section>
        <h3 className="text-[10px] uppercase font-bold text-amber-600 tracking-widest mb-2 border-b border-stone-850 pb-1">Exhaustion (cumulative)</h3>
        <div className="bg-stone-950/40 border border-stone-800 rounded-lg p-3 space-y-0.5">
          {EXHAUSTION_INFO.map(l => (
            <div key={l.level} className="text-[11px] text-stone-300">
              <strong className="text-orange-400 font-mono">L{l.level}:</strong> {l.description}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-[10px] uppercase font-bold text-amber-600 tracking-widest mb-2 border-b border-stone-850 pb-1">Combat Reference</h3>
        <div className="space-y-2">
          {Object.values(COMBAT_RULES).map(rule => (
            <div key={rule.label} className="bg-stone-950/40 border border-stone-800 rounded-lg p-2.5">
              <h4 className="text-xs font-bold text-amber-400 mb-0.5">{rule.label}</h4>
              <p className="text-[11px] text-stone-400 leading-relaxed">{rule.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default RulesTab;
