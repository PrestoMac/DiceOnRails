import React from 'react';
import { SKILLS_LIST } from '../../../constants';
import { getMod } from '../../../services/classEngine';
import SkillRow from './SkillRow';
import RemainingPointsBanner from './RemainingPointsBanner';
import { Character } from '../../../types';

interface SkillListWithPointsProps {
  allocatedSkills: Record<string, number>;
  stats: Character['stats'];
  selectedAllocations?: Partial<Record<keyof Character['stats'], number>>;
  remainingPoints: number;
  onAllocate: (skillName: string, delta: number) => void;
  recommendedSkills?: string[];
}

const SkillListWithPoints: React.FC<SkillListWithPointsProps> = ({
  allocatedSkills, stats, selectedAllocations = {},
  remainingPoints, onAllocate, recommendedSkills,
}) => (
  <div className="space-y-3 py-2 animate-in fade-in duration-350">
    <RemainingPointsBanner label="Available Skill Points:" remaining={remainingPoints} />
    <div className={recommendedSkills ? 'max-h-[300px] overflow-y-auto pr-1 space-y-2 custom-scrollbar border border-stone-800 rounded-lg p-2 bg-stone-950/20' : 'space-y-2'}>
      {[...SKILLS_LIST]
        .sort((a, b) => {
          if (!recommendedSkills) return 0;
          const aRec = recommendedSkills.includes(a.label) ? -1 : 0;
          const bRec = recommendedSkills.includes(b.label) ? -1 : 0;
          return aRec - bRec;
        })
        .map(skill => {
          const rank = allocatedSkills[skill.name] || 0;
          const statVal = stats[skill.stat] + (selectedAllocations[skill.stat] || 0);
          const totalMod = getMod(statVal) + rank;
          return (
            <SkillRow
              key={skill.name}
              label={skill.label}
              statKey={skill.stat}
              rank={rank}
              totalRank={rank}
              totalMod={totalMod}
              remainingPoints={remainingPoints}
              onAllocate={(delta) => onAllocate(skill.name, delta)}
              recommended={recommendedSkills?.includes(skill.label)}
              description={skill.description}
            />
          );
        })}
    </div>
  </div>
);

export default SkillListWithPoints;
