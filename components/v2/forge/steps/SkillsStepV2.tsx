import React from 'react';
import Chip from '../../primitives/Chip';
import { cx } from '../../primitives/cx';
import { SKILLS_LIST } from '../../../../constants';
import { getMod } from '../../../../services/classEngine';
import { CLASS_RECOMMENDED_SKILLS } from '../../../creation/constants';
import { computeRemainingSkillPoints } from '../../../creation/skillPoints';
import { getEffectiveAsiMap } from '../../../creation/asiUtils';
import { ForgeAdjBtn, PointsBanner } from '../forgeWidgets';
import type { ForgeStepProps } from '../forgeTypes';

export type SkillsStepV2Props = ForgeStepProps;

/**
 * Forge step 5: skill training — port of the legacy SkillsStep with the
 * known fix applied: the stat preview uses the EFFECTIVE racial ASI map
 * (subrace REPLACE semantics + Half-Elf flexible picks), not just the raw
 * base-race ASI object.
 */
const SkillsStepV2: React.FC<SkillsStepV2Props> = ({ wizard, updateWizard }) => {
  const { selectedClass, selectedRace, stats, allocatedSkills, level } = wizard;
  const remainingSkillPoints = computeRemainingSkillPoints(selectedClass, level, allocatedSkills);
  const recommended = CLASS_RECOMMENDED_SKILLS[selectedClass.name] || [];

  // FIX (legacy bug): effective ASI incl. subrace selection + Half-Elf choices.
  const asiMap = getEffectiveAsiMap(selectedRace, wizard.selectedSubraceId, wizard.halfElfChoice1, wizard.halfElfChoice2);

  return (
    <div className="space-y-5">
      <div>
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-400/90">
          <i className="fas fa-brain text-[10px] mr-2" aria-hidden="true" />Skill Training
        </p>
        <p className="text-[11px] text-parchment-faint mt-1">
          Allocate training points to boost skill modifiers. Ranks add directly to your stat modifier.
        </p>
      </div>

      <PointsBanner label="Available Skill Points" remaining={remainingSkillPoints} />

      <div className="max-h-[52dvh] overflow-y-auto pr-1 space-y-2 v2-scrollbar">
        {[...SKILLS_LIST]
          .sort((a, b) => {
            const aRec = recommended.includes(a.label) ? -1 : 0;
            const bRec = recommended.includes(b.label) ? -1 : 0;
            return aRec - bRec;
          })
          .map(skill => {
            const rank = allocatedSkills[skill.name] || 0;
            const statVal = stats[skill.stat] + (asiMap[skill.stat] || 0);
            const totalMod = getMod(statVal) + rank;
            return (
              <div
                key={skill.name}
                className="flex items-center gap-3 bg-obsidian-900/70 border border-white/[0.06] rounded-xl p-2.5 hover:border-white/[0.12] transition-colors"
              >
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-bold text-parchment">{skill.label}</span>
                    {recommended.includes(skill.label) && (
                      <Chip color="ember" className="text-[8px] px-1.5 py-0">Recommended</Chip>
                    )}
                    <Chip className="text-[8px] px-1.5 py-0 font-mono uppercase">{skill.stat}</Chip>
                  </div>
                  <span className="text-[10px] text-parchment-faint line-clamp-1">{skill.description}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <ForgeAdjBtn
                    onClick={() => { if (rank > 0) updateWizard({ allocatedSkills: { ...allocatedSkills, [skill.name]: rank - 1 } }); }}
                    disabled={rank <= 0}
                    icon="minus"
                  />
                  <div className="w-7 text-center">
                    <span className={cx('text-sm font-bold font-mono', rank > 0 ? 'text-verdant-400' : 'text-parchment-dim')}>{rank}</span>
                  </div>
                  <ForgeAdjBtn
                    onClick={() => { if (remainingSkillPoints > 0 && rank < 20) updateWizard({ allocatedSkills: { ...allocatedSkills, [skill.name]: rank + 1 } }); }}
                    disabled={remainingSkillPoints <= 0 || rank >= 20}
                    icon="plus"
                  />
                </div>
                <div className="w-14 text-right shrink-0">
                  <span className={cx('text-xs font-mono font-bold', totalMod >= 0 ? 'text-verdant-400' : 'text-blood-400')}>
                    {totalMod >= 0 ? '+' : ''}{totalMod}
                  </span>
                  <span className="text-[9px] text-parchment-faint block">(Rank {rank})</span>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
};

export default SkillsStepV2;
