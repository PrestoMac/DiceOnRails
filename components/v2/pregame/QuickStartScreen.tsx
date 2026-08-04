import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Character, StartingLocation } from '../../../types';
import { PRESET_CHARACTERS } from '../../../data/presetCharacters';
import { buildPresetCharacter } from '../../../services/characterCreationService';
import type { PresetCharacterSpec } from '../../../services/characterCreationService';
import { RACES_BY_ID } from '../../../utils/races';
import { CLASSES_BY_ID } from '../../../utils/classes';
import { getClassAssessment, getRaceAssessment } from '../../creation/classRaceAssessment';
import Screen from '../primitives/Screen';
import Button from '../primitives/Button';
import Chip from '../primitives/Chip';
import Tooltip from '../primitives/Tooltip';
import { cx } from '../primitives/cx';
import StartingGroundsPicker from './shared/StartingGroundsPicker';

interface QuickStartScreenProps {
  onComplete: (character: Character) => void;
  onSetStartingLocation: (location: StartingLocation) => void;
  onSwitchToCustom: () => void;
  /** Cancels an in-flight generation via the optional AbortSignal (e.g. when the user retries). */
  onGenerateStartingLocations: (charInfo: { name: string; race: string; class: string }, signal?: AbortSignal) => Promise<StartingLocation[]>;
  /** true = host new campaign (preset → starting grounds). false = joining existing party (preset only; the host already fixed the starting location). */
  isNewCampaign?: boolean;
  /** When joining, the campaign's existing starting location (for preview + finalization). */
  campaignStartingLocation?: StartingLocation | null;
  /** Campaign name for the joiner banner. */
  campaignName?: string;
  onBack: () => void;
}

type Step = 'select' | 'grounds';
type WorstStatus = 'ok' | 'warning' | 'disabled';

const STAT_LABELS: Record<string, string> = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };

const STATUS_ICON: Record<WorstStatus, { icon: string; cls: string }> = {
  ok: { icon: 'fa-circle-check', cls: 'text-verdant-400/80' },
  warning: { icon: 'fa-triangle-exclamation', cls: 'text-ember-400/90' },
  disabled: { icon: 'fa-ban', cls: 'text-blood-400/80' },
};

/** Combines the race + class assessments of a preset into its worst status and an explanatory reason. */
const getPresetAssessment = (spec: PresetCharacterSpec): { status: WorstStatus; reason: string } => {
  const race = RACES_BY_ID[spec.raceId];
  const cls = CLASSES_BY_ID[spec.classId];
  const raceAssess = getRaceAssessment(spec.raceId);
  const classAssess = getClassAssessment(spec.classId);
  const statuses = [raceAssess.status, classAssess.status];
  const status: WorstStatus = statuses.includes('disabled') ? 'disabled' : statuses.includes('warning') ? 'warning' : 'ok';
  const raceName = race?.name ?? spec.raceId;
  const className = cls?.name ?? spec.classId;
  const reason =
    raceAssess.status === 'disabled'
      ? `${raceName} is temporarily disabled — ${raceAssess.reason}`
      : classAssess.status === 'disabled'
        ? `${className} is temporarily disabled — ${classAssess.reason}`
        : raceAssess.status === 'warning' && classAssess.status === 'warning'
          ? `${raceName}: ${raceAssess.reason}\n${className}: ${classAssess.reason}`
          : raceAssess.status === 'warning'
            ? `${raceName}: ${raceAssess.reason}`
            : classAssess.status === 'warning'
              ? `${className}: ${classAssess.reason}`
              : raceAssess.reason;
  return { status, reason };
};

/** The two highest ability scores of a preset, as small chips. */
const TopStats: React.FC<{ spec: PresetCharacterSpec }> = ({ spec }) => {
  const top = Object.entries(spec.stats).sort((a, b) => b[1] - a[1]).slice(0, 2);
  return (
    <div className="flex gap-1.5 justify-center">
      {top.map(([key, val]) => (
        <Chip key={key} color="neutral">
          {STAT_LABELS[key] ?? key.toUpperCase()} {val}
        </Chip>
      ))}
    </div>
  );
};

/**
 * V2 Quick Start flow: pick a preset hero, then (for new campaigns) a starting ground.
 * Joiners finalize with a single click via an inline confirm bar — no grounds step.
 */
