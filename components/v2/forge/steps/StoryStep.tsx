import React from 'react';
import Card, { SectionHeader } from '../../primitives/Card';
import Chip from '../../primitives/Chip';
import Tooltip from '../../primitives/Tooltip';
import { TextArea } from '../../primitives/Field';
import { cx } from '../../primitives/cx';
import PersonaField from '../../../shared/PersonaField';
import {
  BACKGROUNDS_CATALOG,
  ALIGNMENTS,
  getBackgroundDef,
  getAlignmentDef,
} from '../../../../utils/backgrounds';
import type { IdealEntry } from '../../../../data/backgrounds';
import type { ForgeStepProps } from '../forgeTypes';

export type StoryStepProps = ForgeStepProps;

const MAX_PERSONALITY = 2;
const MAX_SINGLE = 1;

/**
 * Forge step 9: background & persona — port of the legacy BackgroundStep.
 * Entirely optional; backgrounds are narrative-only (no mechanical benefits).
 * Reuses the theme-neutral shared PersonaField inside v2 Cards.
 */
const StoryStep: React.FC<StoryStepProps> = ({ wizard, updateWizard }) => {
  const { background, alignment, personalityTraits, ideals, bonds, flaws, appearance, backstory } = wizard;
  const bgDef = getBackgroundDef(background);
  const idealTexts: string[] = bgDef ? bgDef.ideals.map((i: IdealEntry) => i.text) : [];

  return (
    <div className="space-y-5">
      <div>
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-400/90">
          <i className="fas fa-book-open text-[10px] mr-2" aria-hidden="true" />Forge Your Persona
        </p>
        <p className="text-[11px] text-parchment-faint mt-1">
          Choose a background, alignment, and the traits that make your character who they are.{' '}
          <span className="text-parchment-faint/70">All optional.</span>
        </p>
      </div>

      {/* Background selection */}
      <section>
        <SectionHeader icon="fa-scroll">Background</SectionHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[38dvh] overflow-y-auto v2-scrollbar pr-1">
          {BACKGROUNDS_CATALOG.map(bg => (
            <button
              key={bg.id}
              type="button"
              onClick={() => updateWizard({ background: background === bg.id ? '' : bg.id })}
              className={cx(
                'p-3 rounded-xl border text-left transition-all cursor-pointer',
                background === bg.id
                  ? 'border-ember-500/60 bg-ember-500/[0.08]'
                  : 'border-white/[0.06] bg-obsidian-900/70 hover:border-white/20',
              )}
            >
              <h3 className="font-bold text-sm text-parchment">{bg.name}</h3>
              <p className="text-[10px] text-parchment-faint italic mt-0.5 line-clamp-2">{bg.description}</p>
            </button>
          ))}
        </div>
        {bgDef && (
          <Card accent="ember" className="mt-2">
            <div className="flex items-center gap-2">
              <Chip color="ember" className="text-[8px] uppercase">Roleplay Feature</Chip>
              <p className="text-xs font-bold text-ember-300">{bgDef.feature.name}</p>
            </div>
            <p className="text-[11px] text-parchment-mute mt-1.5 leading-relaxed">{bgDef.feature.description}</p>
          </Card>
        )}
      </section>

      {/* Alignment — 3x3 grid */}
      <section>
        <SectionHeader icon="fa-compass">Alignment</SectionHeader>
        <div className="grid grid-cols-3 gap-1.5">
          {ALIGNMENTS.map(a => {
            const def = getAlignmentDef(a.id);
            const active = alignment === a.id;
            return (
              <Tooltip key={a.id} content={def?.description || a.name} side="top" className="block">
                <button
                  type="button"
                  onClick={() => updateWizard({ alignment: active ? '' : a.id })}
                  className={cx(
                    'w-full py-2 px-1 rounded-lg border text-center transition-all cursor-pointer',
                    active
                      ? 'border-ember-500/60 bg-ember-500/10'
                      : 'border-white/[0.06] bg-obsidian-900/70 hover:border-white/20',
                  )}
                >
                  <div className="text-[10px] font-bold text-parchment">{a.short}</div>
                  <div className="text-[8px] text-parchment-faint leading-tight">{a.name.replace(/ (Good|Neutral|Evil)/, '')}</div>
                </button>
              </Tooltip>
            );
          })}
        </div>
        {alignment && (
          <p className="text-[10px] text-ember-400/80 italic mt-2 text-center">{getAlignmentDef(alignment)?.description}</p>
        )}
      </section>

      {/* Rollable SRD trait tables (shared PersonaField reused inside v2 Cards) */}
      <section className="space-y-2">
        <SectionHeader icon="fa-masks-theater">Personality &amp; Backstory</SectionHeader>
        {bgDef ? (
          <>
            <Card><PersonaField title="Personality Traits" hint={`SRD suggests ${MAX_PERSONALITY}`} dieSize={8} values={personalityTraits} table={bgDef.personalityTraits} onChange={v => updateWizard({ personalityTraits: v })} max={MAX_PERSONALITY} /></Card>
            <Card><PersonaField title="Ideals" hint="What drives you" dieSize={6} values={ideals} table={idealTexts} onChange={v => updateWizard({ ideals: v })} max={MAX_SINGLE} /></Card>
            <Card><PersonaField title="Bonds" hint="Your ties to the world" dieSize={6} values={bonds} table={bgDef.bonds} onChange={v => updateWizard({ bonds: v })} max={MAX_SINGLE} /></Card>
            <Card><PersonaField title="Flaws" hint="Your weakness" dieSize={6} values={flaws} table={bgDef.flaws} onChange={v => updateWizard({ flaws: v })} max={MAX_SINGLE} /></Card>
          </>
        ) : (
          <Card className="space-y-2">
            <p className="text-[11px] text-parchment-faint text-center">
              Select a background above to unlock its SRD trait tables, or write your own below.
            </p>
            <PersonaField title="Personality Traits" hint="Custom" dieSize={0} values={personalityTraits} table={[]} onChange={v => updateWizard({ personalityTraits: v })} max={MAX_PERSONALITY} />
            <PersonaField title="Ideals" hint="Custom" dieSize={0} values={ideals} table={[]} onChange={v => updateWizard({ ideals: v })} max={MAX_SINGLE} />
            <PersonaField title="Bonds" hint="Custom" dieSize={0} values={bonds} table={[]} onChange={v => updateWizard({ bonds: v })} max={MAX_SINGLE} />
            <PersonaField title="Flaws" hint="Custom" dieSize={0} values={flaws} table={[]} onChange={v => updateWizard({ flaws: v })} max={MAX_SINGLE} />
          </Card>
        )}
      </section>

      <TextArea
        label="Appearance (optional)"
        value={appearance}
        onChange={v => updateWizard({ appearance: v })}
        rows={2}
        maxLength={300}
        showCount
        placeholder="Physical description — build, eyes, scars, dress..."
      />
      <TextArea
        label="Backstory (optional)"
        value={backstory}
        onChange={v => updateWizard({ backstory: v })}
        rows={3}
        maxLength={500}
        showCount
        placeholder="Where did you come from? What set you on this path? What do you seek?"
      />
    </div>
  );
};

export default StoryStep;
