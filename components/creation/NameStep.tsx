import React from 'react';
import { StepProps } from './types';
import { StepH, NavBtn } from './SharedComponents';
import { ASI_LEVELS } from '../../constants';
import Tooltip from '../ui/Tooltip';

/** Name and starting level step. Captures the character name, backstory, and starting level with ASI slot preview. */
const NameStep: React.FC<StepProps> = ({ wizardState, updateWizard, onNext }) => {
  const { name, level, backstory } = wizardState;
  const stepCls = "space-y-6 animate-in fade-in duration-500";

  return (
    <div className={stepCls}>
      <StepH>Identify Yourself</StepH>
      <div className="space-y-4">
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold text-stone-500 tracking-widest">Name</label>
          <input
            autoFocus
            value={name}
            onChange={e => updateWizard({ name: e.target.value })}
            className="w-full bg-stone-950 border border-stone-800 rounded-lg p-4 text-2xl text-center fantasy-font focus:border-amber-600 outline-none"
            placeholder="Character Name..."
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase font-bold text-stone-500 tracking-widest">Starting Level</label>
          <div className="flex items-center gap-4 bg-stone-950 border border-stone-800 rounded-lg p-2">
            <button onClick={() => updateWizard({ level: Math.max(1, level - 1) })} className="w-12 h-12 flex items-center justify-center text-amber-600 hover:bg-stone-900 rounded"><i className="fas fa-minus"></i></button>
            <div className="flex-1 text-center text-3xl font-bold fantasy-font">{level}</div>
            <button onClick={() => updateWizard({ level: Math.min(20, level + 1) })} className="w-12 h-12 flex items-center justify-center text-amber-600 hover:bg-stone-900 rounded"><i className="fas fa-plus"></i></button>
          </div>
          {level >= 11 && (
            <div className="flex items-start gap-2 bg-amber-950/20 border border-amber-900/30 rounded-lg p-2.5 text-[10px] text-amber-300">
              <i className="fas fa-exclamation-triangle text-amber-500 mt-0.5 shrink-0"></i>
              <span>
                <strong>High-Level Character:</strong> Level {level} grants{' '}
                {ASI_LEVELS.filter(l => l <= level).length} ASI/Feat slots and unlocks advanced class features.
                Recommended for experienced players.
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-[10px] uppercase font-bold text-stone-500 tracking-widest">
          Backstory <span className="text-stone-700 normal-case">(optional)</span>
        </label>
        <textarea
          value={backstory}
          onChange={e => updateWizard({ backstory: e.target.value })}
          rows={3}
          maxLength={500}
          className="w-full bg-stone-950 border border-stone-800 rounded-lg p-3 text-xs text-stone-300 focus:border-amber-600 outline-none resize-none placeholder-stone-700"
          placeholder="A few words about your character's history, personality, or goals..."
        />
        <p className="text-[9px] text-stone-700 text-right">{backstory.length}/500</p>
      </div>
      <div className="flex gap-4 text-[10px] text-stone-400 justify-center flex-wrap">
        <Tooltip content="Proficiency Bonus is added to attack rolls, saving throws, and skill checks you are trained in. Scales with level: +2 at L1, +3 at L5, +4 at L9, +5 at L13, +6 at L17." side="top">
          <span>
            <i className="fas fa-shield-alt text-amber-700 mr-1"></i>
            Proficiency Bonus:
            <strong className="text-amber-400 ml-1">+{Math.ceil(level / 4) + 1}</strong>
          </span>
        </Tooltip>
        <Tooltip content="ASI/Feat slots are milestones (levels 4, 8, 12, 16, 19) where you can either increase ability scores (+1 to two stats, or +2 to one) OR take a feat instead. Level 1 grants one starting slot under the variant rule." side="top">
          <span>
            <i className="fas fa-star text-amber-700 mr-1"></i>
            ASI Slots at Level {level}:
            <strong className="text-amber-400 ml-1">{ASI_LEVELS.filter(l => l <= level).length}</strong>
          </span>
        </Tooltip>
      </div>
      <NavBtn disabled={!name.trim()} onClick={onNext}>Set Destiny</NavBtn>
    </div>
  );
};

export default NameStep;