const QuickStartScreen: React.FC<QuickStartScreenProps> = ({
  onComplete,
  onSetStartingLocation,
  onSwitchToCustom,
  onGenerateStartingLocations,
  isNewCampaign = true,
  campaignStartingLocation,
  campaignName,
  onBack,
}) => {
  const isJoining = !isNewCampaign;
  const [step, setStep] = useState<Step>('select');
  const [selectedSpec, setSelectedSpec] = useState<PresetCharacterSpec | null>(null);
  const [generatedLocations, setGeneratedLocations] = useState<StartingLocation[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<StartingLocation | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRerolling, setIsRerolling] = useState(false);
  const [genFailed, setGenFailed] = useState(false);
  const [showRetry, setShowRetry] = useState(false);
  const generationIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // Surface a retry button after 20s of generating. Resets when isGenerating toggles.
  useEffect(() => {
    if (!isGenerating) {
      setShowRetry(false);
      return;
    }
    const timer = window.setTimeout(() => setShowRetry(true), 20000);
    return () => window.clearTimeout(timer);
  }, [isGenerating]);

  const fetchLocations = useCallback(
    async (spec: PresetCharacterSpec, opts?: { reroll?: boolean }) => {
      const race = RACES_BY_ID[spec.raceId];
      const cls = CLASSES_BY_ID[spec.classId];
      if (!race || !cls) return;
      if (opts?.reroll) {
        setIsRerolling(true);
      } else {
        setIsGenerating(true);
        setShowRetry(false);
      }
      setGenFailed(false);
      const gid = ++generationIdRef.current;
      const abortController = new AbortController();
      abortRef.current = abortController;
      try {
        const locs = await onGenerateStartingLocations({ name: spec.name, race: race.name, class: cls.name }, abortController.signal);
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
        if (gid === generationIdRef.current) {
          setIsGenerating(false);
          setIsRerolling(false);
        }
      }
    },
    [onGenerateStartingLocations],
  );

  const handleSelectPreset = useCallback(
    (spec: PresetCharacterSpec) => {
      setSelectedSpec(spec);
      // Joiners skip the grounds step — the host already picked the starting
      // location. They confirm via the inline footer instead of instant finalize.
      if (isJoining) return;
      setSelectedLocation(null);
      setGeneratedLocations([]);
      setStep('grounds');
    },
    [isJoining],
  );

  // Auto-trigger location generation when entering the grounds step.
  useEffect(() => {
    if (step === 'grounds' && selectedSpec && generatedLocations.length === 0 && !isGenerating && !genFailed) {
      void fetchLocations(selectedSpec);
    }
  }, [step, selectedSpec, generatedLocations.length, isGenerating, genFailed, fetchLocations]);

  const handleBackToSelect = () => {
    abortRef.current?.abort();
    generationIdRef.current++;
    setStep('select');
    setSelectedSpec(null);
    setSelectedLocation(null);
    setGeneratedLocations([]);
    setGenFailed(false);
    setIsGenerating(false);
    setIsRerolling(false);
    setShowRetry(false);
  };

  const runRetry = () => {
    abortRef.current?.abort();
    if (selectedSpec) void fetchLocations(selectedSpec);
  };

  const runReroll = () => {
    abortRef.current?.abort();
    if (selectedSpec) void fetchLocations(selectedSpec, { reroll: true });
  };

  const confirmJoinHero = () => {
    if (!selectedSpec) return;
    if (campaignStartingLocation) onSetStartingLocation(campaignStartingLocation);
    onComplete(buildPresetCharacter(selectedSpec));
  };

  const handleBegin = () => {
    if (!selectedSpec || !selectedLocation) return;
    onSetStartingLocation(selectedLocation);
    onComplete(buildPresetCharacter(selectedSpec));
  };

  const raceDef = selectedSpec ? RACES_BY_ID[selectedSpec.raceId] : undefined;
  const classDef = selectedSpec ? CLASSES_BY_ID[selectedSpec.classId] : undefined;

  const heroSummary =
    selectedSpec && raceDef && classDef ? (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 rounded-xl bg-obsidian-900/70 border border-white/[0.06] px-4 py-3">
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-arcane-500/10 border border-arcane-500/30 text-arcane-300 shrink-0">
            <i className={cx('fas', classDef.icon)} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="font-display font-semibold text-parchment truncate">{selectedSpec.name}</p>
            <p className="text-[10px] font-display font-semibold uppercase tracking-[0.18em] text-ember-400/90">
              {raceDef.name} {classDef.name}
            </p>
          </div>
        </div>
        {selectedSpec.description && (
          <blockquote className="font-narration italic text-sm text-parchment-mute border-l-2 border-ember-600/60 pl-3 leading-relaxed">
            {selectedSpec.description}
          </blockquote>
        )}
      </div>
    ) : undefined;

  const hasDisabledPresets = PRESET_CHARACTERS.some(
    (spec) => getRaceAssessment(spec.raceId).status === 'disabled' || getClassAssessment(spec.classId).status === 'disabled',
  );

  return (
    <Screen dots>
      <div className="absolute top-4 left-4 md:top-6 md:left-6">
        <Button variant="ghost" size="sm" icon="fa-arrow-left" onClick={step === 'grounds' ? handleBackToSelect : onBack}>
          Back
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto v2-scrollbar">
        <div className="w-full max-w-4xl mx-auto px-4 py-12 md:py-14">
          <div className="bg-obsidian-900/60 border border-white/[0.06] rounded-2xl p-6 md:p-8 shadow-2xl">
            {step === 'select' && (
              <div className="flex flex-col gap-6 animate-fade-in">
                <div className="text-center">
                  <h2 className="font-display text-2xl md:text-3xl font-bold text-ember-500 tracking-wide mb-2">
                    {isJoining ? 'Join the Party' : 'Choose Your Hero'}
                  </h2>
                  <p className="text-parchment-mute text-xs md:text-sm">
                    {isJoining
                      ? campaignName
                        ? `Joining "${campaignName}" — pick a pre-made hero or forge your own.`
                        : 'Pick a pre-made hero or forge your own to join the party.'
                      : 'Ten pre-made level-1 adventurers. Pick one to begin your journey.'}
                  </p>
                </div>

                {isJoining && campaignStartingLocation && (
                  <div className="text-center bg-obsidian-950/60 border border-white/[0.06] rounded-xl p-3">
                    <p className="font-display text-[10px] text-parchment-faint uppercase tracking-[0.2em] font-semibold mb-1">
                      Campaign Starting Ground
                    </p>
                    <p className="font-display text-sm text-ember-400">{campaignStartingLocation.name}</p>
                    <p className="text-[10px] text-parchment-faint mt-1 line-clamp-2">{campaignStartingLocation.description}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {PRESET_CHARACTERS.map((spec) => {
                    const race = RACES_BY_ID[spec.raceId];
                    const cls = CLASSES_BY_ID[spec.classId];
                    if (!race || !cls) return null;
                    const { status, reason } = getPresetAssessment(spec);
                    const isDisabled = status === 'disabled';
                    const isSelected = isJoining && selectedSpec?.id === spec.id;
                    const statusIcon = STATUS_ICON[status];
                    return (
                      <button
                        key={spec.id}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => {
                          if (!isDisabled) handleSelectPreset(spec);
                        }}
                        className={cx(
                          'group relative flex flex-col items-center text-center p-3 border-2 rounded-xl transition-all duration-200',
                          isDisabled
                            ? 'opacity-40 cursor-not-allowed border-white/[0.05] bg-obsidian-900/30'
                            : isSelected
                              ? 'border-ember-500/70 bg-ember-500/10'
                              : 'bg-obsidian-900/50 border-white/[0.08] hover:border-ember-500/50 hover:bg-ember-500/5 cursor-pointer',
                        )}
                      >
                        <div className="absolute top-1.5 right-1.5">
                          <Tooltip content={<span className="whitespace-pre-line">{reason}</span>} side="top">
                            <i className={cx('fas text-xs', statusIcon.icon, statusIcon.cls)} aria-hidden="true" />
                          </Tooltip>
                        </div>
                        <div className="w-12 h-12 rounded-xl bg-arcane-500/10 border border-arcane-500/30 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                          <i className={cx('fas text-lg text-arcane-300', cls.icon)} aria-hidden="true" />
                        </div>
                        <h3 className="font-display font-semibold text-sm text-parchment leading-tight mb-0.5">{spec.name}</h3>
                        <p className="text-[10px] font-display font-semibold text-ember-400/90 uppercase tracking-[0.14em] mb-1.5">
                          {race.name} {cls.name}
                        </p>
                        <p className="text-[10px] text-parchment-mute leading-snug mb-2 line-clamp-2">{spec.tagline}</p>
                        <TopStats spec={spec} />
                      </button>
                    );
                  })}
                </div>

                {hasDisabledPresets && (
                  <p className="text-[10px] text-blood-400/60 text-center">
                    Some presets are temporarily disabled due to incomplete engine support. Forge a custom hero for those
                    options.
                  </p>
                )}

                {isJoining && selectedSpec && (
                  <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ember-500/40 bg-obsidian-850/95 backdrop-blur px-4 py-3 shadow-[0_10px_35px_rgba(0,0,0,0.6)] animate-slide-up">
                    <p className="text-sm text-parchment-dim">
                      Venture forth as{' '}
                      <span className="font-display font-semibold text-ember-300">{selectedSpec.name}</span>?
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setSelectedSpec(null)}>
                        Not Yet
                      </Button>
                      <Button size="sm" icon="fa-dice-d20" onClick={confirmJoinHero}>
                        Venture Forth
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={onSwitchToCustom}
                    className="font-display text-[11px] text-parchment-mute hover:text-ember-400 uppercase tracking-[0.2em] font-semibold transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <i className="fas fa-feather-pointed text-[9px]" aria-hidden="true" />
                    Forge a custom hero instead
                  </button>
                </div>
              </div>
            )}

            {step === 'grounds' && selectedSpec && raceDef && classDef && (
              <div className="flex flex-col gap-5 animate-fade-in">
                <div className="text-center">
                  <p className="font-display text-parchment-faint text-[10px] uppercase tracking-[0.25em] mb-1">
                    Where your tale begins
                  </p>
                  <h2 className="font-display text-2xl md:text-3xl font-bold text-ember-500 tracking-wide">
                    Choose Your Starting Grounds
                  </h2>
                </div>
                <StartingGroundsPicker
                  locations={generatedLocations}
                  isGenerating={isGenerating}
                  genFailed={genFailed}
                  selected={selectedLocation}
                  onSelect={setSelectedLocation}
                  onReroll={runReroll}
                  isRerolling={isRerolling}
                  onRetry={!isGenerating || showRetry ? runRetry : undefined}
                  onConfirm={handleBegin}
                  confirmDisabled={!selectedLocation}
                  heroSummary={heroSummary}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </Screen>
  );
};

export default QuickStartScreen;
