import React from 'react';
import Tooltip from '../../primitives/Tooltip';
import Card, { SectionHeader } from '../../primitives/Card';
import Chip from '../../primitives/Chip';
import { cx } from '../../primitives/cx';
import { CLASSES_CATALOG } from '../../../../utils/classes';
import { INVOCATIONS_CATALOG, getInvocationCount } from '../../../../data/invocations';
import { getClassAssessment } from '../../../creation/classRaceAssessment';
import { AssessmentBadge, DragonColorPicker } from '../forgeWidgets';
import type { ForgeStepProps } from '../forgeTypes';

export type PathStepProps = ForgeStepProps;

/**
 * Forge step 3: calling (class) — merged with the legacy split subclass-early/
 * subclass-late steps. Renders the class grid, then (when the chosen class's
 * subclassLevel is reached at the current level) the subclass picker inline,
 * plus fighting-style and Eldritch Invocation pickers where applicable.
 */
const PathStep: React.FC<PathStepProps> = ({ wizard, updateWizard }) => {
  const { selectedClass, level } = wizard;
  const showSubclass = selectedClass.subclassLevel <= level && selectedClass.subclasses.length > 0;

  // Fighting-style feature (Fighter L1, Paladin L2, Ranger L2) at or below the current level.
  const fsFeature = selectedClass.features.find(
    f => f.effect?.kind === 'fighting-style' && f.level <= level && f.choice,
  );

  /** Class change resets all class-scoped selections (subclass, spells, styles, invocations). */
  const selectClass = (classId: string): void => {
    const cls = CLASSES_CATALOG.find(c => c.id === classId);
    if (!cls) return;
    updateWizard({
      selectedClass: cls,
      selectedSubclassId: null,
      draconicAncestry: cls.id !== 'sorcerer' ? null : wizard.draconicAncestry,
      selectedSpells: [],
      selectedCantrips: [],
      fightingStyleChoice: null,
      invocationChoices: [],
    });
  };

  /** Subclass change; draconic ancestry is cleared unless the pick is draconic-bloodline. */
  const selectSubclass = (id: string): void => {
    updateWizard({
      selectedSubclassId: id,
      draconicAncestry: id !== 'draconic-bloodline' ? null : wizard.draconicAncestry,
    });
  };

  return (
    <div className="space-y-5">
      <SectionHeader icon="fa-compass">Select Calling</SectionHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CLASSES_CATALOG.map(cls => {
          const { status, reason } = getClassAssessment(cls.id);
          const isDisabled = status === 'disabled';
          const isSelected = selectedClass.id === cls.id;
          return (
            <div
              key={cls.id}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!isDisabled) selectClass(cls.id); } }}
              onClick={() => { if (!isDisabled) selectClass(cls.id); }}
              className={cx(
                'relative p-4 rounded-xl border text-left transition-all',
                isSelected && isDisabled
                  ? 'border-blood-500/50 bg-blood-500/[0.06]'
                  : isSelected
                    ? 'border-ember-500/60 bg-ember-500/[0.08]'
                    : 'border-white/[0.06] bg-obsidian-900/70 hover:border-white/20',
                isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
              )}
            >
              <div className="absolute top-2 right-2">
                <AssessmentBadge status={status} reason={reason} />
              </div>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-full bg-obsidian-800 border border-white/[0.08] flex items-center justify-center text-ember-400 shrink-0">
                  <i className={cx('fas', cls.icon, 'text-lg')} aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-base text-parchment tracking-wide">{cls.name}</h3>
                  <p className="text-[10px] text-parchment-faint uppercase tracking-tighter">
                    <Tooltip
                      content="The primary stat governs attack rolls, spell DC, and class features. Boost this stat first when assigning ability scores."
                      side="top"
                    >
                      <span>Primary: {cls.primaryStat}</span>
                    </Tooltip>
                  </p>
                </div>
              </div>
              {isSelected && cls.features && (
                <ul className="mt-1 space-y-1 border-t border-white/[0.06] pt-2">
                  {cls.features.slice(0, 3).map(f => (
                    <li key={f.id} className="text-[10px] text-parchment-mute flex items-start gap-1.5">
                      <i className="fas fa-star text-ember-500 text-[8px] mt-0.5 shrink-0" aria-hidden="true" />
                      <span><strong className="text-parchment-dim">{f.name}:</strong> {f.description}</span>
                    </li>
                  ))}
                  {cls.features.length > 3 && (
                    <li className="text-[9px] text-parchment-faint italic pl-4">
                      ...and {cls.features.length - 3} more features
                    </li>
                  )}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {selectedClass.startingEquipment && selectedClass.startingEquipment.length > 0 && (
        <Card>
          <SectionHeader icon="fa-suitcase">Starting Equipment Included</SectionHeader>
          <div className="flex flex-wrap gap-1.5">
            {selectedClass.startingEquipment.map(item => (
              <Chip key={item} color="neutral" className="capitalize">{item}</Chip>
            ))}
            <Chip color="neutral">Explorer&apos;s Pack</Chip>
          </div>
        </Card>
      )}

      {showSubclass && (
        <Card accent="arcane">
          <SectionHeader icon="fa-code-branch">Choose Your Path</SectionHeader>
          <p className="text-xs text-parchment-mute -mt-1 mb-3">
            Your {selectedClass.name} specialization{selectedClass.subclassLevel > 1 ? ` at level ${selectedClass.subclassLevel}` : ''} defines your unique abilities.
          </p>
          <div className="space-y-2 max-h-[46vh] overflow-y-auto v2-scrollbar pr-1">
            {selectedClass.subclasses.map(sc => {
              const isSelected = wizard.selectedSubclassId === sc.id;
              return (
                <div
                  key={sc.id}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectSubclass(sc.id); } }}
                  onClick={() => selectSubclass(sc.id)}
                  className={cx(
                    'border rounded-lg p-3.5 cursor-pointer transition-all',
                    isSelected
                      ? 'border-arcane-500/60 bg-arcane-500/10'
                      : 'border-white/[0.08] bg-obsidian-900/60 hover:border-white/20',
                  )}
                >
                  <h4 className={cx('font-display font-bold text-sm tracking-wide', isSelected ? 'text-arcane-200' : 'text-parchment')}>{sc.name}</h4>
                  <p className="text-xs text-parchment-mute mt-0.5">{sc.description}</p>
                  <details className="mt-1.5" onClick={e => e.stopPropagation()}>
                    <summary className="text-[10px] uppercase text-arcane-400/90 cursor-pointer font-bold tracking-wider select-none">
                      View features ({sc.features.length})
                    </summary>
                    <ul className="mt-1.5 space-y-1">
                      {sc.features.map(f => (
                        <li key={f.id} className={cx('text-[11px] text-parchment-mute', f.level > level && 'opacity-40')}>
                          <strong className="text-parchment-dim">L{f.level}:</strong> {f.name} &mdash; {f.description}
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {showSubclass && wizard.selectedSubclassId === 'draconic-bloodline' && (
        <DragonColorPicker
          selected={wizard.draconicAncestry}
          onSelect={id => updateWizard({ draconicAncestry: id })}
          flavor="origin"
        />
      )}

      {fsFeature && fsFeature.choice && (
        <Card accent="ember">
          <SectionHeader icon="fa-sword">{fsFeature.choice.label}</SectionHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {fsFeature.choice.options.map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => updateWizard({ fightingStyleChoice: opt.id })}
                className={cx(
                  'text-left p-3 rounded-lg border text-xs transition-all cursor-pointer',
                  wizard.fightingStyleChoice === opt.id
                    ? 'border-ember-500/60 bg-ember-500/10 text-ember-200'
                    : 'border-white/[0.08] bg-obsidian-900/60 text-parchment-dim hover:border-white/20',
                )}
              >
                <span className="font-bold">{opt.label}</span>
                <p className="text-[10px] text-parchment-faint mt-0.5">{opt.description}</p>
              </button>
            ))}
          </div>
        </Card>
      )}

      {selectedClass.id === 'warlock' && level >= 2 && (() => {
        const maxInvocations = getInvocationCount(level);
        const available = INVOCATIONS_CATALOG.filter(i => i.minLevel <= level);
        const selected = wizard.invocationChoices;
        const toggle = (id: string) => {
          if (selected.includes(id)) {
            updateWizard({ invocationChoices: selected.filter(x => x !== id) });
          } else if (selected.length < maxInvocations) {
            updateWizard({ invocationChoices: [...selected, id] });
          }
        };
        return (
          <Card accent="arcane">
            <SectionHeader icon="fa-hand-sparkles">Eldritch Invocations ({selected.length}/{maxInvocations})</SectionHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {available.map(inv => {
                const isSelected = selected.includes(inv.id);
                const isFull = !isSelected && selected.length >= maxInvocations;
                return (
                  <button
                    key={inv.id}
                    type="button"
                    onClick={() => toggle(inv.id)}
                    disabled={isFull}
                    className={cx(
                      'text-left p-3 rounded-lg border text-xs transition-all',
                      isSelected
                        ? 'border-arcane-500/60 bg-arcane-500/10 text-arcane-200 cursor-pointer'
                        : isFull
                          ? 'border-white/[0.04] bg-obsidian-900/30 text-parchment-faint cursor-not-allowed'
                          : 'border-white/[0.08] bg-obsidian-900/60 text-parchment-dim hover:border-white/20 cursor-pointer',
                    )}
                  >
                    <span className="font-bold">{inv.name}</span>
                    {inv.prerequisite && <span className="text-[9px] text-parchment-faint block">Requires: {inv.prerequisite}</span>}
                    <p className="text-[10px] text-parchment-faint mt-0.5">{inv.description}</p>
                  </button>
                );
              })}
            </div>
          </Card>
        );
      })()}
    </div>
  );
};

export default PathStep;
