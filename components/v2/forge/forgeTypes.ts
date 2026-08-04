import type { Character, FeatSelection, StartingLocation } from '../../../types';
import type { WizardState } from '../../creation/types';
import { ASI_LEVELS } from '../../../constants';
import { RACES_CATALOG } from '../../../utils/races';
import { CLASSES_CATALOG } from '../../../utils/classes';

/* The forge reuses the canonical WizardState domain shape so
 * `buildCharacterFromWizard` keeps working unchanged. */
export type { WizardState } from '../../creation/types';
export type { Character, FeatSelection, StartingLocation };

/**
 * Forge-local ASI/feat slot. Identical to `FeatSelection` except `type` may be
 * `null` (the user has not chosen ASI-vs-feat yet) — this replaces the legacy
 * `{ type: null as unknown as 'asi' | 'feat' | null }` cast hack in the old
 * shell. Slots are materialized into real `FeatSelection`s at finalize.
 */
export type ForgeFeatSlot = Omit<Partial<FeatSelection>, 'type'> & { type: 'asi' | 'feat' | null };

/** Forge wizard state: the canonical `WizardState` with nullable-type feat slots. */
export type ForgeState = Omit<WizardState, 'asiFeatSlots'> & { asiFeatSlots: ForgeFeatSlot[] };

/** WizardState updater (accepts partial patches; the shell merges). */
export type UpdateWizard = (updates: Partial<ForgeState>) => void;

/** Base props shared by every forge step. The shell owns all navigation. */
export interface ForgeStepProps {
  wizard: ForgeState;
  updateWizard: UpdateWizard;
}

/** Typed factory for an unpicked ASI/feat slot (no casts). */
export const emptyForgeSlot = (): ForgeFeatSlot => ({ level: 0, type: null });

/**
 * Materializes forge slots into engine `FeatSelection` rows. Slot array index
 * maps to `ASI_LEVELS[idx]` (indices [1, 4, 8, 12, 16, 19]) exactly like the
 * legacy shell. Null-type slots are dropped — the shell validates that none
 * remain before finalize, so the output preserves slot order/indices.
 */
export function materializeFeatSlots(slots: ForgeFeatSlot[]): FeatSelection[] {
  const out: FeatSelection[] = [];
  slots.forEach((slot, idx) => {
    if (slot.type === null) return;
    out.push({
      level: ASI_LEVELS[idx] ?? 1,
      type: slot.type,
      featId: slot.featId,
      statAllocations: slot.statAllocations,
      saveStatChoice: slot.saveStatChoice,
      skillChoices: slot.skillChoices,
    });
  });
  return out;
}

/** Initial forge state — mirrors the legacy WizardShell defaults exactly. */
export function createInitialForgeState(defaultLevel: number | undefined): ForgeState {
  const level = Math.min(20, Math.max(1, defaultLevel ?? 1));
  return {
    name: '',
    level,
    backstory: '',
    alignment: '',
    background: '',
    personalityTraits: [],
    ideals: [],
    bonds: [],
    flaws: [],
    appearance: '',
    selectedRace: RACES_CATALOG[0],
    selectedClass: CLASSES_CATALOG[0],
    stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    inventory: [],
    allocatedSkills: {},
    goldPool: 10,
    selectedSpells: [],
    selectedCantrips: [],
    selectedSubclassId: null,
    asiFeatSlots: ASI_LEVELS.filter(l => l <= level).map(emptyForgeSlot),
    draconicAncestry: null,
    halfElfChoice1: null,
    halfElfChoice2: null,
    generatedLocations: [],
    selectedLocation: null,
    isGeneratingLocs: false,
    isRerolling: false,
    statsGenMode: 'buy',
    rolledStatValues: [],
    rollHistory: [],
    bonusStatAllocations: {},
    fightingStyleChoice: null,
    invocationChoices: [],
    selectedSubraceId: null,
  };
}

/** A checklist issue for the review step (clicking jumps back to the step). */
export interface ForgeIssue {
  stepKey: string;
  label: string;
  message: string;
}
