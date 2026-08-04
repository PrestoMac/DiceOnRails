import React from 'react';
import StartingGroundsPicker from '../../pregame/shared/StartingGroundsPicker';
import type { ForgeStepProps } from '../forgeTypes';

/** Props for the forge starting-grounds step (new campaigns only). */
export interface GroundsStepV2Props extends ForgeStepProps {
  /** True once a generation attempt finished with zero locations (shows retry UI). */
  genFailed: boolean;
  onReroll: () => void;
  /** Confirms the selected grounds and finalizes the character. */
  onConfirm: () => void;
  confirmDisabled: boolean;
  heroSummary?: React.ReactNode;
}

/**
 * Forge step 11: host-only starting grounds. Thin wrapper mapping wizard
 * state onto the shared StartingGroundsPicker (owned by another teammate —
 * the picker handles all rendering).
 */
const GroundsStepV2: React.FC<GroundsStepV2Props> = ({
  wizard, updateWizard, genFailed, onReroll, onConfirm, confirmDisabled, heroSummary,
}) => (
  <StartingGroundsPicker
    locations={wizard.generatedLocations}
    isGenerating={wizard.isGeneratingLocs}
    genFailed={genFailed}
    selected={wizard.selectedLocation}
    onSelect={loc => updateWizard({ selectedLocation: loc })}
    onReroll={onReroll}
    isRerolling={wizard.isRerolling}
    onRetry={onReroll}
    confirmLabel="Begin Your Chronicle"
    onConfirm={onConfirm}
    confirmDisabled={confirmDisabled}
    heroSummary={heroSummary}
  />
);

export default GroundsStepV2;
