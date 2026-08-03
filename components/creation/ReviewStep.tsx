import React from 'react';
import { WizardState } from './types';
import { SKILLS_LIST, ASI_LEVELS } from '../../constants';
import { Character } from '../../types';
import { calculateMaxHp, getRaceDef, getMod } from '../../services/classEngine';
import { FEATS_CATALOG } from '../../utils/feats';
import { STAT_LABELS } from './constants';
import { getEffectiveAsiMap } from './asiUtils';
import { getAlignmentName, getBackgroundName } from '../../utils/backgrounds';
import { StepH, ErrorBanner } from './SharedComponents';
import Tooltip from '../ui/Tooltip';

/** Props for the review/final summary step of character creation. */
interface ReviewStepProps {
  wizardState: WizardState;
  finalizeError: string | null;
  isNewCampaign: boolean;
  campaignStartingLocation?: { name: string };
  needsSpellsStep: boolean;
  onFinalize: () => void;
  onGoToStart: () => void;
}

/** Final review step. Displays a full summary of the character (name, race, class, stats, skills, feats, spells, gear, starting location) before finalization. */
const ReviewStep: React.FC<ReviewStepProps> = ({
  wizardState, finalizeError, isNewCampaign, campaignStartingLocation, needsSpellsStep, onFinalize, onGoToStart,
}) => {
  const { name, selectedRace, selectedClass, stats, level, allocatedSkills, goldPool, inventory, asiFeatSlots, selectedSubclassId, selectedCantrips, selectedSpells, alignment, background, personalityTraits, ideals, bonds, flaws, backstory, fightingStyleChoice, invocationChoices, selectedSubraceId } = wizardState;
  const asiMap = getEffectiveAsiMap(selectedRace, wizardState.selectedSubraceId, wizardState.halfElfChoice1, wizardState.halfElfChoice2);
  const stepCls = "space-y-6 animate-in fade-in duration-500";

  return (
    <div className={`${stepCls} text-center`}>
      <StepH>Final Summary</StepH>
      <div className="bg-stone-950 p-6 rounded-xl border border-stone-800 space-y-6 text-left max-h-[400px] overflow-y-auto custom-scrollbar">
        <div className="flex justify-between items-start border-b border-stone-900 pb-4">
          <div>
            <p className="text-stone-500 uppercase text-[10px] font-bold tracking-widest">The Legend</p>
            <p className="fantasy-font text-3xl text-stone-100 leading-tight">{name}</p>
            <p className="text-amber-700 italic">Level {level} {selectedRace.name} {selectedClass.name}</p>
          </div>
          {(() => {
            // Build a minimal character for accurate HP calculation (includes subrace/feat bonuses)
            const resolvedStats = { ...stats };
            for (const [s, v] of Object.entries(asiMap)) resolvedStats[s as keyof typeof stats] += v;
            for (const [s, v] of Object.entries(wizardState.bonusStatAllocations || {})) {
              if (v > 0) resolvedStats[s as keyof typeof stats] += v;
            }
            for (const slot of asiFeatSlots) {
              if (slot.type === 'asi' && slot.statAllocations) {
                for (const [s, v] of Object.entries(slot.statAllocations)) {
                  if (v > 0) resolvedStats[s as keyof typeof stats] += v;
                }
              }
            }
            const raceDef = getRaceDef(selectedRace.id);
            const racialTraits: string[] = [];
            if (raceDef) for (const t of raceDef.traits) racialTraits.push(t.id);
            const subraceDef = selectedSubraceId ? selectedRace.subraces?.find(sr => sr.id === selectedSubraceId) : undefined;
            if (subraceDef?.traits) for (const t of subraceDef.traits) racialTraits.push(t.id);
            const collectedFeats: string[] = [];
            for (const slot of asiFeatSlots) {
              if (slot.type === 'feat' && slot.featId) collectedFeats.push(slot.featId);
            }
            const tempChar: Character = {
              id: 'temp', name, race: selectedRace.id, class: selectedClass.id, level,
              stats: resolvedStats, inventory: [], racialTraits, feats: collectedFeats,
              sorcerousOrigin: (selectedClass.id === 'sorcerer' && selectedSubclassId === 'draconic-bloodline') ? 'draconic-bloodline' : undefined,
              maxHpBonus: 0, hp: { current: 0, max: 0 },
              currency: { gp: 0, sp: 0, cp: 0 }, location: '',
              experience: 0, experienceToNextLevel: 0, unusedStatPoints: 0,
              hitDice: { current: level, max: level },
            };
            const maxHp = calculateMaxHp(tempChar);
            return (
              <div className="text-right">
                <p className="text-stone-500 uppercase text-[10px] font-bold tracking-widest">Vitality</p>
                <p className="text-2xl font-bold text-green-700">{maxHp} HP</p>
              </div>
            );
          })()}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(stats).map(([stat, val]) => (
            <div key={stat} className="bg-stone-900/30 p-2 rounded border border-stone-800 text-center">
              <div className="text-[8px] uppercase text-stone-600 font-bold">{stat}</div>
              <div className="font-bold text-stone-200">{(val as number) + (asiMap[stat] || 0)}</div>
            </div>
          ))}
        </div>
        <div>
          <p className="text-stone-500 uppercase text-[10px] font-bold tracking-widest mb-2">Trained Skills</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(allocatedSkills).filter(([, v]) => v > 0).map(([sN, r]) => {
              const sk = SKILLS_LIST.find(s => s.name === sN);
              return <span key={sN} className="text-[10px] text-stone-300 bg-stone-900 border border-stone-850 px-2 py-0.5 rounded capitalize">{sk?.label || sN} (Rank {r})</span>;
            })}
            {Object.entries(allocatedSkills).filter(([, v]) => v > 0).length === 0 && <span className="text-xs text-stone-500 italic">No skills trained yet.</span>}
          </div>
        </div>
        <div>
          <p className="text-stone-500 uppercase text-[10px] font-bold tracking-widest mb-2">Starting Wealth</p>
          <div className="flex items-center gap-1.5 text-amber-500 font-bold text-sm">
            <i className="fas fa-coins text-amber-400"></i>
            <span>{Math.floor(goldPool)} GP, {Math.round((goldPool % 1) * 10)} SP</span>
          </div>
        </div>
        <div>
          <p className="text-stone-500 uppercase text-[10px] font-bold tracking-widest mb-2">Starting Pack</p>
          <p className="text-xs text-stone-400 italic">{inventory.map(i => `${i.name} x${i.quantity}`).join(', ')}</p>
        </div>
        <div>
          <p className="text-stone-500 uppercase text-[10px] font-bold tracking-widest mb-1">Proficiency Bonus</p>
          <span className="text-amber-400 font-mono font-bold text-lg">+{Math.ceil(level / 4) + 1}</span>
          <span className="text-stone-500 text-[10px] ml-2">scales with level</span>
        </div>
        <div>
          <p className="text-stone-500 uppercase text-[10px] font-bold tracking-widest mb-2">Saving Throws</p>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(stats) as [string, number][]).map(([stat, val]) => {
              const total = val + (asiMap[stat] || 0);
              const mod = getMod(total);
              const isProficient = selectedClass.savingThrowProfs?.includes(stat as 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha');
              const profBonus = Math.ceil(level / 4) + 1;
              const saveVal = mod + (isProficient ? profBonus : 0);
              return (
                <span key={stat} className={`text-[10px] font-mono px-2 py-1 rounded border ${isProficient ? 'border-amber-700 bg-amber-950/20 text-amber-400' : 'border-stone-800 bg-stone-900 text-stone-400'}`}>
                  {stat.toUpperCase()}: {saveVal >= 0 ? '+' : ''}{saveVal}
                  {isProficient && <i className="fas fa-star text-[7px] ml-1 text-amber-600"></i>}
                </span>
              );
            })}
          </div>
          <p className="text-[9px] text-stone-600 mt-1">
            <Tooltip content="Proficient saves add your Proficiency Bonus (scales with level) on top of the stat modifier. Each class is proficient in two specific saving throws." side="top">
              <span><i className="fas fa-star text-amber-700 text-[7px] mr-1"></i>= Proficient</span>
            </Tooltip>
          </p>
        </div>
        {selectedSubclassId && (() => {
          const sc = selectedClass.subclasses?.find((s: { id: string }) => s.id === selectedSubclassId);
          return sc ? (
            <div>
              <p className="text-stone-500 uppercase text-[10px] font-bold tracking-widest mb-1">Subclass</p>
              <p className="text-amber-400 font-bold">{sc.name}</p>
              <p className="text-[10px] text-stone-400 italic">{sc.description}</p>
            </div>
          ) : null;
        })()}
        {fightingStyleChoice && (
          <div>
            <p className="text-stone-500 uppercase text-[10px] font-bold tracking-widest mb-1">Fighting Style</p>
            <p className="text-amber-400 font-bold">{fightingStyleChoice.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
          </div>
        )}
        {invocationChoices?.length > 0 && (
          <div>
            <p className="text-stone-500 uppercase text-[10px] font-bold tracking-widest mb-1">Invocations</p>
            <p className="text-[10px] text-stone-300">{invocationChoices.join(', ')}</p>
          </div>
        )}
        {selectedSubraceId && (
          <div>
            <p className="text-stone-500 uppercase text-[10px] font-bold tracking-widest mb-1">Subrace</p>
            <p className="text-amber-400 font-bold">{selectedSubraceId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
          </div>
        )}
        {asiFeatSlots.length > 0 && (
          <div>
            <p className="text-stone-500 uppercase text-[10px] font-bold tracking-widest mb-2">Feats and Ability Improvements</p>
            <div className="space-y-1">
              {asiFeatSlots.map((slot, idx) => {
                const slotLevel = ASI_LEVELS[idx];
                if (slot.type === 'feat' && slot.featId) {
                  const feat = FEATS_CATALOG.find(f => f.id === slot.featId);
                  return (
                    <div key={idx} className="text-[10px] text-stone-300 flex items-center gap-2">
                      <span className="text-amber-700 font-bold">Lv{slotLevel}:</span>
                      <i className={`fas ${feat?.icon || 'fa-star'} text-amber-500`}></i>
                      <span>{feat?.name || slot.featId}</span>
                    </div>
                  );
                } else if (slot.type === 'asi' && slot.statAllocations) {
                  const allocs = Object.entries(slot.statAllocations)
                    .filter(([, v]) => (v as number) > 0)
                    .map(([k, v]) => `+${v} ${STAT_LABELS[k] || k.toUpperCase()}`)
                    .join(', ');
                  return (
                    <div key={idx} className="text-[10px] text-stone-300 flex items-center gap-2">
                      <span className="text-amber-700 font-bold">Lv{slotLevel}:</span>
                      <span className="text-green-400">{allocs}</span>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        )}
        {needsSpellsStep && (selectedCantrips.length > 0 || selectedSpells.length > 0) && (
          <div>
            <p className="text-stone-500 uppercase text-[10px] font-bold tracking-widest mb-2">Spells</p>
            {selectedCantrips.length > 0 && (
              <div className="mb-1">
                <span className="text-[9px] text-amber-700 uppercase font-bold">Cantrips: </span>
                <span className="text-[10px] text-stone-300">{selectedCantrips.join(', ')}</span>
              </div>
            )}
            {selectedSpells.length > 0 && (
              <div>
                <span className="text-[9px] text-amber-700 uppercase font-bold">Spells: </span>
                <span className="text-[10px] text-stone-300">{selectedSpells.join(', ')}</span>
              </div>
            )}
          </div>
        )}
        {!isNewCampaign && campaignStartingLocation && (
          <div>
            <p className="text-stone-500 uppercase text-[10px] font-bold tracking-widest mb-2">Starting Location</p>
            <p className="text-amber-400 fantasy-font text-lg">{campaignStartingLocation.name}</p>
          </div>
        )}
        {(alignment || background || personalityTraits.length || ideals.length || bonds.length || flaws.length || backstory.trim()) && (
          <div className="border-t border-stone-900 pt-4">
            <p className="text-stone-500 uppercase text-[10px] font-bold tracking-widest mb-2">Persona & Background</p>
            <div className="space-y-1.5">
              {(alignment || background) && (
                <div className="flex flex-wrap gap-1.5">
                  {alignment && <span className="text-[10px] text-amber-400 bg-amber-950/20 border border-amber-900/30 px-2 py-0.5 rounded">{getAlignmentName(alignment)}</span>}
                  {background && <span className="text-[10px] text-stone-300 bg-stone-900 border border-stone-800 px-2 py-0.5 rounded">{getBackgroundName(background)}</span>}
                </div>
              )}
              {personalityTraits.filter(t => t.trim()).map((t, i) => (
                <p key={`p${i}`} className="text-[10px] text-stone-300"><span className="text-amber-700 font-bold">Trait:</span> {t}</p>
              ))}
              {ideals.filter(t => t.trim()).map((t, i) => (
                <p key={`i${i}`} className="text-[10px] text-stone-300"><span className="text-amber-700 font-bold">Ideal:</span> {t}</p>
              ))}
              {bonds.filter(t => t.trim()).map((t, i) => (
                <p key={`b${i}`} className="text-[10px] text-stone-300"><span className="text-amber-700 font-bold">Bond:</span> {t}</p>
              ))}
              {flaws.filter(t => t.trim()).map((t, i) => (
                <p key={`f${i}`} className="text-[10px] text-stone-300"><span className="text-red-700 font-bold">Flaw:</span> {t}</p>
              ))}
              {backstory.trim() && (
                <p className="text-[10px] text-stone-400 italic">{backstory}</p>
              )}
            </div>
          </div>
        )}
      </div>
      {finalizeError && <ErrorBanner message={finalizeError} />}
      {isNewCampaign ? (
        <button onClick={onGoToStart} className="w-full py-4 bg-amber-700 hover:bg-amber-600 rounded-lg font-bold text-white transition-all uppercase tracking-widest shadow-xl shadow-amber-900/20 text-xs">Choose Your Starting Grounds</button>
      ) : (
        <button onClick={onFinalize} className="w-full py-4 bg-green-800 hover:bg-green-700 rounded-lg font-bold text-white transition-all uppercase tracking-widest shadow-xl shadow-green-900/20 text-xs">Begin Your Chronicle</button>
      )}
    </div>
  );
};

export default ReviewStep;
