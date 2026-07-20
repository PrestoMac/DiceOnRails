import React, { useState, useMemo, useCallback } from 'react';
import { WizardStep, WizardStepContext } from './WizardStep';

/** Props for the StepWizard component. */
interface StepWizardProps<TState> {
  steps: WizardStep<TState>[];
  state: TState;
  updateState: (updates: Partial<TState>) => void;
  renderProgress?: (props: { currentIndex: number; total: number; steps: WizardStep<TState>[]; goToStep: (stepKey: string) => void }) => React.ReactNode;
  renderHeader?: React.ReactNode;
  className?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extraProps?: Record<string, any>;
}

/** Generic multi-step wizard that renders visible steps sequentially with navigation (back/forward/jump-to-step). */
function StepWizard<TState>({
  steps, state, updateState, renderProgress, renderHeader, className, extraProps,
}: StepWizardProps<TState>) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [stepHistory, setStepHistory] = useState<string[]>([]);
  const [currentKey, setCurrentKey] = useState(() => steps[0]?.key || '');

  const visibleSteps = useMemo(() => steps.filter(s => !s.isVisible || s.isVisible(state)), [steps, state]);
  const currentIndex = useMemo(() => visibleSteps.findIndex(s => s.key === currentKey), [visibleSteps, currentKey]);
  const currentStep = visibleSteps[currentIndex];
  const isFirstStep = currentIndex <= 0;
  const isLastStep = currentIndex === visibleSteps.length - 1;

  const goToStep = useCallback((stepKey: string) => {
    if (visibleSteps.some(s => s.key === stepKey)) {
      setStepHistory(prev => [...prev, currentKey]);
      setCurrentKey(stepKey);
    }
  }, [visibleSteps, currentKey]);

  const goBack = useCallback(() => {
    setStepHistory(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setCurrentKey(last);
      return prev.slice(0, -1);
    });
  }, []);

  const ctx = useMemo<WizardStepContext>(() => ({
    goToStep,
    goBack,
    currentStep: currentKey,
    isLastStep,
    isFirstStep,
  }), [goToStep, goBack, currentKey, isLastStep, isFirstStep]);

  const StepComponent = currentStep?.render;

  return (
    <div className={className || ''}>
      {renderHeader}
      {renderProgress && currentIndex >= 0 && renderProgress({ currentIndex, total: visibleSteps.length, steps: visibleSteps, goToStep })}
      {StepComponent && currentStep && (
        <StepComponent
          state={state}
          updateState={updateState}
          context={ctx}
          {...(extraProps || {})}
        />
      )}
    </div>
  );
}

export default StepWizard;
