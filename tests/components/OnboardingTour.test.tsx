import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import OnboardingTour from '../../components/onboarding/OnboardingTour';

describe('<OnboardingTour>', () => {
  afterEach(() => cleanup());

  it('renders nothing when inactive', () => {
    const onDismiss = vi.fn();
    const { queryByText } = render(<OnboardingTour active={false} onDismiss={onDismiss} />);
    expect(queryByText(/Skip Tour/i)).toBeNull();
  });

  it('renders the Skip Tour button when active', () => {
    const onDismiss = vi.fn();
    const { getByText } = render(<OnboardingTour active={true} onDismiss={onDismiss} />);
    expect(getByText(/Skip Tour/i)).toBeTruthy();
  });

  it('shows the step counter (1 / N)', () => {
    const onDismiss = vi.fn();
    const { getByText } = render(<OnboardingTour active={true} onDismiss={onDismiss} />);
    expect(getByText(/1 \//)).toBeTruthy();
  });

  it('advances to the next step when Next is clicked', () => {
    const onDismiss = vi.fn();
    const { getByText } = render(<OnboardingTour active={true} onDismiss={onDismiss} />);
    const next = getByText('Next');
    fireEvent.click(next);
    expect(getByText(/2 \//)).toBeTruthy();
  });

  it('invokes onDismiss when Skip Tour is clicked', () => {
    const onDismiss = vi.fn();
    const { getByText } = render(<OnboardingTour active={true} onDismiss={onDismiss} />);
    fireEvent.click(getByText(/Skip Tour/i));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders the combat step when combatActive is true (extra step)', () => {
    const onDismiss = vi.fn();
    const { getByText, rerender } = render(<OnboardingTour active={true} onDismiss={onDismiss} />);
    // base step count (solo: queue step hidden)
    expect(getByText(/1 \//).textContent).toContain('1 / 4');
    rerender(<OnboardingTour active={true} combatActive onDismiss={onDismiss} />);
    expect(getByText(/1 \//).textContent).toContain('1 / 5');
  });

  it('includes the Action Queue step only when multiplayer is true', () => {
    const onDismiss = vi.fn();
    // multiplayer: queue step restored (5 base steps)
    const { getByText, rerender } = render(<OnboardingTour active={true} multiplayer onDismiss={onDismiss} />);
    expect(getByText(/1 \//).textContent).toContain('1 / 5');
    // multiplayer + combat: 6 steps
    rerender(<OnboardingTour active={true} multiplayer combatActive onDismiss={onDismiss} />);
    expect(getByText(/1 \//).textContent).toContain('1 / 6');
  });
});
