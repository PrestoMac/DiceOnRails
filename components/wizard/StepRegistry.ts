import { WizardStep } from './WizardStep';

export class StepRegistry<TState> {
  private registry = new Map<string, WizardStep<TState>>();
  private order: string[] = [];

  register(step: WizardStep<TState>): this {
    this.registry.set(step.key, step);
    this.order.push(step.key);
    return this;
  }

  get(key: string): WizardStep<TState> | undefined { return this.registry.get(key); }

  getVisibleSteps(state: TState): WizardStep<TState>[] {
    return this.order.map(k => this.registry.get(k)!).filter(s => !s.isVisible || s.isVisible(state));
  }

  getAllSteps(): WizardStep<TState>[] { return this.order.map(k => this.registry.get(k)!); }
}
