import React from 'react';
import { StepProps } from './types';
import { SKILLS_LIST } from '../../constants';
import { getMod } from '../../services/classEngine';
import { CLASS_RECOMMENDED_SKILLS } from './constants';
import { StepH, AdjBtn } from './SharedComponents';

/** Skill training step. Allocates skill points derived from class choices and level, with class-recommended skills highlighted. */
const SkillsStep: React.FC<StepProps> = ({ wizardState, updateWizard, onNext }) => {
  const { selectedClass, selectedRace, stats, allocatedSkills, level } = wizardState;
  const stepCls = "space-y-6 animate-in fade-in duration-500";

  const startingPoints = selectedClass.skillChoices.count * 2;
  const remainingSkillPoints = startingPoints + (level - 1) * (selectedClass.name === 'Rogue' ? 4 : 3)
    - Object.values(allocatedSkills).reduce((s, v) => s + v, 0);

  const asiMap = typeof selectedRace.asi === 'object' ? selectedRace.asi as Record<string, number> : {};

  return (
    <div className={stepCls}>
      <StepH>Skill Training</StepH>
      <p className="text-[10px] text-stone-500 text-center -mt-3">
        Allocate training points to boost skill modifiers. Ranks add directly to your stat modifier.
      </p>
      <div className="flex justify-between items-center bg-stone-950/60 p-3 rounded-lg border border-stone-850">
        <span className="text-xs text-stone-400">Available Skill Points:</span>
        <span className={`text-lg font-bold font-mono ${remainingSkillPoints > 0 ? 'text-amber-500 animate-pulse' : 'text-green-500'}`}>
          {remainingSkillPoints}
        </span>
      </div>
      <div className="max-h-[300px] overflow-y-auto pr-1 space-y-2 custom-scrollbar border border-stone-800 rounded-lg p-2 bg-stone-950/20">
        {[...SKILLS_LIST]
          .sort((a, b) => {
            const aRec = CLASS_RECOMMENDED_SKILLS[selectedClass.name]?.includes(a.label) ? -1 : 0;
            const bRec = CLASS_RECOMMENDED_SKILLS[selectedClass.name]?.includes(b.label) ? -1 : 0;
            return aRec - bRec;
          })
          .map(skill => {
            const rank = allocatedSkills[skill.name] || 0;
            const statVal = stats[skill.stat] + (asiMap[skill.stat] || 0);
            const totalMod = getMod(statVal) + rank;
            return (
              <div key={skill.name} className="flex flex-col bg-stone-950/40 border border-stone-850 rounded-lg p-2.5 hover:bg-stone-950/60 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-stone-200">{skill.label}</span>
                      {CLASS_RECOMMENDED_SKILLS[selectedClass.name]?.includes(skill.label) && (
                        <span className="text-[8px] uppercase font-bold text-amber-600 bg-amber-950/20 border border-amber-900/30 px-1 rounded">
                          Recommended
                        </span>
                      )}
                      <span className="text-[9px] uppercase font-mono px-1 rounded bg-stone-900 border border-stone-800 text-stone-400">{skill.stat}</span>
                    </div>
                    <span className="text-[10px] text-stone-500 line-clamp-1">{skill.description}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <AdjBtn
                      onClick={() => { if (rank > 0) updateWizard({ allocatedSkills: { ...allocatedSkills, [skill.name]: rank - 1 } }); }}
                      disabled={rank <= 0}
                      icon="minus"
                      hoverColor="hover:bg-red-950 hover:text-red-400"
                    />
                    <div className="w-8 text-center">
                      <span className={`text-sm font-bold font-mono ${rank > 0 ? 'text-green-400' : 'text-stone-300'}`}>{rank}</span>
                    </div>
                    <AdjBtn
                      onClick={() => { if (remainingSkillPoints > 0 && rank < 20) updateWizard({ allocatedSkills: { ...allocatedSkills, [skill.name]: rank + 1 } }); }}
                      disabled={remainingSkillPoints <= 0 || rank >= 20}
                      icon="plus"
                      hoverColor="hover:bg-amber-950 hover:text-amber-400"
                    />
                  </div>
                  <div className="w-16 text-right">
                    <span className={`text-xs font-mono font-bold ${totalMod >= 0 ? 'text-green-500' : 'text-red-400'}`}>{totalMod >= 0 ? '+' : ''}{totalMod}</span>
                    <span className="text-[9px] text-stone-500 block">(Rank {rank})</span>
                  </div>
                </div>
              </div>
            );
          })}
      </div>
      <button
        onClick={onNext}
        disabled={remainingSkillPoints > 0}
        className="w-full py-4 bg-amber-700 hover:bg-amber-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg font-bold text-white transition-all uppercase tracking-widest text-xs"
      >
        Feats &amp; Ability Improvements
      </button>
    </div>
  );
};

export default SkillsStep;
