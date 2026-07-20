import React, { useState, useEffect, useCallback } from 'react';
import { StepProps } from './types';
import { CLASSES_CATALOG } from '../../utils/classes';
import { getMod } from '../../services/classEngine';
import { cryptoRoll } from '../../utils/random';
import { STAT_LABELS, POINT_BUY_COSTS, GEN_MODES } from './constants';
import { StepH, TabBtn, AdjBtn, ErrorBanner } from './SharedComponents';

const CLASS_RECOMMENDED_STATS: Record<string, Record<string, number>> =
  Object.fromEntries(CLASSES_CATALOG.map(c => [c.name, c.recommendedStats]));
const CLASS_STATS_PRIORITY: Record<string, string[]> =
  Object.fromEntries(CLASSES_CATALOG.map(c => [c.name, c.statPriority]));

const StatsStep: React.FC<StepProps> = ({ wizardState, updateWizard, onNext }) => {
  const { selectedClass, selectedRace, stats, level } = wizardState;
  const stepCls = "space-y-6 animate-in fade-in duration-500";

  const [genMode, setGenMode] = useState<'buy' | 'array' | 'roll'>('buy');
  const [rolledValues, setRolledValues] = useState<number[]>([]);
  const [rollHistory, setRollHistory] = useState<Array<{ dice: number[]; dropped: number; total: number }>>([]);
  const [hasRolled, setHasRolled] = useState(false);
  const [localStats, setLocalStats] = useState(stats);
  const [halfElfChoice1, setHalfElfChoice1] = useState<string | null>(wizardState.halfElfChoice1);
  const [halfElfChoice2, setHalfElfChoice2] = useState<string | null>(wizardState.halfElfChoice2);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  const totalSpent = Object.values(localStats).reduce((s, v) => s + (POINT_BUY_COSTS[v] || 0), 0);

  const buildStatMap = useCallback((values: number[]) => {
    const sorted = [...values].sort((a, b) => b - a);
    return Object.fromEntries(CLASS_STATS_PRIORITY[selectedClass.name].map((s, i) => [s, sorted[i]])) as typeof stats;
  }, [selectedClass.name]);

  useEffect(() => {
    if (genMode === 'buy') setLocalStats({ str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 });
    else if (genMode === 'array') setLocalStats({ ...CLASS_RECOMMENDED_STATS[selectedClass.name] } as any);
    else if (genMode === 'roll' && rolledValues.length > 0) {
      setLocalStats(buildStatMap(rolledValues));
    }
  }, [genMode, selectedClass.name, rolledValues, buildStatMap]);

  const handlePointBuyUpdate = (stat: string, delta: number) => {
    const nv = (localStats as any)[stat] + delta;
    if (nv < 8 || nv > 15) return;
    if (Object.values({ ...localStats, [stat]: nv }).reduce((s, v) => s + (POINT_BUY_COSTS[v as number] || 0), 0) <= 27) {
      setLocalStats(s => ({ ...s, [stat]: nv }));
    }
  };

  const swapStatValue = (stat: string, tv: number) => {
    setLocalStats(p => {
      const e = Object.entries(p);
      const tk = e.find(([, v]) => v === tv)?.[0];
      return Object.fromEntries(e.map(([k, v]) => [k, k === stat ? tv : k === tk ? (p as any)[stat] : v])) as typeof stats;
    });
  };

  const roll4d6DropLowest = () => {
    const rolls = Array.from({ length: 6 }, () => {
      const d = Array.from({ length: 4 }, () => cryptoRoll(6));
      const s = [...d].sort((a, b) => a - b);
      return { dice: d, dropped: s[0], total: s[1] + s[2] + s[3] };
    });
    setRollHistory(rolls);
    const totals = rolls.map(r => r.total);
    setRolledValues(totals);
    setHasRolled(true);
    setLocalStats(buildStatMap(totals));
  };

  const asiMap = typeof selectedRace.asi === 'object' ? selectedRace.asi as Record<string, number> : {};
  const racialConBonus = asiMap['con'] || 0;
  const totalCon = localStats.con + racialConBonus;
  const conMod = getMod(totalCon);
  const previewHp = selectedClass.hpBase + conMod + (selectedClass.hpPerLevel + conMod) * (level - 1);

  const handleContinue = () => {
    if (genMode === 'buy' && 27 - totalSpent > 0) {
      setFinalizeError(`You still have ${27 - totalSpent} unspent attribute points.`);
      return;
    }
    if (genMode === 'roll' && !hasRolled) {
      setFinalizeError("Please roll for stats before continuing.");
      return;
    }
    if (selectedRace.asi === 'flexible-2' && (!halfElfChoice1 || !halfElfChoice2)) {
      setFinalizeError("Please choose two stats for your Half-Elf's flexible ASI.");
      return;
    }
    updateWizard({
      stats: localStats,
      halfElfChoice1,
      halfElfChoice2,
    });
    setFinalizeError(null);
    onNext();
  };

  return (
    <div className={`${stepCls} max-h-[75vh] overflow-y-auto pr-1 custom-scrollbar`}>
      <h2 className="fantasy-font text-3xl font-bold text-amber-500 text-center uppercase tracking-widest">Attributes</h2>
      <div className="flex justify-between items-center bg-green-950/20 border border-green-900/30 rounded-lg px-4 py-2 text-xs">
        <span className="text-stone-400">
          <i className="fas fa-heart text-red-500 mr-1.5"></i>
          Estimated Max HP
        </span>
        <span className="font-bold font-mono text-green-400 text-base">{previewHp}</span>
      </div>
      <div className="flex border border-stone-800 bg-stone-950/60 rounded-lg p-1 text-xs">
        {GEN_MODES.map(m => (
          <TabBtn key={m.key} active={genMode === m.key} onClick={() => {
            if (m.key !== 'roll') {
              setHasRolled(false);
              setRolledValues([]);
              setRollHistory([]);
            }
            setGenMode(m.key);
          }}>{m.label}</TabBtn>
        ))}
      </div>
      {genMode === 'buy' && (
        <div className="bg-stone-950/60 p-3 rounded-lg border border-stone-850 text-xs space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-stone-400 font-bold">Points Remaining</span>
            <span className={`text-base font-bold font-mono ${27 - totalSpent > 0 ? 'text-amber-500 animate-pulse' : 'text-green-500'}`}>
              {27 - totalSpent} / 27
            </span>
          </div>
          <div className="border-t border-stone-800 pt-2">
            <p className="text-[9px] text-stone-500 uppercase font-bold tracking-wider mb-1">Point Cost Per Score:</p>
            <div className="flex gap-1 flex-wrap">
              {Object.entries(POINT_BUY_COSTS).map(([score, cost]) => (
                <span key={score} className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-stone-800 bg-stone-900 text-stone-400">
                  {score}={cost}pt
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
      {genMode === 'array' && (
        <div className="bg-stone-950/60 p-3 rounded-lg border border-stone-850 text-xs text-center text-stone-400">
          Standard Array values: <span className="font-mono text-amber-500 font-bold">15, 14, 13, 12, 10, 8</span>. Assign values to each stat below.
        </div>
      )}
      {genMode === 'roll' && (
        <div className="bg-stone-950/60 p-4 rounded-lg border border-stone-850 text-xs space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-stone-400">Roll 4d6 and drop the lowest die 6 times:</span>
            <button onClick={roll4d6DropLowest} className="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 rounded text-[10px] uppercase font-bold text-white tracking-wider">
              <i className="fas fa-dice mr-1"></i> {hasRolled ? 'Re-Roll' : 'Roll Stats'}
            </button>
          </div>
          {hasRolled && (
            <div className="grid grid-cols-3 gap-2 bg-stone-900/50 p-2.5 rounded border border-stone-800 text-[10px] font-mono text-center">
              {rollHistory.map((r, i) => (
                <div key={i} className="bg-stone-950/60 p-1.5 rounded border border-stone-850">
                  <div className="text-[8px] text-stone-500 uppercase tracking-tighter">Roll {i + 1}</div>
                  <div className="text-stone-400 mt-0.5">
                    {r.dice.map((d, di) => (
                      <span key={di} className={d === r.dropped ? 'text-red-500/50 line-through mr-0.5' : 'text-stone-300 mr-0.5'}>{d}</span>
                    ))}
                  </div>
                  <div className="text-green-400 font-bold mt-1 text-xs">Total: {r.total}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="flex items-center gap-4 text-[10px] text-stone-500 px-1">
        <span><i className="fas fa-star text-amber-500 text-[8px] mr-1"></i>Primary Stat</span>
        <span><i className="fas fa-star text-stone-500 text-[8px] mr-1"></i>Secondary Stat</span>
      </div>
      <button
        onClick={() => {
          if (genMode === 'roll' && !hasRolled) { setFinalizeError("Please roll stats first."); return; }
          setFinalizeError(null);
          setLocalStats(genMode === 'roll' ? buildStatMap(rolledValues) : { ...CLASS_RECOMMENDED_STATS[selectedClass.name] } as any);
        }}
        className="w-full py-2 border border-amber-800/40 bg-amber-950/20 hover:bg-amber-900/30 rounded-lg text-amber-400 text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2"
      >
        <i className="fas fa-magic"></i> Auto-Assign Stats for {selectedClass.name}
      </button>
      {finalizeError && <ErrorBanner message={finalizeError} />}
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        {(Object.entries(localStats) as [string, number][]).map(([stat, val]) => {
          const priorities = CLASS_STATS_PRIORITY[selectedClass.name];
          const racialBonus = asiMap[stat] || 0;
          const totalScore = val + racialBonus;
          const totalMod = getMod(totalScore);
          return (
            <div key={stat} role="group" aria-label={STAT_LABELS[stat]} className="space-y-1.5 bg-stone-950/40 p-3 rounded-lg border border-stone-850">
              <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-wider text-stone-400">
                <div className="flex items-center gap-1.5">
                  <span>{STAT_LABELS[stat]}</span>
                  {(priorities[0] === stat || (selectedClass.name === 'Paladin' && priorities[1] === stat)) && <i className="fas fa-star text-amber-500 text-[8px]"></i>}
                  {priorities[1] === stat && selectedClass.name !== 'Paladin' && <i className="fas fa-star text-stone-500 text-[8px]"></i>}
                </div>
                <span className={`font-mono text-xs font-bold ${totalMod >= 0 ? 'text-green-500' : 'text-red-400'}`}>{totalMod >= 0 ? '+' : ''}{totalMod} MOD</span>
              </div>
              <div className="flex items-center justify-between gap-2 bg-stone-950 p-1.5 rounded border border-stone-800">
                {genMode === 'buy' ? (
                  <>
                    <AdjBtn onClick={() => handlePointBuyUpdate(stat, -1)} disabled={val <= 8} icon="minus" hoverColor="hover:bg-red-950 hover:text-red-400" />
                    <div className="text-center flex-1"><span className="text-lg font-bold font-mono text-stone-100">{val}</span></div>
                    <AdjBtn onClick={() => handlePointBuyUpdate(stat, 1)} disabled={val >= 15 || 27 - totalSpent <= 0} icon="plus" hoverColor="hover:bg-green-950 hover:text-green-400" />
                  </>
                ) : (
                  <select
                    value={val}
                    onChange={e => swapStatValue(stat, parseInt(e.target.value, 10))}
                    disabled={genMode === 'roll' && !hasRolled}
                    className="w-full bg-stone-950 text-stone-200 outline-none text-center font-bold font-mono text-sm py-0.5 border-none cursor-pointer"
                  >
                    {genMode === 'roll' && !hasRolled
                      ? <option value="10">Roll first...</option>
                      : (genMode === 'array' ? [15, 14, 13, 12, 10, 8] : [...rolledValues].sort((a, b) => b - a)).map((v, vi) => (
                          <option key={vi} value={v}>{v}</option>
                        ))
                    }
                  </select>
                )}
              </div>
              <div className="flex justify-between items-center text-[9px] text-stone-500">
                <span>Base: {val}</span>
                {racialBonus > 0 && <span className="text-amber-600 font-bold">+{racialBonus} {selectedRace.name}</span>}
                <span>Total: {totalScore}</span>
              </div>
            </div>
          );
        })}
      </div>
      {selectedRace.asi === 'flexible-2' && (
        <div className="bg-amber-950/10 border border-amber-800/30 rounded-lg p-4 space-y-3 mt-4">
          <p className="text-xs text-amber-400 font-bold text-center">Half-Elf: Choose two stats to receive +1</p>
          <div role="group" aria-label="Half-Elf ability score improvement" className="grid grid-cols-3 gap-2">
            {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map(stat => {
              const selected = halfElfChoice1 === stat || halfElfChoice2 === stat;
              return (
                <button
                  key={stat}
                  onClick={() => {
                    if (halfElfChoice1 === stat) setHalfElfChoice1(null);
                    else if (halfElfChoice2 === stat) setHalfElfChoice2(null);
                    else if (!halfElfChoice1) setHalfElfChoice1(stat);
                    else if (!halfElfChoice2 && halfElfChoice1 !== stat) setHalfElfChoice2(stat);
                  }}
                  className={`p-2 rounded border text-center text-xs transition-all ${selected ? 'border-amber-600 bg-amber-900/20 text-amber-400' : 'border-stone-800 bg-stone-900/40 text-stone-400'}`}
                >
                  <div className="font-bold uppercase">{stat}</div>
                  <div className="text-[9px]">{selected ? '+1' : '—'}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <button onClick={handleContinue} className="w-full py-4 bg-amber-700 hover:bg-amber-600 rounded-lg font-bold text-white transition-all uppercase tracking-widest text-xs mt-2">
        Allocate Skills
      </button>
    </div>
  );
};

export default StatsStep;
