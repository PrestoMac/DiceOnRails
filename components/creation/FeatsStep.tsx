import React, { useState } from 'react';
import { Character } from '../../types';
import { StepProps } from './types';
import { FeatSelection } from '../../types';
import { FEATS_CATALOG, FEAT_CATEGORIES, FeatDefinition } from '../../utils/feats';
import { filterAvailableFeats, validateFeatPrereqs } from '../../services/featsService';
import { ASI_LEVELS } from '../../constants';
import { STAT_LABELS } from './constants';
import { getEffectiveAsiMap } from './asiUtils';
import { StepH } from './SharedComponents';
import FeatDetailModal from '../FeatDetailModal';
import Tooltip from '../ui/Tooltip';

/** Feats and Ability Score Improvements step. Manages ASI/feat selection per slot, including point allocation for ASI and feat browsing/filtering. */
const FeatsStep: React.FC<StepProps & { onGoToSpells: () => void; onGoToGear: () => void; onGoToSubclass: () => void; needsSpellsStep: boolean; needsSubclassStep: boolean }> = ({
  wizardState, updateWizard, onBack, onGoToSpells, onGoToGear, onGoToSubclass, needsSpellsStep, needsSubclassStep,
}) => {
  const { selectedClass, selectedRace, stats, inventory, allocatedSkills, level, asiFeatSlots } = wizardState;
  const stepCls = "space-y-6 animate-in fade-in duration-500";
  const asiMap = getEffectiveAsiMap(selectedRace, wizardState.selectedSubraceId, wizardState.halfElfChoice1, wizardState.halfElfChoice2);

  const [featSearch, setFeatSearch] = useState('');
  const [featCategory, setFeatCategory] = useState<string>('all');
  const [viewingFeat, setViewingFeat] = useState<FeatDefinition | null>(null);

  const collectedFeatsSoFar = (uptoIdx: number) =>
    asiFeatSlots.slice(0, uptoIdx).filter(s => s.type === 'feat' && s.featId).map(s => s.featId as string);

  const isSlotComplete = (slot: FeatSelection) => {
    if (slot.type === 'feat') return !!slot.featId;
    if (slot.type === 'asi') {
      const total = Object.values(slot.statAllocations || {}).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);
      return total === 2;
    }
    return false;
  };

  const handleSetAsi = (idx: number) => {
    const next = [...asiFeatSlots];
    next[idx] = { type: 'asi', statAllocations: {} };
    updateWizard({ asiFeatSlots: next });
  };

  const handleSetFeat = (idx: number) => {
    setFeatSearch('');
    setFeatCategory('all');
    const next = [...asiFeatSlots];
    next[idx] = { type: 'feat' };
    updateWizard({ asiFeatSlots: next });
  };

  const handleSelectFeat = (idx: number, featId: string) => {
    const next = [...asiFeatSlots];
    next[idx] = { type: 'feat', featId };
    updateWizard({ asiFeatSlots: next });
  };

  const handleAsiAlloc = (idx: number, stat: string, delta: number) => {
    const next = [...asiFeatSlots];
    const sa = { ...(next[idx].statAllocations || {}) } as Record<string, number>;
    sa[stat] = Math.max(0, (sa[stat] || 0) + delta);
    next[idx] = { ...next[idx], statAllocations: sa };
    updateWizard({ asiFeatSlots: next });
  };

  const handleResetSlot = (idx: number) => {
    setFeatSearch('');
    setFeatCategory('all');
    const next = [...asiFeatSlots];
    next[idx] = { type: null };
    updateWizard({ asiFeatSlots: next });
  };

  const allComplete = asiFeatSlots.every(s => s.type !== null) &&
    asiFeatSlots.filter(s => s.type === 'asi').every(s =>
      Object.values(s.statAllocations || {}).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0) === 2
    );

  const handleContinue = () => {
    if (needsSubclassStep) onGoToSubclass();
    else if (needsSpellsStep) onGoToSpells();
    else onGoToGear();
  };

  return (
    <div className={`${stepCls} max-h-[75vh] overflow-y-auto pr-1 custom-scrollbar`}>
      <StepH>Feats &amp; Ability Improvements</StepH>
      <div className="bg-stone-950/60 border border-amber-900/30 rounded-xl p-3 text-center mb-2">
        <p className="text-xs text-stone-400">
          At level <span className="text-amber-500 font-bold">{level}</span>, you have reached{' '}
          <Tooltip content="ASI/Feat milestones occur at levels 4, 8, 12, 16, 19. At each, you choose between an Ability Score Improvement (+1 to two stats or +2 to one) OR a Feat. Level 1 grants one starting slot (variant rule)." side="top">
            <span className="text-amber-500 font-bold underline decoration-dotted">{asiFeatSlots.length} Ability Score Improvement milestone{asiFeatSlots.length === 1 ? '' : 's'}</span>
          </Tooltip>
          .
        </p>
        <p className="text-[10px] text-stone-500 mt-1">
          For each, choose: Ability Score Improvement <span className="text-amber-600">or</span> a Feat
        </p>
      </div>

      {asiFeatSlots.map((slot, idx) => {
        const slotLevel = ASI_LEVELS[idx];
        return (
          <div key={idx} className={`rounded-xl p-4 mb-3 space-y-3 border transition-colors ${isSlotComplete(slot) ? 'bg-green-950/10 border-green-900/40' : 'bg-stone-950/40 border-stone-800'}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-[10px] uppercase font-bold text-amber-500 tracking-widest">Slot {idx + 1} — Level {slotLevel}</p>
                  {isSlotComplete(slot) && (
                    <span className="text-[9px] text-green-400 font-bold flex items-center gap-0.5">
                      <i className="fas fa-check-circle"></i> Done
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-stone-200 mt-0.5">
                  {slot.type === 'asi' ? 'Ability Score Improvement' : slot.type === 'feat' ? `Feat: ${FEATS_CATALOG.find(f => f.id === slot.featId)?.name || '...'}` : 'Choose one'}
                </h3>
              </div>
            </div>

            {slot.type === null && (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => handleSetAsi(idx)} className="p-3 bg-stone-900/60 border border-stone-800 hover:border-amber-700 hover:bg-amber-950/20 rounded-lg transition-all text-center">
                  <i className="fas fa-arrow-up text-2xl text-amber-500 mb-1"></i>
                  <p className="text-xs font-bold text-stone-200 uppercase tracking-wider">Ability Score</p>
                  <p className="text-[9px] text-stone-400 mt-0.5">+1 to two stats, or +2 to one</p>
                </button>
                <button onClick={() => handleSetFeat(idx)} className="p-3 bg-stone-900/60 border border-stone-800 hover:border-amber-700 hover:bg-amber-950/20 rounded-lg transition-all text-center">
                  <i className="fas fa-trophy text-2xl text-amber-500 mb-1"></i>
                  <p className="text-xs font-bold text-stone-200 uppercase tracking-wider">Take a Feat</p>
                  <p className="text-[9px] text-stone-400 mt-0.5">Choose from the SRD feat list</p>
                </button>
              </div>
            )}

            {slot.type === 'asi' && (
              <div className="space-y-2">
                <div className="flex justify-between items-center bg-stone-950/60 p-2 rounded border border-stone-850">
                  <span className="text-[10px] text-stone-400">Points to allocate:</span>
                  <span className={`text-sm font-bold font-mono ${Object.values(slot.statAllocations || {}).reduce((s: number, v) => s + (typeof v === 'number' ? v : 0), 0) === 2 ? 'text-green-500' : 'text-amber-500'}`}>
                    {Object.values(slot.statAllocations || {}).reduce((s: number, v) => s + (typeof v === 'number' ? v : 0), 0)}/2
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(Object.keys(stats) as (keyof Character['stats'])[]).map(stat => {
                    const al = (slot.statAllocations as Record<string, number>)?.[stat] || 0;
                    const racialBonus = asiMap[stat] || 0;
                    const currentFinal = stats[stat] + racialBonus;
                    const proposed = currentFinal + al;
                    const disableAdd = al >= 2 || Object.values(slot.statAllocations || {}).reduce((s: number, v) => s + (typeof v === 'number' ? v : 0), 0) >= 2 || proposed > 20;
                    const disableRem = al <= 0;
                    return (
                      <div key={stat} role="group" aria-label={STAT_LABELS[stat]} className="bg-stone-950/40 border border-stone-850 rounded p-2 text-center">
                        <div className="text-[9px] uppercase text-stone-500 font-bold">{STAT_LABELS[stat]}</div>
                        <div className="flex items-center justify-center gap-0.5 my-1">
                          <button onClick={() => handleAsiAlloc(idx, stat, -1)} disabled={disableRem} className="w-5 h-5 text-[9px] bg-stone-800 rounded disabled:opacity-30">-</button>
                          <span className={`text-xs font-mono font-bold w-7 ${al > 0 ? 'text-green-400' : 'text-stone-300'}`}>{proposed}</span>
                          <button onClick={() => handleAsiAlloc(idx, stat, 1)} disabled={disableAdd} className="w-5 h-5 text-[9px] bg-stone-800 rounded disabled:opacity-30">+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button onClick={() => handleResetSlot(idx)} className="text-[10px] text-stone-500 hover:text-stone-300">&larr; Change choice</button>
              </div>
            )}

            {slot.type === 'feat' && (
              <div className="space-y-2">
                {slot.featId ? (
                  <div className="bg-amber-950/20 border border-amber-900/40 rounded-lg p-2 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-amber-500 tracking-widest">Selected</p>
                      <h4 className="text-sm font-bold text-stone-100">{FEATS_CATALOG.find(f => f.id === slot.featId)?.name}</h4>
                    </div>
                    <button onClick={() => setViewingFeat(FEATS_CATALOG.find(f => f.id === slot.featId) || null)} className="text-amber-500 hover:text-amber-400 text-xs">
                      <i className="fas fa-info-circle mr-1"></i> Details
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      placeholder="Search feats..."
                      value={featSearch}
                      onChange={e => setFeatSearch(e.target.value)}
                      className="w-full px-2 py-1.5 bg-stone-950 border border-stone-800 rounded text-xs text-stone-200 outline-none focus:border-amber-700"
                    />
                    <div className="flex flex-wrap gap-1">
                      <button onClick={() => setFeatCategory('all')} className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider ${featCategory === 'all' ? 'bg-amber-900/40 text-amber-400 border border-amber-800/30' : 'bg-stone-900 text-stone-500 border border-stone-800'}`}>All</button>
                      {FEAT_CATEGORIES.map(c => (
                        <button key={c.key} onClick={() => setFeatCategory(c.key)} className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider ${featCategory === c.key ? 'bg-amber-900/40 text-amber-400 border border-amber-800/30' : 'bg-stone-900 text-stone-500 border border-stone-800'}`}>
                          <i className={`fas ${c.icon} mr-1 text-[8px]`}></i>{c.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {!slot.featId && (() => {
                  const simChar: Character = {
                    id: 'tmp', name: wizardState.name, class: selectedClass.id, race: selectedRace.id, level,
                    hp: { current: 0, max: 0 },
                    stats: (() => {
                      const out = { ...stats };
                      for (const [k, v] of Object.entries(asiMap)) (out as Record<string, number>)[k] = ((out as Record<string, number>)[k] || 0) + v;
                      return out;
                    })(),
                    inventory, currency: { gp: 0, sp: 0, cp: 0 }, location: '',
                    experience: 0, experienceToNextLevel: 0,
                    unusedStatPoints: 0, maxHpBonus: 0, hitDice: { current: level, max: level },
                    skills: allocatedSkills,
                    feats: collectedFeatsSoFar(idx),
                  };
                  let avail = filterAvailableFeats(simChar, featSearch);
                  if (featCategory !== 'all') avail = avail.filter(f => f.category === featCategory);
                  return (
                    <div className="max-h-48 overflow-y-auto pr-1 custom-scrollbar space-y-1.5">
                      {avail.length === 0 ? (
                        <p className="text-center text-stone-500 text-[10px] py-3">No matching feats available.</p>
                      ) : (
                        avail.map(feat => {
                          const v = validateFeatPrereqs(simChar, feat.id);
                          return (
                            <div
                              key={feat.id}
                              onClick={() => v.ok && handleSelectFeat(idx, feat.id)}
                              className={`p-2 rounded border text-left cursor-pointer flex items-start gap-2 ${
                                v.ok ? 'border-stone-800 bg-stone-950/30 hover:bg-stone-900/40' : 'border-stone-900 bg-stone-950/10 opacity-50 cursor-not-allowed'
                              }`}
                            >
                              <i className={`fas ${feat.icon} text-amber-500 text-xs mt-0.5`}></i>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <p className="text-xs font-bold text-stone-200 truncate">{feat.name}</p>
                                  <button onClick={(e) => { e.stopPropagation(); setViewingFeat(feat); }} className="text-stone-500 hover:text-stone-200 text-[10px]"><i className="fas fa-info-circle"></i></button>
                                </div>
                                <p className="text-[9px] text-stone-400 line-clamp-1">{feat.mechanicalEffect}</p>
                                {!v.ok && <p className="text-[8px] text-red-400 mt-0.5"><i className="fas fa-lock text-[7px] mr-0.5"></i>{v.reason}</p>}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  );
                })()}

                <button onClick={() => handleResetSlot(idx)} className="text-[10px] text-stone-500 hover:text-stone-300">&larr; Change choice</button>
              </div>
            )}
          </div>
        );
      })}

      <div className="flex gap-2">
        <button
          onClick={onBack}
          className="w-1/3 py-3 bg-stone-800 hover:bg-stone-700 rounded-lg font-bold text-stone-400 transition-colors uppercase tracking-wider text-xs border border-stone-700"
        >
          Back
        </button>
        <button
          onClick={handleContinue}
          disabled={!allComplete}
          className="w-2/3 py-3 bg-amber-700 hover:bg-amber-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg font-bold text-white transition-all uppercase tracking-wider text-xs shadow-lg shadow-amber-950/40"
        >
          {needsSubclassStep ? 'Choose Subclass' : needsSpellsStep ? 'Choose Spells' : 'Choose Gear'}
        </button>
      </div>
      <FeatDetailModal feat={viewingFeat} onClose={() => setViewingFeat(null)} />
    </div>
  );
};

export default FeatsStep;
