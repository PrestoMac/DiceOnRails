import React from 'react';
import { WizardState } from './types';
import { StepH } from './SharedComponents';

/** Props for the starting grounds selection step on new campaigns. */
interface StartingGroundsStepProps {
  wizardState: WizardState;
  updateWizard: (updates: Partial<WizardState>) => void;
  onFinalize: () => void;
  onReroll: () => void;
}

/** Starting grounds selection step. Displays AI-generated location options with images, descriptions, and an intro hook. */
const StartingGroundsStep: React.FC<StartingGroundsStepProps> = ({
  wizardState, updateWizard, onFinalize, onReroll,
}) => {
  const { generatedLocations, selectedLocation, isGeneratingLocs, isRerolling } = wizardState;
  const stepCls = "space-y-6 animate-in fade-in duration-500";

  return (
    <div className={`${stepCls} text-center`}>
      <StepH>Choose Your Starting Grounds</StepH>
      {isGeneratingLocs ? (
        <div className="space-y-4 py-12">
          <i className="fas fa-dice-d20 text-6xl text-amber-500 animate-spin"></i>
          <p className="text-stone-400 text-sm">Summoning possible starting grounds...</p>
        </div>
      ) : generatedLocations.length === 0 ? (
        <div className="space-y-4 py-12">
          <p className="text-stone-500">Failed to generate locations. Try again.</p>
          <button onClick={onReroll} className="px-6 py-3 bg-amber-700 hover:bg-amber-600 rounded-lg font-bold text-white transition-all uppercase tracking-widest text-xs">Retry</button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {generatedLocations.map((loc, idx) => (
              <button
                key={idx}
                onClick={() => updateWizard({ selectedLocation: loc })}
                className={`p-3 rounded-xl border-2 text-left transition-all ${selectedLocation?.name === loc.name ? 'border-amber-600 bg-amber-900/10' : 'border-stone-800 bg-stone-900/40 hover:border-stone-600'}`}
              >
                <h3 className="font-bold text-sm text-stone-100">{loc.name}</h3>
                <p className="text-[10px] text-stone-500 mt-1 line-clamp-2">{loc.description}</p>
              </button>
            ))}
          </div>
          {selectedLocation && (
            <div className="bg-stone-950 rounded-xl border border-stone-800 overflow-hidden mb-4">
              {selectedLocation.atmosphereUrl ? (
                <img src={selectedLocation.atmosphereUrl} alt={selectedLocation.name} className="w-full h-40 object-cover" />
              ) : (
                <div className="w-full h-40 bg-stone-900 flex items-center justify-center">
                  <i className="fas fa-image text-stone-700 text-3xl"></i>
                </div>
              )}
              <div className="p-4 text-left">
                <h3 className="fantasy-font text-lg text-amber-400">{selectedLocation.name}</h3>
                <p className="text-xs text-stone-400 mt-2 leading-relaxed">{selectedLocation.description}</p>
                {selectedLocation.introHook && (
                  <blockquote className="mt-3 border-l-2 border-amber-700 pl-3 italic text-[11px] text-amber-300/70 leading-relaxed">
                    &ldquo;{selectedLocation.introHook}&rdquo;
                  </blockquote>
                )}
              </div>
            </div>
          )}
          <button
            onClick={onReroll}
            disabled={isRerolling}
            className="w-full py-3 bg-stone-800 hover:bg-stone-700 disabled:opacity-40 rounded-lg font-bold text-stone-400 transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-2 border border-stone-700 mb-3"
          >
            <i className="fas fa-dice-d20"></i> Reroll Starting Grounds
          </button>
          <button
            onClick={onFinalize}
            disabled={!selectedLocation}
            className="w-full py-4 bg-green-800 hover:bg-green-700 disabled:opacity-30 rounded-lg font-bold text-white transition-all uppercase tracking-widest shadow-xl shadow-green-900/20 text-xs"
          >
            Begin Your Chronicle
          </button>
        </>
      )}
    </div>
  );
};

export default StartingGroundsStep;
