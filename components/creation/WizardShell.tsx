import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Character, StartingLocation } from '../../types';
import { WizardState } from './types';
import { WizardStep } from '../wizard/WizardStep';
import StepWizard from '../wizard/StepWizard';
import { ASI_LEVELS } from '../../constants';
import { lookupSRDItem } from '../../utils/srdItems';
import { CLASSES_CATALOG } from '../../utils/classes';
import { RACES_CATALOG } from '../../utils/races';
import { buildCharacterFromWizard } from '../../services/characterCreationService';
import { StepH, NavBtn, SubclassList, DragonColorPicker } from './SharedComponents';
import NameStep from './NameStep';
import RaceStep from './RaceStep';
import ClassStep from './ClassStep';
import StatsStep from './StatsStep';
import SkillsStep from './SkillsStep';
import FeatsStep from './FeatsStep';
import SpellsStep from './SpellsStep';
import GearStep from './GearStep';
import ReviewStep from './ReviewStep';
import StartingGroundsStep from './StartingGroundsStep';

/** Props for the main character creation wizard shell. */
interface WizardShellProps {
  onComplete: (character: Character) => void;
  isNewCampaign?: boolean;
  campaignStartingLocation?: StartingLocation;
  onGenerateStartingLocations?: (charInfo: { name: string; race: string; class: string }) => Promise<StartingLocation[]>;
  onSetStartingLocation?: (location: StartingLocation) => void;
}

const RACES = RACES_CATALOG;
const CLASSES = CLASSES_CATALOG;

