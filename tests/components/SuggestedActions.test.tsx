import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import SuggestedActions from '../../components/SuggestedActions';

describe('<SuggestedActions>', () => {
  afterEach(() => cleanup());

  it('renders nothing when suggestions is empty', () => {
    const { queryByText } = render(<SuggestedActions suggestions={[]} onPick={vi.fn()} />);
    expect(queryByText('Suggest:')).toBeNull();
  });

  it('renders the suggest label and chips when present', () => {
    const { getByText } = render(<SuggestedActions suggestions={['Do X']} onPick={vi.fn()} />);
    expect(getByText('Suggest:')).toBeTruthy();
    expect(getByText('Do X')).toBeTruthy();
  });

  it('invokes onPick with the suggestion text on click', () => {
    const onPick = vi.fn();
    const { getByText } = render(<SuggestedActions suggestions={['Cast Shield']} onPick={onPick} />);
    fireEvent.click(getByText('Cast Shield'));
    expect(onPick).toHaveBeenCalledWith('Cast Shield');
  });

  it('invokes onDismiss when the dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    const { getByLabelText } = render(<SuggestedActions suggestions={['A']} onPick={vi.fn()} onDismiss={onDismiss} />);
    fireEvent.click(getByLabelText('Dismiss suggestions'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
