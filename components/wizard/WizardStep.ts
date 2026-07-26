import React from 'react';

/** Navigation context provided to each step's render component. */
export interface WizardStepContext {
  goToStep: (stepKey: string) => void;
  goBack: () => void;
  currentStep: string;
  isLastStep: boolean;
  isFirstStep: boolean;
}

/** Defines a single step in a multi-step wizard: key, label, render component, and lifecycle hooks. Validation is performed by each step's own continue handler and the orchestrator's finalize routine, not by this framework. */
export interface WizardStep<TState, TExtraProps = Record<string, never>> {
  key: string;
  label: string;
  icon?: string;
  render: React.FC<{
    state: TState;
    updateState: (updates: Partial<TState>) => void;
    context: WizardStepContext;
  } & TExtraProps>;
  onNext?: (state: TState) => TState | Promise<TState>;
  onBack?: (state: TState) => TState;
  isVisible?: (state: TState) => boolean;
  canProceed?: (state: TState) => boolean;
}
