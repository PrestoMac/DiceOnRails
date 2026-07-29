import React from 'react';
import { StepProps } from './types';
import { CLASSES_CATALOG } from '../../utils/classes';
import { StepH, NavBtn } from './SharedComponents';
import Tooltip from '../ui/Tooltip';
import { getClassAssessment } from './classRaceAssessment';

const CLASSES = CLASSES_CATALOG;

/** Class selection step of the character creation wizard. Displays available classes with their features, starting equipment, and handles subclass routing for classes with subclass at level 1. */
const ClassStep: React.FC<StepProps> = ({ wizardState, updateWizard, onNext }) => {
  const { selectedClass } = wizardState;
  const stepCls = "space-y-6 animate-in fade-in duration-500";

  const showSubclassInline = selectedClass.subclassLevel === 1;
  const selectedAssessment = getClassAssessment(selectedClass.id);

  return (
    <div className={stepCls}>
      <StepH>Select Calling</StepH>
      <div className="grid grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
        {CLASSES.map(cls => {
          const { status, reason } = getClassAssessment(cls.id);
          const isDisabled = status === 'disabled';
          const isSelected = selectedClass.name === cls.name;
          return (
            <div
              key={cls.name}
              onClick={() => {
                if (isDisabled) return;
                updateWizard({
                  selectedClass: cls,
                  selectedSubclassId: null,
                  draconicAncestry: cls.id !== 'sorcerer' ? null : wizardState.draconicAncestry,
                  selectedSpells: [],
                  selectedCantrips: [],
                });
              }}
              className={`relative p-4 rounded-xl border-2 text-left transition-all ${isSelected && isDisabled ? 'border-red-900/50 bg-red-950/10' : isSelected ? 'border-amber-600 bg-amber-900/10' : 'border-stone-800 bg-stone-900/40 hover:border-stone-600'} ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
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
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-stone-800 flex items-center justify-center text-amber-600 shrink-0">
                  <i className={`fas ${cls.icon} text-lg`}></i>
                </div>
                <div>
                  <h3 className="font-bold text-base text-stone-100">{cls.name}</h3>
                  <p className="text-[10px] text-stone-500 uppercase tracking-tighter">
                    <Tooltip content="The primary stat governs attack rolls, spell DC, and class features. Boost this stat first when assigning ability scores." side="top">
                      <span>Primary: {cls.primaryStat}</span>
                    </Tooltip>
                  </p>
                </div>
              </div>
              {isSelected && cls.features && (
                <ul className="mt-1 space-y-1 border-t border-stone-800 pt-2">
                  {cls.features.slice(0, 3).map((f: { id: string; name: string; description: string }) => (
                    <li key={f.id} className="text-[10px] text-stone-400 flex items-start gap-1">
                      <i className="fas fa-star text-amber-700 text-[8px] mt-0.5 shrink-0"></i>
                      <span><strong className="text-stone-300">{f.name}:</strong> {f.description}</span>
                    </li>
                  ))}
                  {cls.features.length > 3 && (
                    <li className="text-[9px] text-stone-600 italic pl-3">
                      ...and {cls.features.length - 3} more features
                    </li>
                  )}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {selectedAssessment.status === 'disabled' && (
        <p className="text-[10px] text-red-500/70 text-center">The currently selected calling has been temporarily disabled. Please choose a different calling.</p>
      )}
      {selectedClass.startingEquipment && selectedClass.startingEquipment.length > 0 && (
        <div className="bg-stone-950/60 border border-stone-800 rounded-lg p-3 text-xs">
          <p className="text-[9px] uppercase font-bold text-stone-500 tracking-wider mb-1.5">
            <i className="fas fa-backpack text-amber-700 mr-1"></i>
            Starting Equipment Included:
          </p>
          <div className="flex flex-wrap gap-1">
            {selectedClass.startingEquipment.map((item: string) => (
              <span key={item} className="text-[10px] text-stone-300 bg-stone-900 border border-stone-850 px-2 py-0.5 rounded capitalize">
                {item}
              </span>
            ))}
            <span className="text-[10px] text-stone-300 bg-stone-900 border border-stone-850 px-2 py-0.5 rounded">
              Explorer's Pack
            </span>
          </div>
        </div>
      )}
      <NavBtn disabled={selectedAssessment.status === 'disabled'} onClick={onNext}>
        {showSubclassInline ? 'Choose Path' : 'Shape Attributes'}
      </NavBtn>
    </div>
  );
};

export default ClassStep;
