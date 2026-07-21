import React from 'react';
import { StepProps } from './types';
import { RACES_CATALOG } from '../../utils/races';
import { StepH, NavBtn, DragonColorPicker } from './SharedComponents';
import Tooltip from '../ui/Tooltip';
import { STAT_INFO } from '../../data/referenceConstants';

const RACES = RACES_CATALOG;

/** Race/lineage selection step. Displays available races with ASI bonuses, racial traits, and draconic ancestry picker for Dragonborn. */
const RaceStep: React.FC<StepProps> = ({ wizardState, updateWizard, onNext }) => {
  const { selectedRace, draconicAncestry } = wizardState;
  const stepCls = "space-y-6 animate-in fade-in duration-500";

  return (
    <div className={stepCls}>
      <StepH>Choose Lineage</StepH>
      <div className="grid grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
        {RACES.map(race => (
          <button
            key={race.name}
            onClick={() => {
              updateWizard({ selectedRace: race });
              if (race.id !== 'dragonborn') updateWizard({ draconicAncestry: null });
            }}
            className={`p-4 rounded-xl border-2 text-left transition-all ${selectedRace.name === race.name ? 'border-amber-600 bg-amber-900/10' : 'border-stone-800 bg-stone-900/40 hover:border-stone-600'}`}
          >
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
        ))}
      </div>
      {selectedRace.id === 'dragonborn' && (
        <DragonColorPicker
          selected={draconicAncestry}
          onSelect={(id) => updateWizard({ draconicAncestry: id })}
          flavor="race"
        />
      )}
      <NavBtn
        disabled={selectedRace.id === 'dragonborn' && !draconicAncestry}
        onClick={onNext}
      >
        Continue
      </NavBtn>
    </div>
  );
};

export default RaceStep;