/** Main character creation wizard. Orchestrates all steps (name, race, class, stats, skills, feats, spells, gear, review, starting grounds) into a multi-step form with progress tracking. */
const WizardShell: React.FC<WizardShellProps> = ({
  onComplete, isNewCampaign, campaignStartingLocation, onGenerateStartingLocations, onSetStartingLocation,
}) => {
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const generationStartedRef = useRef(false);
  const generationIdRef = useRef(0);

  const [wizardState, setWizardState] = useState<WizardState>({
    name: '', level: 1, backstory: '',
    selectedRace: RACES[0], selectedClass: CLASSES[0],
    stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    inventory: [], allocatedSkills: {}, goldPool: 10,
    selectedSpells: [], selectedCantrips: [], selectedSubclassId: null,
    asiFeatSlots: ASI_LEVELS.filter(l => l <= 1).map(() => ({ type: null as unknown as 'asi' | 'feat' | null })), draconicAncestry: null,
    halfElfChoice1: null, halfElfChoice2: null,
    generatedLocations: [], selectedLocation: null,
    isGeneratingLocs: false, isRerolling: false,
  });

  const updateWizard = useCallback((updates: Partial<WizardState>) => {
    setWizardState(prev => ({ ...prev, ...updates }));
  }, []);

  useEffect(() => {
    const defaults = (wizardState.selectedClass.startingEquipment || []).map((item: string) => {
      const srd = lookupSRDItem(item);
      return { name: item, quantity: 1, type: srd?.type || 'other', rarity: srd?.rarity || 'common', description: srd?.description || 'No description available.', weight: srd?.weight || 0, cost: srd?.cost || '0 gp', stats: srd?.stats || {}, equipped: srd?.type === 'weapon' || srd?.type === 'armor' || srd?.type === 'shield' };
    });
    const ep = lookupSRDItem("Explorer's Pack");
    defaults.push({ name: "Explorer's Pack", quantity: 1, type: ep?.type || 'other', rarity: ep?.rarity || 'common', description: ep?.description || 'No description available.', weight: ep?.weight || 0, cost: ep?.cost || '0 gp', stats: ep?.stats || {}, equipped: false });
    updateWizard({ inventory: defaults, goldPool: 10 * wizardState.level, allocatedSkills: {} });
  }, [wizardState.selectedClass, wizardState.level, updateWizard]);

  useEffect(() => {
    const targetSlots = ASI_LEVELS.filter(l => l <= wizardState.level);
    if (wizardState.asiFeatSlots.length !== targetSlots.length) {
      const newSlots = wizardState.asiFeatSlots.slice(0, targetSlots.length);
      while (newSlots.length < targetSlots.length) { newSlots.push({ type: null as unknown as 'asi' | 'feat' | null }); }
      updateWizard({ asiFeatSlots: newSlots });
    }
  }, [wizardState.level, updateWizard, wizardState.asiFeatSlots.length]);

  const needsSpellsStep = !!wizardState.selectedClass.spellcasting;

  const remainingSkillPoints = (() => {
    const sp = wizardState.selectedClass.skillChoices.count * 2;
    return sp + (wizardState.level - 1) * (wizardState.selectedClass.name === 'Rogue' ? 4 : 3) - Object.values(wizardState.allocatedSkills).reduce((s, v) => s + v, 0);
  })();

  const handleFinalize = () => {
    setFinalizeError(null);
    // UI-level validation for choices the build service does not enforce.
    if (!wizardState.name.trim()) { setFinalizeError("Your character must have a name before beginning their chronicle."); return; }
    if (remainingSkillPoints > 0) { setFinalizeError(`You still have ${remainingSkillPoints} unspent skill points.`); return; }
    for (let i = 0; i < wizardState.asiFeatSlots.length; i++) {
      if (wizardState.asiFeatSlots[i].type === null) { setFinalizeError(`Please complete Feats & Ability Improvements slot ${i + 1}.`); return; }
    }
    if (isNewCampaign && !wizardState.selectedLocation) { setFinalizeError("Please select a starting location."); return; }
    // Delegate the build to the canonical service (shared with the quick-start path).
    const { character, errors } = buildCharacterFromWizard(wizardState, {
      isNewCampaign: !!isNewCampaign,
      campaignStartingLocation,
      remainingSkillPoints,
      onSetStartingLocation,
    });
    if (errors.length > 0 || !character) {
      setFinalizeError(errors[0] ?? "Unable to build character.");
      return;
    }
    onComplete(character);
  };

  const handleReroll = async () => {
    if (!onGenerateStartingLocations) return;
    updateWizard({ isRerolling: true, isGeneratingLocs: true });
    const gid = ++generationIdRef.current;
    const charInfo = { name: wizardState.name.trim() || 'Adventurer', race: wizardState.selectedRace.name, class: wizardState.selectedClass.name };
    try {
      const locs = await onGenerateStartingLocations(charInfo);
      if (gid === generationIdRef.current) updateWizard({ generatedLocations: locs, selectedLocation: locs.length > 0 ? locs[0] : null });
    } catch { /* location generation failed, will retry */ }
    if (gid === generationIdRef.current) updateWizard({ isRerolling: false, isGeneratingLocs: false });
  };

  const stepCls = "space-y-6 animate-in fade-in duration-500";
  const selectedClass = wizardState.selectedClass;

  const steps: WizardStep<WizardState>[] = [
    {
      key: 'name', label: 'Name',
      validate: (s) => !s.name.trim() ? 'Enter a name' : null,
      render: ({ state, updateState, context }) => (
        <NameStep wizardState={state} updateWizard={updateState} onNext={() => context.goToStep('race')} onBack={context.goBack} goToStep={() => {}} />
      ),
    },
    {
      key: 'race', label: 'Race',
      validate: (s) => s.selectedRace.id === 'dragonborn' && !s.draconicAncestry ? 'Choose your Draconic Ancestry' : null,
      render: ({ state, updateState, context }) => (
        <RaceStep wizardState={state} updateWizard={updateState} onNext={() => context.goToStep('class')} onBack={context.goBack} goToStep={() => {}} />
      ),
    },
    {
      key: 'class', label: 'Class',
      validate: () => null,
      render: ({ state, updateState, context }) => (
        <ClassStep wizardState={state} updateWizard={updateState} onNext={() => {
          if (state.selectedClass.subclassLevel === 1) context.goToStep('subclass-early');
          else context.goToStep('stats');
        }} onBack={context.goBack} goToStep={() => {}} />
      ),
    },
    {
      key: 'subclass-early', label: 'Path',
      isVisible: (s) => s.selectedClass.subclassLevel === 1,
      validate: (s) => !s.selectedSubclassId ? 'Choose a subclass' : null,
      render: ({ state, updateState, context }) => (
        <div className={stepCls}>
          <StepH>Choose Your Path</StepH>
          <p className="text-xs text-stone-400 text-center">Your {state.selectedClass.name} specialization defines your unique abilities.</p>
          <SubclassList subclasses={state.selectedClass.subclasses} selectedSubclassId={state.selectedSubclassId} onSelect={(id) => updateState({ selectedSubclassId: id, draconicAncestry: id !== 'draconic-bloodline' ? null : state.draconicAncestry })} level={state.level} />
          {state.selectedSubclassId === 'draconic-bloodline' && <DragonColorPicker selected={state.draconicAncestry} onSelect={(id) => updateState({ draconicAncestry: id })} flavor="origin" />}
          <NavBtn disabled={!state.selectedSubclassId || (state.selectedSubclassId === 'draconic-bloodline' && !state.draconicAncestry)} onClick={() => context.goToStep('stats')}>Shape Attributes</NavBtn>
        </div>
      ),
    },
    {
      key: 'stats', label: 'Stats',
      validate: () => null,
      render: ({ state, updateState, context }) => (
        <StatsStep wizardState={state} updateWizard={updateState} onNext={() => context.goToStep('skills')} onBack={context.goBack} goToStep={() => {}} />
      ),
    },
    {
      key: 'skills', label: 'Skills',
      validate: () => null,
      render: ({ state, updateState, context }) => (
        <SkillsStep wizardState={state} updateWizard={updateState} onNext={() => context.goToStep('feats')} onBack={context.goBack} goToStep={() => {}} />
      ),
    },
    {
      key: 'feats', label: 'Feats',
      validate: () => null,
      render: ({ state, updateState, context }) => {
        const needsSub = state.selectedClass.subclassLevel >= 2 && state.selectedClass.subclassLevel <= state.level;
        const needsSpells = !!state.selectedClass.spellcasting;
        return (
          <FeatsStep wizardState={state} updateWizard={updateState} onNext={() => {}} onBack={context.goBack} goToStep={() => {}}
            onGoToSubclass={() => context.goToStep('subclass-late')}
            onGoToSpells={() => context.goToStep('spells')}
            onGoToGear={() => context.goToStep('gear')}
            needsSpellsStep={needsSpells}
            needsSubclassStep={needsSub}
          />
        );
      },
    },
    {
      key: 'subclass-late', label: 'Path',
      isVisible: (s) => s.selectedClass.subclassLevel >= 2 && s.selectedClass.subclassLevel <= s.level,
      validate: (s) => !s.selectedSubclassId ? 'Choose a subclass' : null,
      render: ({ state, updateState, context }) => {
        const needsSpells = !!state.selectedClass.spellcasting;
        return (
          <div className={stepCls}>
            <StepH>Choose Your Path</StepH>
            <p className="text-xs text-stone-400 text-center">Your {state.selectedClass.name} specialization at level {state.selectedClass.subclassLevel}.</p>
            <SubclassList subclasses={state.selectedClass.subclasses} selectedSubclassId={state.selectedSubclassId} onSelect={(id) => updateState({ selectedSubclassId: id, draconicAncestry: id !== 'draconic-bloodline' ? null : state.draconicAncestry })} level={state.level} />
            {state.selectedSubclassId === 'draconic-bloodline' && <DragonColorPicker selected={state.draconicAncestry} onSelect={(id) => updateState({ draconicAncestry: id })} flavor="origin" />}
            <NavBtn disabled={!state.selectedSubclassId || (state.selectedSubclassId === 'draconic-bloodline' && !state.draconicAncestry)}
              onClick={() => context.goToStep(needsSpells ? 'spells' : 'gear')}>
              {needsSpells ? 'Choose Spells' : 'Choose Gear'}
            </NavBtn>
          </div>
        );
      },
    },
    {
      key: 'spells', label: 'Spells',
      isVisible: (s) => !!s.selectedClass.spellcasting,
      validate: () => null,
      render: ({ state, updateState, context }) => {
        return (
          <SpellsStep wizardState={state} updateWizard={updateState} onNext={() => context.goToStep('gear')} onBack={context.goBack} goToStep={() => {}}
            onBackToSubclass={() => context.goToStep('subclass-late')}
            onBackToFeats={() => context.goToStep('feats')}
            onGoToGear={() => context.goToStep('gear')}
          />
        );
      },
    },
    {
      key: 'gear', label: 'Gear',
      validate: () => null,
      render: ({ state, updateState, context }) => {
        const needsSpells = !!state.selectedClass.spellcasting;
        const needsLateSub = state.selectedClass.subclassLevel >= 2 && state.selectedClass.subclassLevel <= state.level;
        return (
          <GearStep wizardState={state} updateWizard={updateState} onNext={() => context.goToStep('review')} onBack={context.goBack} goToStep={() => {}}
            onBackToSpells={() => context.goToStep('spells')}
            onBackToFeats={() => context.goToStep('feats')}
            onBackToSubclass={() => context.goToStep('subclass-late')}
            needsSpellsStep={needsSpells}
            needsSubclassStep={needsLateSub}
          />
        );
      },
    },
    {
      key: 'review', label: 'Review',
      validate: () => null,
      render: ({ state, context }) => (
        <ReviewStep wizardState={state} finalizeError={finalizeError} isNewCampaign={!!isNewCampaign}
          campaignStartingLocation={campaignStartingLocation} needsSpellsStep={needsSpellsStep}
          onFinalize={handleFinalize}
          onGoToStart={() => {
            context.goToStep('starting-grounds');
            if (!generationStartedRef.current) {
              generationStartedRef.current = true;
              handleReroll();
            }
          }}
        />
      ),
    },
    {
      key: 'starting-grounds', label: 'Start',
      isVisible: () => !!isNewCampaign,
      validate: () => null,
      render: ({ state, updateState }) => (
        <StartingGroundsStep wizardState={state} updateWizard={updateState}
          onFinalize={handleFinalize} onReroll={handleReroll} />
      ),
    },
  ];

  return (
    <div className="fixed inset-0 bg-stone-950 z-50 flex flex-col items-center justify-center p-6 text-stone-200 overflow-y-auto">
      <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/black-paper.png")' }}></div>
      <div className="max-w-2xl w-full bg-stone-900/40 border border-stone-800 rounded-2xl p-8 backdrop-blur-md shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar">
        <StepWizard
          steps={steps}
          state={wizardState}
          updateState={updateWizard}
          renderProgress={({ currentIndex, total, steps, goToStep }) => (
            <div className="relative mb-12 px-5">
              <div className="absolute top-1/2 left-10 right-10 h-[2px] bg-stone-800 -translate-y-1/2 z-0"></div>
              <div className="absolute top-1/2 left-10 h-[2px] bg-amber-600 -translate-y-1/2 z-0 transition-all duration-700 ease-in-out shadow-[0_0_8px_rgba(217,119,6,0.5)]"
                style={{ width: `calc(${total > 1 ? (currentIndex / (total - 1)) * 100 : 0}% - ${currentIndex > 0 ? '40px' : '0px'})`, maxWidth: 'calc(100% - 80px)' }}>
              </div>
              <div className="flex justify-between w-full relative z-10">
                {Array.from({ length: total }).map((_, i) => {
                  const step = steps[i];
                  const reachable = !!step && i <= currentIndex + 1;
                  return (
                    <button
                      key={step?.key || i}
                      type="button"
                      onClick={() => step && goToStep(step.key)}
                      disabled={!reachable}
                      className={`flex flex-col items-center gap-1 ${reachable ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                      title={reachable ? `Back to ${step?.label}` : 'Complete earlier steps first'}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold fantasy-font border-2 transition-all duration-500 ${currentIndex >= i ? 'border-amber-600 bg-stone-900 text-amber-500 shadow-[0_0_15px_rgba(180,83,9,0.3)]' : 'border-stone-800 bg-stone-950 text-stone-700'} ${reachable ? 'hover:scale-110' : 'opacity-50'}`}>
                        {i + 1}
                      </div>
                      <span className={`text-[8px] uppercase tracking-wider font-bold hidden sm:block ${currentIndex >= i ? 'text-amber-700' : 'text-stone-700'}`}>{step?.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          renderHeader={
            <>
              {wizardState.name && (
                <div className="flex items-center justify-center gap-3 py-2 mb-4 border-b border-stone-800 text-[10px] text-stone-400 flex-wrap">
                  <span className="font-bold text-stone-200 fantasy-font text-sm">{wizardState.name}</span>
                  <span className="text-stone-700">·</span>
                  <span className="text-stone-400">{wizardState.selectedRace.name}</span>
                  <span className="text-stone-700">·</span>
                  <span><i className={`fas ${selectedClass.icon} text-amber-700`}></i> {selectedClass.name}</span>
                  <span className="text-stone-700">·</span>
                  <span>Level <strong className="text-amber-500">{wizardState.level}</strong></span>
                </div>
              )}
            </>
          }
        />
        {wizardState.isRerolling && (
          <div className="fixed inset-0 z-[100] bg-stone-950/90 flex flex-col items-center justify-center">
            <div className="flex gap-6 mb-8">
              <i className="fas fa-dice-d20 text-6xl text-amber-500 animate-spin"></i>
              <i className="fas fa-dice-d12 text-6xl text-amber-400 animate-spin" style={{ animationDuration: '1.2s' }}></i>
              <i className="fas fa-dice-d8 text-6xl text-amber-500 animate-spin" style={{ animationDuration: '0.8s' }}></i>
            </div>
            <p className="text-stone-300 text-xl fantasy-font tracking-widest animate-pulse">Rerolling Starting Locations...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default WizardShell;
