import React from 'react';
import { StepProps } from './types';
import { StepH, NavBtn } from './SharedComponents';
import Tooltip from '../ui/Tooltip';
import PersonaField from '../shared/PersonaField';
import {
  BACKGROUNDS_CATALOG,
  ALIGNMENTS,
  getBackgroundDef,
  getAlignmentDef,
  IdealEntry,
} from '../../utils/backgrounds';

const MAX_PERSONALITY = 2;
const MAX_SINGLE = 1;

/** Background & persona step. SRD 5.1 backgrounds (narrative-only), alignment grid,
 *  rollable trait tables, appearance, and free-form backstory. Entirely optional. */
const BackgroundStep: React.FC<StepProps> = ({ wizardState, updateWizard, onNext, onBack }) => {
  const { background, alignment, personalityTraits, ideals, bonds, flaws, appearance, backstory } = wizardState;
  const bgDef = getBackgroundDef(background);

  const idealTexts: string[] = bgDef ? bgDef.ideals.map((i: IdealEntry) => i.text) : [];
  const stepCls = 'space-y-6 animate-in fade-in duration-500';

  return (
    <div className={stepCls}>
      <StepH>Forge Your Persona</StepH>
      <p className="text-xs text-stone-400 text-center -mt-3">
        Choose a background, alignment, and the traits that make your character who they are. <span className="text-stone-600">All optional.</span>
      </p>

      {/* Background selection — card grid mirroring RaceStep */}
      <div>
        <p className="text-[10px] uppercase font-bold text-stone-500 tracking-widest mb-2">Background</p>
        <div className="grid grid-cols-2 gap-2 max-h-[38vh] overflow-y-auto custom-scrollbar pr-1">
          {BACKGROUNDS_CATALOG.map(bg => (
            <button
              key={bg.id}
              type="button"
              onClick={() => updateWizard({ background: background === bg.id ? '' : bg.id })}
              className={`p-3 rounded-xl border-2 text-left transition-all ${background === bg.id ? 'border-amber-600 bg-amber-900/10' : 'border-stone-800 bg-stone-900/40 hover:border-stone-600'}`}
            >
              <h3 className="font-bold text-sm text-stone-100">{bg.name}</h3>
              <p className="text-[10px] text-stone-500 italic mt-0.5 line-clamp-2">{bg.description}</p>
            </button>
          ))}
        </div>
        {bgDef && (
          <div className="mt-2 bg-amber-950/10 border border-amber-900/30 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <span className="text-[8px] uppercase font-bold text-amber-700 bg-amber-950/30 px-1.5 py-0.5 rounded">Roleplay Feature</span>
              <p className="text-xs font-bold text-amber-400">{bgDef.feature.name}</p>
            </div>
            <p className="text-[10px] text-stone-400 mt-1 leading-relaxed">{bgDef.feature.description}</p>
          </div>
        )}
      </div>

      {/* Alignment — 3x3 grid */}
      <div>
        <p className="text-[10px] uppercase font-bold text-stone-500 tracking-widest mb-2">Alignment</p>
        <div className="grid grid-cols-3 gap-1.5">
          {ALIGNMENTS.map(a => {
            const def = getAlignmentDef(a.id);
            const active = alignment === a.id;
            return (
              <Tooltip key={a.id} content={def?.description || a.name} side="top">
                <button
                  type="button"
                  onClick={() => updateWizard({ alignment: active ? '' : a.id })}
                  className={`py-2 px-1 rounded-lg border-2 text-center transition-all ${active ? 'border-amber-600 bg-amber-900/20' : 'border-stone-800 bg-stone-900/40 hover:border-stone-600'}`}
                >
                  <div className="text-[9px] font-bold text-stone-200">{a.short}</div>
                  <div className="text-[8px] text-stone-500 leading-tight">{a.name.replace(/ (Good|Neutral|Evil)/, '')}</div>
                </button>
              </Tooltip>
            );
          })}
        </div>
        {alignment && (
          <p className="text-[9px] text-amber-700 italic mt-1 text-center">{getAlignmentDef(alignment)?.description}</p>
        )}
      </div>

      {/* Trait tables */}
      <div className="space-y-2">
        <p className="text-[10px] uppercase font-bold text-stone-500 tracking-widest text-center">Personality & Backstory</p>
        {bgDef ? (
          <>
            <PersonaField title="Personality Traits" hint={`SRD suggests ${MAX_PERSONALITY}`} dieSize={8} values={personalityTraits} table={bgDef.personalityTraits} onChange={v => updateWizard({ personalityTraits: v })} max={MAX_PERSONALITY} />
            <PersonaField title="Ideals" hint="What drives you" dieSize={6} values={ideals} table={idealTexts} onChange={v => updateWizard({ ideals: v })} max={MAX_SINGLE} />
            <PersonaField title="Bonds" hint="Your ties to the world" dieSize={6} values={bonds} table={bgDef.bonds} onChange={v => updateWizard({ bonds: v })} max={MAX_SINGLE} />
            <PersonaField title="Flaws" hint="Your weakness" dieSize={6} values={flaws} table={bgDef.flaws} onChange={v => updateWizard({ flaws: v })} max={MAX_SINGLE} />
          </>
        ) : (
          <div className="bg-stone-900/40 border border-stone-800 rounded-lg p-4 text-center">
            <p className="text-[11px] text-stone-500">Select a background above to unlock its SRD trait tables, or write your own below.</p>
            <PersonaField title="Personality Traits" hint="Custom" dieSize={0} values={personalityTraits} table={[]} onChange={v => updateWizard({ personalityTraits: v })} max={MAX_PERSONALITY} />
            <div className="h-2" />
            <PersonaField title="Ideals" hint="Custom" dieSize={0} values={ideals} table={[]} onChange={v => updateWizard({ ideals: v })} max={MAX_SINGLE} />
            <div className="h-2" />
            <PersonaField title="Bonds" hint="Custom" dieSize={0} values={bonds} table={[]} onChange={v => updateWizard({ bonds: v })} max={MAX_SINGLE} />
            <div className="h-2" />
            <PersonaField title="Flaws" hint="Custom" dieSize={0} values={flaws} table={[]} onChange={v => updateWizard({ flaws: v })} max={MAX_SINGLE} />
          </div>
        )}
      </div>

      {/* Appearance */}
      <div className="space-y-1">
        <label className="text-[10px] uppercase font-bold text-stone-500 tracking-widest">Appearance <span className="text-stone-700 normal-case">(optional)</span></label>
        <textarea
          value={appearance}
          onChange={e => updateWizard({ appearance: e.target.value })}
          rows={2}
          maxLength={300}
          className="w-full bg-stone-950 border border-stone-800 rounded-lg p-3 text-xs text-stone-300 focus:border-amber-600 outline-none resize-none placeholder-stone-700"
          placeholder="Physical description — build, eyes, scars, dress..."
        />
        <p className="text-[9px] text-stone-700 text-right">{appearance.length}/300</p>
      </div>

      {/* Backstory */}
      <div className="space-y-1">
        <label className="text-[10px] uppercase font-bold text-stone-500 tracking-widest">Backstory <span className="text-stone-700 normal-case">(optional)</span></label>
        <textarea
          value={backstory}
          onChange={e => updateWizard({ backstory: e.target.value })}
          rows={3}
          maxLength={500}
          className="w-full bg-stone-950 border border-stone-800 rounded-lg p-3 text-xs text-stone-300 focus:border-amber-600 outline-none resize-none placeholder-stone-700"
          placeholder="Where did you come from? What set you on this path? What do you seek?"
        />
        <p className="text-[9px] text-stone-700 text-right">{backstory.length}/500</p>
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="flex-shrink-0 px-6 py-4 bg-stone-800 hover:bg-stone-700 rounded-lg font-bold text-stone-300 transition-all uppercase tracking-widest text-xs">
          <i className="fas fa-arrow-left mr-1"></i>Back
        </button>
        <NavBtn onClick={onNext}>Review Character</NavBtn>
      </div>
    </div>
  );
};

export default BackgroundStep;
