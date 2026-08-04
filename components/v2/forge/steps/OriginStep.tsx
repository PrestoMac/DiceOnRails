import React from 'react';
import Tooltip from '../../primitives/Tooltip';
import Card, { SectionHeader } from '../../primitives/Card';
import { cx } from '../../primitives/cx';
import { RACES_CATALOG } from '../../../../utils/races';
import { STAT_INFO } from '../../../../data/referenceConstants';
import { getRaceAssessment } from '../../../creation/classRaceAssessment';
import { AssessmentBadge, DragonColorPicker, TraitDetails } from '../forgeWidgets';
import type { ForgeStepProps } from '../forgeTypes';

export type OriginStepProps = ForgeStepProps;

/** Forge step 2: lineage (race) + subrace selection (ported from the legacy RaceStep). */
const OriginStep: React.FC<OriginStepProps> = ({ wizard, updateWizard }) => {
  const { selectedRace, draconicAncestry } = wizard;

  return (
    <div className="space-y-5">
      <SectionHeader icon="fa-users">Choose Lineage</SectionHeader>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {RACES_CATALOG.map(race => {
          const { status, reason } = getRaceAssessment(race.id);
          const isDisabled = status === 'disabled';
          const isSelected = selectedRace.id === race.id;
          return (
            <button
              key={race.id}
              type="button"
              disabled={isDisabled}
              onClick={() => {
                if (isDisabled) return;
                updateWizard({
                  selectedRace: race,
                  selectedSubraceId: null,
                  ...(race.id !== 'dragonborn' ? { draconicAncestry: null } : {}),
                });
              }}
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
              <h3 className="font-display font-bold text-base text-parchment tracking-wide pr-7">{race.name}</h3>
              <p className="text-xs text-parchment-faint italic mt-1">{race.description}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {typeof race.asi === 'object'
                  ? Object.entries(race.asi).map(([s, v]) => {
                      const info = STAT_INFO[s];
                      const tip = info ? `${info.label}: ${info.governs}` : s.toUpperCase();
                      return (
                        <Tooltip key={s} content={tip} side="top">
                          <span className="text-[9px] uppercase font-bold text-ember-400 bg-ember-500/10 border border-ember-500/25 px-1.5 py-0.5 rounded">
                            +{v} {s}
                          </span>
                        </Tooltip>
                      );
                    })
                  : (
                    <Tooltip content="Half-Elf flexible ASI: +2 CHA and choose two additional stats for +1 each." side="top">
                      <span className="text-[9px] uppercase font-bold text-ember-400 bg-ember-500/10 border border-ember-500/25 px-1.5 py-0.5 rounded">
                        +2 CHA, +1 flex
                      </span>
                    </Tooltip>
                  )}
              </div>
              {race.traits && race.traits.length > 0 && (
                <TraitDetails traits={race.traits} summary="View Traits" />
              )}
            </button>
          );
        })}
      </div>

      {selectedRace.id === 'dragonborn' && (
        <DragonColorPicker
          selected={draconicAncestry}
          onSelect={id => updateWizard({ draconicAncestry: id })}
          flavor="race"
        />
      )}

      {selectedRace.subraces && selectedRace.subraces.length > 0 && (
        <Card accent="arcane">
          <SectionHeader icon="fa-users-viewfinder">Choose Subrace</SectionHeader>
          <div className="grid grid-cols-1 gap-2">
            {selectedRace.subraces.map(sr => {
              const isSelected = wizard.selectedSubraceId === sr.id;
              return (
                <button
                  key={sr.id}
                  type="button"
                  onClick={() => updateWizard({ selectedSubraceId: sr.id })}
                  className={cx(
                    'text-left p-3 rounded-lg border text-xs transition-all cursor-pointer',
                    isSelected
                      ? 'border-arcane-500/60 bg-arcane-500/10 text-arcane-200'
                      : 'border-white/[0.08] bg-obsidian-900/60 text-parchment-dim hover:border-white/20',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">{sr.name}</span>
                    {sr.asi && (
                      <span className="text-[9px] text-arcane-300 font-bold shrink-0">
                        {Object.entries(sr.asi).filter(([, v]) => (v ?? 0) > 0).map(([s, v]) => `+${v} ${s}`).join(', ')}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-parchment-faint mt-0.5">{sr.description}</p>
                  {sr.traits && sr.traits.length > 0 && (
                    <p className="text-[9px] text-parchment-faint mt-1">
                      Traits: {sr.traits.map(t => t.name).join(', ')}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
};

export default OriginStep;
