import React from 'react';
import { StepProps } from './types';
import { RACES_CATALOG } from '../../utils/races';
import { StepH, NavBtn, DragonColorPicker } from './SharedComponents';
import Tooltip from '../ui/Tooltip';
import { STAT_INFO } from '../../data/referenceConstants';
import { getRaceAssessment } from './classRaceAssessment';

const RACES = RACES_CATALOG;

/** Race/lineage selection step. Displays available races with ASI bonuses, racial traits, and draconic ancestry picker for Dragonborn. */
const RaceStep: React.FC<StepProps> = ({ wizardState, updateWizard, onNext }) => {
  const { selectedRace, draconicAncestry } = wizardState;
  const stepCls = "space-y-6 animate-in fade-in duration-500";
  const selectedAssessment = getRaceAssessment(selectedRace.id);
  const continueDisabled = (selectedRace.id === 'dragonborn' && !draconicAncestry) || selectedAssessment.status === 'disabled';

  return (
    <div className={stepCls}>
      <StepH>Choose Lineage</StepH>
      <div className="grid grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
        {RACES.map(race => {
          const { status, reason } = getRaceAssessment(race.id);
          const isDisabled = status === 'disabled';
          const isSelected = selectedRace.name === race.name;
          return (
            <button
              key={race.name}
              disabled={isDisabled}
              onClick={() => {
                if (isDisabled) return;
                updateWizard({ selectedRace: race, selectedSubraceId: null });
                if (race.id !== 'dragonborn') updateWizard({ draconicAncestry: null });
              }}
              className={`relative p-4 rounded-xl border-2 text-left transition-all ${isSelected && isDisabled ? 'border-red-900/50 bg-red-950/10' : isSelected ? 'border-amber-600 bg-amber-900/10' : 'border-stone-800 bg-stone-900/40 hover:border-stone-600'} ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <div className="absolute top-2 right-2">
                <Tooltip content={reason} side="top" maxWidth={320}>
                  {status === 'disabled' ? (
                    <i className="fas fa-ban text-red-500/70 text-sm" />
                  ) : status === 'warning' ? (
                    <i className="fas fa-triangle-exclamation text-amber-500/80 text-sm" />
                  ) : (
                    <i className="fas fa-circle-check text-emerald-500/70 text-sm" />
                  )}
                </Tooltip>
              </div>
              <h3 className="font-bold text-lg text-stone-100">{race.name}</h3>
            <p className="text-xs text-stone-500 italic mt-1">{race.description}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {typeof race.asi === 'object'
                ? Object.entries(race.asi).map(([s, v]) => {
                    const info = STAT_INFO[s];
                    const tip = info ? `${info.label}: ${info.governs}` : s.toUpperCase();
                    return (
                      <Tooltip key={s} content={tip} side="top">
                        <span className="text-[9px] uppercase font-bold text-amber-700 bg-amber-950/20 px-1 rounded">+{v} {s}</span>
                      </Tooltip>
                    );
                  })
                : <Tooltip content="Half-Elf flexible ASI: +2 CHA and choose two additional stats for +1 each." side="top">
                    <span className="text-[9px] uppercase font-bold text-amber-700 bg-amber-950/20 px-1 rounded">+2 CHA, +1 flex</span>
                  </Tooltip>
              }
            </div>
            {race.traits && race.traits.length > 0 && (
              <details className="mt-2" onClick={e => e.stopPropagation()}>
                <summary className="text-[9px] uppercase text-amber-700 cursor-pointer font-bold tracking-wider">
                  View Traits ({race.traits.length})
                </summary>
                <ul className="mt-1.5 space-y-1">
                  {race.traits.map((trait: { id: string; name: string; description: string }) => (
                    <li key={trait.id} className="text-[9px] text-stone-400">
                      <strong className="text-stone-300">{trait.name}:</strong> {trait.description}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </button>
        );
      })}
      </div>
      {selectedRace.id === 'dragonborn' && (
        <DragonColorPicker
          selected={draconicAncestry}
          onSelect={(id) => updateWizard({ draconicAncestry: id })}
          flavor="race"
        />
      )}
      {/* Subrace picker — shown when the selected race has subraces */}
      {selectedRace.subraces && selectedRace.subraces.length > 0 && (
        <div className="bg-amber-950/20 border border-amber-800/50 rounded-lg p-3">
          <p className="text-xs font-bold text-amber-400 mb-2">
            <i className="fas fa-users mr-1"></i>Choose Subrace
          </p>
          <div className="grid grid-cols-1 gap-2">
            {selectedRace.subraces.map(sr => {
              const isSelected = wizardState.selectedSubraceId === sr.id;
              return (
                <button
                  key={sr.id}
                  onClick={() => updateWizard({ selectedSubraceId: sr.id })}
                  className={`text-left p-2 rounded-lg border text-xs transition-all ${
                    isSelected
                      ? 'border-amber-500 bg-amber-900/30 text-amber-200'
                      : 'border-stone-700 bg-stone-900/40 text-stone-400 hover:border-stone-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{sr.name}</span>
                    {sr.asi && (
                      <span className="text-[9px] text-amber-700 font-bold">
                        {Object.entries(sr.asi).map(([s, v]) => `+${v} ${s}`).join(', ')}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-stone-500 mt-0.5">{sr.description}</p>
                  {sr.traits && sr.traits.length > 0 && (
                    <p className="text-[9px] text-stone-600 mt-1">
                      Traits: {sr.traits.map(t => t.name).join(', ')}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {selectedAssessment.status === 'disabled' && (
        <p className="text-[10px] text-red-500/70 text-center">The currently selected lineage has been temporarily disabled. Please choose a different lineage.</p>
      )}
      <NavBtn
        disabled={continueDisabled}
        onClick={onNext}
      >
        Continue
      </NavBtn>
    </div>
  );
};

export default RaceStep;
