import React, { useCallback, useEffect, useRef, useState } from 'react';
import Screen from '../primitives/Screen';
import ProgressRail from '../primitives/ProgressRail';
import type { RailStep } from '../primitives/ProgressRail';
import Button from '../primitives/Button';
import { cx } from '../primitives/cx';
import type { Character, StartingLocation } from '../../../types';
import { ASI_LEVELS } from '../../../constants';
import { lookupSRDItem } from '../../../utils/srdItems';
import { POINT_BUY_COSTS } from '../../creation/constants';
import { computeRemainingSkillPoints } from '../../creation/skillPoints';
import { buildCharacterFromWizard } from '../../../services/characterCreationService';
import { getRaceAssessment, getClassAssessment } from '../../creation/classRaceAssessment';
import ForgePreview from './ForgePreview';
import { createInitialForgeState, materializeFeatSlots, emptyForgeSlot } from './forgeTypes';
import { computeSpellCaps } from './forgeUtils';
import { ForgeErrorBanner } from './forgeWidgets';
import IdentityStep from './steps/IdentityStep';
import OriginStep from './steps/OriginStep';
import PathStep from './steps/PathStep';
import AbilitiesStep from './steps/AbilitiesStep';
import FeatsStepV2 from './steps/FeatsStepV2';
import SkillsStepV2 from './steps/SkillsStepV2';
import SpellsStepV2 from './steps/SpellsStepV2';
import GearStepV2 from './steps/GearStepV2';
import StoryStep from './steps/StoryStep';
import ReviewStepV2 from './steps/ReviewStepV2';
import GroundsStepV2 from './steps/GroundsStepV2';
import type { ForgeIssue, ForgeState, UpdateWizard } from './forgeTypes';

/** Props for the ForgeScreen — matches the legacy WizardShell props plus an onBack escape hatch. */
export interface ForgeScreenProps {
  onComplete: (character: Character) => void;
  isNewCampaign?: boolean;
  defaultLevel?: number;
  campaignStartingLocation?: StartingLocation;
  onGenerateStartingLocations?: (charInfo: { name: string; race: string; class: string }) => Promise<StartingLocation[]>;
  onSetStartingLocation?: (location: StartingLocation) => void;
  onBack?: () => void;
}

interface ForgeStepDef {
  key: string;
  label: string;
  icon: string;
  /** Shell-owned per-step validation: null = done/valid, string = blocking message. */
  validate: (s: ForgeState) => string | null;
  render: () => React.ReactNode;
}

/**
 * The Forge — Emberlight V2 character creation shell. Replaces the legacy
 * 13-step WizardShell with a 10-step experience (subclass selection merged
 * into the Path step). Owns the full wizard state, per-step validation, the
 * progress rail, and finalize → `buildCharacterFromWizard`.
 */
