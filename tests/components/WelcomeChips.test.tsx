import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import WelcomeChips from '../../components/onboarding/WelcomeChips';

describe('<WelcomeChips>', () => {
  afterEach(() => cleanup());

  it('renders at least one example prompt chip', () => {
    const { getAllByRole } = render(<WelcomeChips onPick={vi.fn()} />);
    const buttons = getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('invokes onPick with the chip text when clicked', () => {
    const onPick = vi.fn();
    const { getByText } = render(<WelcomeChips onPick={onPick} />);
    fireEvent.click(getByText(/search the room for traps/i));
    expect(onPick).toHaveBeenCalledWith('I search the room for traps');
  });

  it('renders a different onPick text per chip', () => {
    const onPick = vi.fn();
    const { getByText } = render(<WelcomeChips onPick={onPick} />);
    fireEvent.click(getByText(/persuade the guard/i));
    expect(onPick).toHaveBeenCalledWith("I'd like to persuade the guard");
  });
});
