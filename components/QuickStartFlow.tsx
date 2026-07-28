import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Character, StartingLocation } from '../types';
import { PRESET_CHARACTERS, PresetCharacterSpec } from '../data/presetCharacters';
import { RACES_BY_ID } from '../utils/races';
import { CLASSES_BY_ID } from '../utils/classes';
import { buildPresetCharacter } from '../services/characterCreationService';

interface QuickStartFlowProps {
  onComplete: (character: Character) => void;
  onSetStartingLocation: (location: StartingLocation) => void;
  onSwitchToCustom: () => void;
  /** Optional AbortSignal to cancel an in-flight generation (e.g. when user retries). */
  onGenerateStartingLocations: (charInfo: { name: string; race: string; class: string }, signal?: AbortSignal) => Promise<StartingLocation[]>;
  /** true = host new campaign (preset → starting grounds). false = joining existing party (preset only; campaign starting location is fixed by host). */
  isNewCampaign?: boolean;
  /** When joining, the campaign's existing starting location (for preview + finalization). */
  campaignStartingLocation?: StartingLocation | null;
  /** Campaign name for the joiner banner. */
  campaignName?: string;
}

type Step = 'select' | 'grounds';

const STAT_LABELS: Record<string, string> = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };

/** Stat row with the two highest stats shown as badges. */
const TopStats: React.FC<{ spec: PresetCharacterSpec }> = ({ spec }) => {
  const sorted = Object.entries(spec.stats).sort((a, b) => b[1] - a[1]).slice(0, 2);
  return (
    <div className="flex gap-1.5 justify-center">
      {sorted.map(([key, val]) => (
        <span key={key} className="text-[9px] font-bold text-stone-400 bg-stone-800/60 px-1.5 py-0.5 rounded">{STAT_LABELS[key]} {val}</span>
      ))}
    </div>
  );
};