const ForgeScreen: React.FC<ForgeScreenProps> = ({
  onComplete, isNewCampaign, defaultLevel, campaignStartingLocation, onGenerateStartingLocations, onSetStartingLocation, onBack,
}) => {
  const [wizard, setWizard] = useState<ForgeState>(() => createInitialForgeState(defaultLevel));
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [currentKey, setCurrentKey] = useState('identity');
  const [genAttempted, setGenAttempted] = useState(false);
  const visitedRef = useRef<Set<string>>(new Set(['identity']));
  const generationStartedRef = useRef(false);
  const generationIdRef = useRef(0);

  const updateWizard: UpdateWizard = useCallback((updates) => {
    setWizard(prev => ({ ...prev, ...updates }));
  }, []);

  // Reset starting equipment, gold, and skill allocations ONLY when the class
  // changes (different starting kit / skill list). Level changes must not wipe
  // gear purchases or skill picks the user already made.
  const selectedClassId = wizard.selectedClass.id;
  useEffect(() => {
    const defaults = wizard.selectedClass.startingEquipment.map((item: string) => {
      const srd = lookupSRDItem(item);
      return { name: item, quantity: 1, type: srd?.type || 'other', rarity: srd?.rarity || 'common', description: srd?.description || 'No description available.', weight: srd?.weight || 0, cost: srd?.cost || '0 gp', stats: srd?.stats || {}, equipped: srd?.type === 'weapon' || srd?.type === 'armor' || srd?.type === 'shield' };
    });
    const ep = lookupSRDItem("Explorer's Pack");
    defaults.push({ name: "Explorer's Pack", quantity: 1, type: ep?.type || 'other', rarity: ep?.rarity || 'common', description: ep?.description || 'No description available.', weight: ep?.weight || 0, cost: ep?.cost || '0 gp', stats: ep?.stats || {}, equipped: false });
    updateWizard({ inventory: defaults, goldPool: 10 * wizard.level, allocatedSkills: {} });
  }, [selectedClassId, updateWizard]);

  // ASI/Feat slot count tracks level milestones (slot i ↔ ASI_LEVELS[i]).
  useEffect(() => {
    const targetSlots = ASI_LEVELS.filter(l => l <= wizard.level);
    if (wizard.asiFeatSlots.length !== targetSlots.length) {
      const newSlots = wizard.asiFeatSlots.slice(0, targetSlots.length);
      while (newSlots.length < targetSlots.length) { newSlots.push(emptyForgeSlot()); }
      updateWizard({ asiFeatSlots: newSlots });
    }
  }, [wizard.level, updateWizard, wizard.asiFeatSlots.length]);

  /** Reroll/regenerate starting grounds (generationId guards against stale async completions). */
  const handleReroll = useCallback(async () => {
    if (!onGenerateStartingLocations) return;
    setGenAttempted(true);
    updateWizard({ isRerolling: true, isGeneratingLocs: true });
    const gid = ++generationIdRef.current;
    const charInfo = { name: wizard.name.trim() || 'Adventurer', race: wizard.selectedRace.name, class: wizard.selectedClass.name };
    try {
      const locs = await onGenerateStartingLocations(charInfo);
      if (gid === generationIdRef.current) updateWizard({ generatedLocations: locs, selectedLocation: locs.length > 0 ? locs[0] : null });
    } catch { /* location generation failed, will retry */ }
    if (gid === generationIdRef.current) updateWizard({ isRerolling: false, isGeneratingLocs: false });
  }, [onGenerateStartingLocations, updateWizard, wizard.name, wizard.selectedRace.name, wizard.selectedClass.name]);

  /** Final validation chain + canonical build (ported from the legacy shell). */
  const handleFinalize = useCallback(() => {
    setFinalizeError(null);
    const remainingSkillPoints = computeRemainingSkillPoints(wizard.selectedClass, wizard.level, wizard.allocatedSkills);
    // UI-level validation for choices the build service does not enforce.
    if (!wizard.name.trim()) { setFinalizeError('Your character must have a name before beginning their chronicle.'); return; }
    if (remainingSkillPoints > 0) { setFinalizeError(`You still have ${remainingSkillPoints} unspent skill points.`); return; }
    for (let i = 0; i < wizard.asiFeatSlots.length; i++) {
      if (wizard.asiFeatSlots[i].type === null) { setFinalizeError(`Please complete Feats & Ability Improvements slot ${i + 1}.`); return; }
    }
    if (isNewCampaign && !wizard.selectedLocation) { setFinalizeError('Please select a starting location.'); return; }
    // Delegate the build to the canonical service (shared with the quick-start path).
    const { character, errors } = buildCharacterFromWizard({ ...wizard, asiFeatSlots: materializeFeatSlots(wizard.asiFeatSlots) }, {
      isNewCampaign: !!isNewCampaign,
      campaignStartingLocation,
      remainingSkillPoints,
      onSetStartingLocation,
    });
    if (errors.length > 0 || !character) {
      setFinalizeError(errors[0] ?? 'Unable to build character.');
      return;
    }
    onComplete(character);
  }, [wizard, isNewCampaign, campaignStartingLocation, onSetStartingLocation, onComplete]);

  const goToStep = useCallback((key: string) => {
    setCurrentKey(key);
    setStepError(null);
    setFinalizeError(null);
    visitedRef.current.add(key);
    if (key === 'grounds' && !generationStartedRef.current) {
      generationStartedRef.current = true;
      void handleReroll();
    }
  }, [handleReroll]);

  const isSlotComplete = (slot: ForgeState['asiFeatSlots'][number]): boolean => {
    if (slot.type === 'feat') {
      if (!slot.featId) return false;
      if (slot.featId === 'skilled' && (slot.skillChoices || []).length !== 3) return false;
      return true;
    }
    if (slot.type === 'asi') {
      return Object.values(slot.statAllocations || {}).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0) === 2;
    }
    return false;
  };

  const hasGrounds = !!isNewCampaign && !!onGenerateStartingLocations;
  const groundsGenFailed = genAttempted && !wizard.isGeneratingLocs && wizard.generatedLocations.length === 0;

  const steps: ForgeStepDef[] = [
    {
      key: 'identity', label: 'Identity', icon: 'fa-feather-pointed',
      validate: s => (s.name.trim() ? null : 'Your character needs a name.'),
      render: () => <IdentityStep wizard={wizard} updateWizard={updateWizard} />,
    },
    {
      key: 'origin', label: 'Origin', icon: 'fa-users',
      validate: s => {
        if (getRaceAssessment(s.selectedRace.id).status === 'disabled') return 'This lineage is temporarily disabled — choose another.';
        if (s.selectedRace.id === 'dragonborn' && !s.draconicAncestry) return 'Choose your Draconic Ancestry.';
        return null;
      },
      render: () => <OriginStep wizard={wizard} updateWizard={updateWizard} />,
    },
    {
      key: 'path', label: 'Path', icon: 'fa-compass',
      validate: s => {
        const cls = s.selectedClass;
        if (getClassAssessment(cls.id).status === 'disabled') return 'This calling is temporarily disabled — choose another.';
        if (cls.subclassLevel <= s.level && cls.subclasses.length > 0) {
          if (!s.selectedSubclassId) return `Choose your ${cls.name} specialization.`;
          if (s.selectedSubclassId === 'draconic-bloodline' && !s.draconicAncestry) return 'Choose your Dragon Ancestor.';
        }
        return null;
      },
      render: () => <PathStep wizard={wizard} updateWizard={updateWizard} />,
    },
    {
      key: 'abilities', label: 'Abilities', icon: 'fa-bolt',
      validate: s => {
        if (s.statsGenMode === 'buy') {
          const spent = Object.values(s.stats).reduce((sum, v) => sum + (POINT_BUY_COSTS[v] || 0), 0);
          if (27 - spent > 0) return `You still have ${27 - spent} unspent attribute points.`;
        }
        if (s.statsGenMode === 'roll' && s.rolledStatValues.length === 0) return 'Please roll for stats before continuing.';
        if (s.selectedRace.asi === 'flexible-2' && (!s.halfElfChoice1 || !s.halfElfChoice2)) {
          return "Please choose two stats for your Half-Elf's flexible ASI.";
        }
        return null;
      },
      render: () => <AbilitiesStep wizard={wizard} updateWizard={updateWizard} />,
    },
    {
      key: 'skills', label: 'Skills', icon: 'fa-brain',
      validate: s => {
        const remaining = computeRemainingSkillPoints(s.selectedClass, s.level, s.allocatedSkills);
        return remaining > 0 ? `You still have ${remaining} unspent skill points.` : null;
      },
      render: () => <SkillsStepV2 wizard={wizard} updateWizard={updateWizard} />,
    },
    {
      key: 'feats', label: 'Feats', icon: 'fa-trophy',
      validate: s => {
        for (let i = 0; i < s.asiFeatSlots.length; i++) {
          if (!isSlotComplete(s.asiFeatSlots[i])) return `Complete Feats & Ability Improvements slot ${i + 1}.`;
        }
        return null;
      },
      render: () => <FeatsStepV2 wizard={wizard} updateWizard={updateWizard} />,
    },
    {
      key: 'spells', label: 'Spells', icon: 'fa-wand-magic-sparkles',
      validate: s => {
        if (!s.selectedClass.spellcasting) return null;
        const caps = computeSpellCaps(s);
        if (s.selectedCantrips.length < caps.maxCantrips || s.selectedSpells.length < caps.maxSpells) {
          return `Choose all cantrips (${s.selectedCantrips.length}/${caps.maxCantrips}) and spells (${s.selectedSpells.length}/${caps.maxSpells}).`;
        }
        return null;
      },
      render: () => <SpellsStepV2 wizard={wizard} updateWizard={updateWizard} />,
    },
    {
      key: 'gear', label: 'Gear', icon: 'fa-shield-halved',
      validate: () => null,
      render: () => <GearStepV2 wizard={wizard} updateWizard={updateWizard} />,
    },
    {
      key: 'story', label: 'Story', icon: 'fa-book-open',
      validate: () => null,
      render: () => <StoryStep wizard={wizard} updateWizard={updateWizard} />,
    },
    {
      key: 'review', label: 'Review', icon: 'fa-flag-checkered',
      validate: () => null,
      render: () => (
        <ReviewStepV2
          wizardState={wizard}
          finalizeError={finalizeError}
          issues={issues}
          onGoToStep={goToStep}
          isNewCampaign={!!isNewCampaign}
          campaignStartingLocation={campaignStartingLocation}
          needsSpellsStep={!!wizard.selectedClass.spellcasting}
        />
      ),
    },
  ];

  if (hasGrounds) {
    steps.push({
      key: 'grounds', label: 'Grounds', icon: 'fa-map-location-dot',
      validate: s => (s.selectedLocation ? null : 'Choose a starting location.'),
      render: () => (
        <GroundsStepV2
          wizard={wizard}
          updateWizard={updateWizard}
          genFailed={groundsGenFailed}
          onReroll={handleReroll}
          onConfirm={handleFinalize}
          confirmDisabled={!wizard.selectedLocation}
          heroSummary={<ForgePreview wizard={wizard} />}
        />
      ),
    });
  }

  const currentIndex = Math.max(0, steps.findIndex(s => s.key === currentKey));
  const currentStep = steps[currentIndex];

  /** All failing pre-review steps (drives the review checklist). */
  const issues: ForgeIssue[] = steps
    .filter(s => s.key !== 'review' && s.key !== 'grounds')
    .map(s => ({ stepKey: s.key, label: s.label, message: s.validate(wizard) }))
    .filter((x): x is ForgeIssue => x.message !== null);

  const railSteps: RailStep[] = steps.map(s => {
    const done = s.validate(wizard) === null;
    const visited = visitedRef.current.has(s.key);
    return { key: s.key, label: s.label, icon: s.icon, done, error: !done && visited && s.key !== currentKey };
  });

  const handleContinue = () => {
    setFinalizeError(null);
    if (currentStep.key === 'review') {
      if (issues.length > 0) {
        setFinalizeError('Resolve the issues above before beginning.');
        return;
      }
      if (hasGrounds) goToStep('grounds');
      else handleFinalize();
      return;
    }
    const issue = currentStep.validate(wizard);
    if (issue) {
      setStepError(issue);
      return;
    }
    setStepError(null);
    const next = steps[currentIndex + 1];
    if (next) goToStep(next.key);
  };

  const handleBack = () => {
    setFinalizeError(null);
    setStepError(null);
    const prev = steps[currentIndex - 1];
    if (prev) setCurrentKey(prev.key);
    else onBack?.();
  };

  const handleRailJump = (key: string) => {
    if (steps.find(s => s.key === key)?.validate(wizard) === null) goToStep(key);
  };

  const continueLabel = currentStep.key === 'review'
    ? (hasGrounds ? 'Choose Your Starting Grounds' : 'Begin Your Chronicle')
    : 'Continue';
  const continueIcon = currentStep.key === 'review' ? (hasGrounds ? 'fa-map-location-dot' : 'fa-flag-checkered') : 'fa-arrow-right';

  return (
    <Screen dots>
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* Mobile top rail */}
        <div className="lg:hidden sticky top-0 z-20 bg-obsidian-950/85 backdrop-blur border-b border-white/[0.06] px-3 py-2">
          <ProgressRail orientation="top" steps={railSteps} currentKey={currentKey} onJump={handleRailJump} />
        </div>

        {/* Desktop left rail */}
        <aside className="hidden lg:flex flex-col gap-4 w-[300px] shrink-0 border-r border-white/[0.06] p-5 overflow-y-auto v2-scrollbar">
          <header>
            <h1 className="font-display text-xl font-bold text-parchment tracking-[0.2em] uppercase">
              <i className="fas fa-fire-flame-curved text-ember-500 mr-2" aria-hidden="true" />The Forge
            </h1>
            <p className="text-[11px] text-parchment-mute mt-1">Shape a hero, one choice at a time.</p>
          </header>
          <ProgressRail steps={railSteps} currentKey={currentKey} onJump={handleRailJump} />
          <ForgePreview wizard={wizard} className="mt-auto" />
        </aside>

        {/* Main content */}
        <main className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 overflow-y-auto v2-scrollbar px-4 py-6 lg:px-10">
            <div key={currentKey} className="max-w-3xl mx-auto animate-fade-in">
              {currentStep.render()}
            </div>
          </div>
          <footer className="shrink-0 border-t border-white/[0.06] bg-obsidian-950/85 backdrop-blur px-4 py-3 lg:px-10">
            {(stepError || (finalizeError && currentStep.key !== 'review')) && (
              <div className="max-w-3xl mx-auto mb-2">
                <ForgeErrorBanner message={stepError ?? finalizeError ?? ''} />
              </div>
            )}
            <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
              <Button variant="ghost" icon="fa-arrow-left" onClick={handleBack}>
                Back
              </Button>
              <p className="hidden sm:block text-[10px] uppercase tracking-[0.18em] text-parchment-faint font-display">
                Step {currentIndex + 1} of {steps.length}
              </p>
              {currentStep.key === 'grounds' ? (
                <span className="text-[10px] text-parchment-faint italic">Confirm above to begin.</span>
              ) : (
                <Button
                  icon={continueIcon}
                  onClick={handleContinue}
                  className={cx(currentStep.key === 'review' && issues.length === 0 && !hasGrounds && 'animate-ember-glow')}
                >
                  {continueLabel}
                </Button>
              )}
            </div>
          </footer>
        </main>
      </div>
    </Screen>
  );
};

export default ForgeScreen;
