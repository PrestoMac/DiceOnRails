import React from 'react';
import { Character } from '../../types';
import { SKILLS_LIST } from '../../constants';
import { getMod } from '../../services/classEngine';
import AdjBtn from '../shared/AdjBtn';
import AddBtn from '../shared/AddBtn';

/** Props for the SkillsPanel component. */
interface SkillsPanelProps {
  skills: Character['skills'];
  selectedAllocations: Partial<Record<keyof Character['stats'], number>>;
  stats: Character['stats'];
  localSkills: Record<string, number>;
  remainingSkillPoints: number;
  onAllocate: (skillName: string, delta: number) => void;
}

/** Panel for allocating skill points during level-up. Displays each skill with +/- buttons and current rank. */
const SkillsPanel: React.FC<SkillsPanelProps> = ({ skills, selectedAllocations, stats, localSkills, remainingSkillPoints, onAllocate }) => (
  <div className="space-y-3 py-2 animate-in fade-in duration-350">
    <div className="flex justify-between items-center bg-stone-950/60 p-3 rounded-lg border border-stone-850 mb-2">
      <span className="text-xs text-stone-400">Available Skill Points:</span>
      <span className={`text-lg font-bold font-mono ${remainingSkillPoints > 0 ? 'text-amber-500 animate-pulse' : 'text-green-500'}`}>{remainingSkillPoints}</span>
    </div>
    <div className="space-y-2">
      {SKILLS_LIST.map(skill => {
        const cr = skills?.[skill.name] || 0, pa = localSkills[skill.name] || 0, fr = cr + pa;
        const gsv = stats[skill.stat] + (selectedAllocations[skill.stat] || 0);
        const tm = getMod(gsv) + fr;
        return (
          <div key={skill.name} className="flex flex-col bg-stone-950/30 border border-stone-850 hover:border-stone-800 rounded-lg p-3 transition-all hover:bg-stone-950/50">
            <div className="flex items-center gap-3">
              <div className="flex-1 text-left">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-stone-200">{skill.label}</span>
                  <span className="text-[9px] uppercase font-mono px-1 rounded bg-stone-900 border border-stone-800 text-stone-400">{skill.stat}</span>
                </div>
                <span className="text-[10px] text-stone-500 line-clamp-1">{skill.description}</span>
              </div>
              <div className="flex items-center gap-2">
                <AdjBtn onClick={() => onAllocate(skill.name, -1)} disabled={pa <= 0} />
                <div className="w-8 text-center">
                  <span className={`text-sm font-bold font-mono ${pa > 0 ? 'text-green-400' : 'text-stone-300'}`}>{fr}</span>
                </div>
                <AddBtn onClick={() => onAllocate(skill.name, 1)} disabled={remainingSkillPoints <= 0 || fr >= 20} />
              </div>
              <div className="w-16 text-right">
                <span className={`text-xs font-mono font-bold ${tm >= 0 ? 'text-green-500' : 'text-red-400'}`}>{tm >= 0 ? '+' : ''}{tm} MOD</span>
                <span className="text-[9px] text-stone-500 block">(Rank {fr})</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

export default SkillsPanel;