/** Two-step quick-start flow: (1) pick a preset hero, (2) pick a starting ground. Mirrors the wizard's starting-grounds UI but decoupled from WizardState. */
const QuickStartFlow: React.FC<QuickStartFlowProps> = ({ onComplete, onGenerateStartingLocations, onSetStartingLocation, onSwitchToCustom, isNewCampaign = true, campaignStartingLocation, campaignName }) => {
  const isJoining = !isNewCampaign;
  const [step, setStep] = useState<Step>('select');
  const [selectedSpec, setSelectedSpec] = useState<PresetCharacterSpec | null>(null);
  const [generatedLocations, setGeneratedLocations] = useState<StartingLocation[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<StartingLocation | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genFailed, setGenFailed] = useState(false);
  const generationIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const [showRetry, setShowRetry] = useState(false);

  // After 60s of generating, surface a retry button. Resets when isGenerating toggles.
  useEffect(() => {
    if (!isGenerating) { setShowRetry(false); return; }
    const timer = setTimeout(() => setShowRetry(true), 60000);
    return () => clearTimeout(timer);
  }, [isGenerating]);

  const fetchLocations = useCallback(async (spec: PresetCharacterSpec) => {
    const race = RACES_BY_ID[spec.raceId];
    const cls = CLASSES_BY_ID[spec.classId];
    if (!race || !cls) return;
    setIsGenerating(true);
    setGenFailed(false);
    setShowRetry(false);
    const gid = ++generationIdRef.current;
    const abortController = new AbortController();
    abortRef.current = abortController;
    const charInfo = { name: spec.name, race: race.name, class: cls.name };
    try {
      const locs = await onGenerateStartingLocations(charInfo, abortController.signal);
      if (gid !== generationIdRef.current) return;
      setGeneratedLocations(locs);
      setSelectedLocation(locs.length > 0 ? locs[0] : null);
      setGenFailed(locs.length === 0);
    } catch {
      if (gid !== generationIdRef.current) return;
      setGeneratedLocations([]);
      setSelectedLocation(null);
      setGenFailed(true);
    } finally {
      if (gid === generationIdRef.current) setIsGenerating(false);
    }
  }, [onGenerateStartingLocations]);

  const handleSelectPreset = useCallback((spec: PresetCharacterSpec) => {
    setSelectedSpec(spec);
    // Joiners don't choose a starting ground — the host already picked one.
    // Skip the grounds step entirely and immediately finalize the preset.
    if (isJoining) {
      if (campaignStartingLocation) onSetStartingLocation(campaignStartingLocation);
      const character = buildPresetCharacter(spec);
      onComplete(character);
      return;
    }
    setSelectedLocation(null);
    setGeneratedLocations([]);
    setStep('grounds');
  }, [isJoining, campaignStartingLocation, onSetStartingLocation, onComplete]);

  // Auto-trigger location generation when entering the grounds step.
  useEffect(() => {
    if (step === 'grounds' && selectedSpec && generatedLocations.length === 0 && !isGenerating && !genFailed) {
      void fetchLocations(selectedSpec);
    }
  }, [step, selectedSpec, generatedLocations.length, isGenerating, genFailed, fetchLocations]);

  const handleBack = () => {
    generationIdRef.current++;
    setStep('select');
    setSelectedLocation(null);
    setGeneratedLocations([]);
    setGenFailed(false);
    setIsGenerating(false);
  };

  const handleBegin = () => {
    if (!selectedSpec || !selectedLocation) return;
    onSetStartingLocation(selectedLocation);
    const character = buildPresetCharacter(selectedSpec);
    onComplete(character);
  };

  const raceDef = selectedSpec ? RACES_BY_ID[selectedSpec.raceId] : null;
  const classDef = selectedSpec ? CLASSES_BY_ID[selectedSpec.classId] : null;

  return (
    <div className="fixed inset-0 bg-stone-950 z-50 flex flex-col items-center justify-center p-4 md:p-6 text-stone-200 overflow-y-auto custom-scrollbar">
      <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#444 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
      <div className="relative z-10 w-full max-w-3xl bg-stone-900/40 border border-stone-800 rounded-2xl p-6 md:p-8 backdrop-blur-md shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">

        {/* Step 1: Preset grid */}
        {step === 'select' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="text-center">
              <h2 className="fantasy-font text-3xl text-amber-600 mb-2">{isJoining ? 'Join the Party' : 'Choose Your Hero'}</h2>
              <p className="text-stone-400 text-xs md:text-sm">
                {isJoining
                  ? (campaignName ? `Joining "${campaignName}" — pick a pre-made hero or build your own.` : 'Pick a pre-made hero or build your own to join the party.')
                  : 'Ten pre-made level-1 adventurers. Pick one to begin your journey.'}
              </p>
            </div>
            {isJoining && campaignStartingLocation && (
              <div className="text-center bg-stone-900/60 border border-stone-800 rounded-lg p-3">
                <p className="text-[10px] text-stone-500 uppercase tracking-widest font-bold mb-1">Campaign Starting Ground</p>
                <p className="fantasy-font text-sm text-amber-400">{campaignStartingLocation.name}</p>
                <p className="text-[10px] text-stone-500 mt-1 line-clamp-2">{campaignStartingLocation.description}</p>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {PRESET_CHARACTERS.map((spec) => {
                const race = RACES_BY_ID[spec.raceId];
                const cls = CLASSES_BY_ID[spec.classId];
                if (!race || !cls) return null;
                return (
                  <button
                    key={spec.id}
                    type="button"
                    onClick={() => handleSelectPreset(spec)}
                    className="group flex flex-col items-center text-center p-3 bg-stone-900/50 border-2 border-stone-800 rounded-xl hover:border-amber-600 hover:bg-amber-900/10 transition-all duration-200"
                  >
                    <div className="w-12 h-12 rounded-full bg-stone-800/60 border border-stone-700 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                      <i className={`fas ${cls.icon} text-lg text-amber-500`}></i>
                    </div>
                    <h3 className="fantasy-font text-sm text-stone-100 leading-tight mb-0.5">{spec.name}</h3>
                    <p className="text-[10px] text-amber-600/80 uppercase tracking-wider font-bold mb-1">{race.name} {cls.name}</p>
                    <p className="text-[10px] text-stone-500 leading-snug mb-2 line-clamp-2">{spec.tagline}</p>
                    <TopStats spec={spec} />
                  </button>
                );
              })}
            </div>
            <div className="flex justify-center pt-2">
              <button type="button" onClick={onSwitchToCustom} className="text-[11px] text-stone-500 hover:text-amber-500 uppercase tracking-widest font-bold transition-colors flex items-center gap-2">
                <i className="fas fa-arrow-left text-[9px]"></i> Build a custom character instead
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Starting grounds */}
        {step === 'grounds' && selectedSpec && raceDef && classDef && (
          <div className="space-y-5 animate-in fade-in duration-500">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-stone-800">
              <button type="button" onClick={handleBack} className="text-[11px] text-stone-400 hover:text-amber-500 uppercase tracking-widest font-bold transition-colors flex items-center gap-1.5">
                <i className="fas fa-arrow-left text-[9px]"></i> Back
              </button>
              <div className="flex items-center gap-2 text-xs">
                <i className={`fas ${classDef.icon} text-amber-600`}></i>
                <span className="fantasy-font text-stone-100">{selectedSpec.name}</span>
                <span className="text-stone-600">·</span>
                <span className="text-stone-400">{raceDef.name} {classDef.name}</span>
              </div>
            </div>

            {selectedSpec.description && (
              <blockquote className="text-xs text-stone-400 italic border-l-2 border-amber-700/50 pl-3 leading-relaxed">{selectedSpec.description}</blockquote>
            )}

            <h2 className="fantasy-font text-2xl text-amber-600 text-center">Choose Your Starting Grounds</h2>

            {isGenerating ? (
              <div className="space-y-4 py-12 text-center">
                <i className="fas fa-dice-d20 text-6xl text-amber-500 animate-spin"></i>
                <p className="text-stone-400 text-sm">Summoning possible starting grounds...</p>
                {showRetry && (
                  <div className="pt-4">
                    <button
                      type="button"
                      onClick={() => { abortRef.current?.abort(); if (selectedSpec) fetchLocations(selectedSpec); }}
                      className="px-6 py-3 bg-amber-700 hover:bg-amber-600 rounded-lg font-bold text-white transition-all uppercase tracking-widest text-xs"
                    >
                      <i className="fas fa-redo-alt mr-2"></i> Retry
                    </button>
                  </div>
                )}
              </div>
            ) : genFailed || generatedLocations.length === 0 ? (
              <div className="space-y-4 py-8 text-center">
                <p className="text-stone-500 text-sm">Failed to generate locations.</p>
                <button type="button" onClick={() => { abortRef.current?.abort(); if (selectedSpec) fetchLocations(selectedSpec); }} className="px-6 py-3 bg-amber-700 hover:bg-amber-600 rounded-lg font-bold text-white transition-all uppercase tracking-widest text-xs">Retry</button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {generatedLocations.map((loc, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedLocation(loc)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${selectedLocation?.name === loc.name ? 'border-amber-600 bg-amber-900/10' : 'border-stone-800 bg-stone-900/40 hover:border-stone-600'}`}
                    >
                      <h3 className="font-bold text-sm text-stone-100">{loc.name}</h3>
                      <p className="text-[10px] text-stone-500 mt-1 line-clamp-2">{loc.description}</p>
                    </button>
                  ))}
                </div>
                {selectedLocation && (
                  <div className="bg-stone-950 rounded-xl border border-stone-800 overflow-hidden">
                    {selectedLocation.atmosphereUrl ? (
                      <img src={selectedLocation.atmosphereUrl} alt={selectedLocation.name} className="w-full h-36 object-cover" />
                    ) : (
                      <div className="w-full h-36 bg-stone-900 flex items-center justify-center">
                        <i className="fas fa-image text-stone-700 text-3xl"></i>
                      </div>
                    )}
                    <div className="p-4 text-left">
                      <h3 className="fantasy-font text-lg text-amber-400">{selectedLocation.name}</h3>
                      <p className="text-xs text-stone-400 mt-2 leading-relaxed">{selectedLocation.description}</p>
                      {selectedLocation.introHook && (
                        <blockquote className="mt-3 border-l-2 border-amber-700 pl-3 italic text-[11px] text-amber-300/70 leading-relaxed">&ldquo;{selectedLocation.introHook}&rdquo;</blockquote>
                      )}
                    </div>
                  </div>
                )}
                <button type="button" onClick={() => { abortRef.current?.abort(); if (selectedSpec) fetchLocations(selectedSpec); }} className="w-full py-3 bg-stone-800 hover:bg-stone-700 rounded-lg font-bold text-stone-400 transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-2 border border-stone-700">
                  <i className="fas fa-dice-d20"></i> Reroll Starting Grounds
                </button>
                <button type="button" onClick={handleBegin} disabled={!selectedLocation} className="w-full py-4 bg-green-800 hover:bg-green-700 disabled:opacity-30 rounded-lg font-bold text-white transition-all uppercase tracking-widest shadow-xl shadow-green-900/20 text-xs">
                  Begin Your Chronicle
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default QuickStartFlow;
