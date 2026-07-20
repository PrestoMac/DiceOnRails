import React from 'react';
import { CharacterCondition } from '../../types';

interface ConditionsDisplayProps {
  conditions: CharacterCondition[];
}

const CONDITION_INFO: Record<string, { icon: string; summary: string }> = {
  blinded:       { icon: 'fa-eye-slash',        summary: 'Auto-fail sight checks; attacks have disadvantage; attacks against you have advantage.' },
  charmed:       { icon: 'fa-heart',             summary: "Can't attack charmer; charmer has advantage on social checks against you." },
  deafened:      { icon: 'fa-deaf',              summary: 'Auto-fail hearing checks; immune to sonic effects.' },
  frightened:    { icon: 'fa-ghost',             summary: 'Disadvantage on ability checks/attacks while source is in sight; cannot move closer to source.' },
  grappled:      { icon: 'fa-hand-grab',         summary: 'Speed becomes 0.' },
  incapacitated: { icon: 'fa-ban',               summary: "Can't take actions or reactions." },
  invisible:     { icon: 'fa-user-secret',       summary: 'Attacks against you have disadvantage; your attacks have advantage.' },
  paralyzed:     { icon: 'fa-person-falling',    summary: "Incapacitated, can't move or speak; attacks against you have advantage; hits within 5 ft auto-crit." },
  petrified:     { icon: 'fa-cube',              summary: 'Incapacitated, resistant to all damage, immune to poison/disease.' },
  poisoned:      { icon: 'fa-skull-crossbones',  summary: 'Disadvantage on attack rolls and ability checks.' },
  prone:         { icon: 'fa-person-falling',    summary: 'Disadvantage on attacks; melee attacks against you have advantage, ranged have disadvantage.' },
  restrained:    { icon: 'fa-link',              summary: 'Speed 0; attacks against you have advantage; disadvantage on DEX saves.' },
  stunned:       { icon: 'fa-dizzy',             summary: "Incapacitated, can't move; attacks against you have advantage; auto-fail STR/DEX saves." },
  unconscious:   { icon: 'fa-bed',               summary: 'Incapacitated, can\'t move/speak; attacks against you have advantage; hits within 5 ft auto-crit.' },
  bane:          { icon: 'fa-minus-circle',       summary: 'Roll 1d4 and subtract from attack rolls and saving throws.' },
  bless:         { icon: 'fa-plus-circle',        summary: 'Roll 1d4 and add to attack rolls and saving throws.' },
};

const ConditionsDisplay: React.FC<ConditionsDisplayProps> = ({ conditions }) => {
  if (!conditions.length) return null;

  return (
    <div className="bg-red-950/20 border border-red-800/30 p-3 rounded-lg mt-2">
      <p className="text-[10px] uppercase font-bold text-red-400 tracking-widest flex items-center gap-1.5 mb-2">
        <i className="fas fa-exclamation-triangle text-[10px]"></i> Active Conditions
      </p>
      <div className="flex flex-col gap-1.5">
        {conditions.map(c => {
          const info = CONDITION_INFO[c.id];
          return (
            <div key={`${c.id}-${c.source}`} className="bg-red-900/20 border border-red-800/20 rounded px-2 py-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <i className={`fas ${info?.icon ?? 'fa-circle'} text-red-400 text-[10px]`}></i>
                  <span className="text-xs font-bold text-red-300 capitalize">{c.id}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {c.saveEnd && c.saveDC && c.saveDC > 0 && (
                    <span className="text-[9px] font-mono text-amber-500 bg-amber-950/30 px-1 rounded">DC {c.saveDC} {c.saveEnd.toUpperCase()}</span>
                  )}
                  {c.duration != null && (
                    <span className="text-[9px] font-mono text-stone-500">{c.duration}r left</span>
                  )}
                </div>
              </div>
              {info && (
                <p className="text-[9px] text-stone-500 mt-0.5 leading-relaxed">{info.summary}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ConditionsDisplay;
