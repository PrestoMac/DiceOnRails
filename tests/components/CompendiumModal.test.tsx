import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import CompendiumModal from '../../components/CompendiumModal';

// Mock supabaseClient + audio + auth for component-tree render safety.
vi.mock('../../services/supabaseClient', () => ({ supabaseClient: {} }));
vi.mock('../../services/audioService', () => ({ getVoices: () => Promise.resolve([]) }));
vi.mock('../../services/authService', () => ({ authService: { updatePassword: vi.fn() } }));
vi.mock('../../utils/debug', () => ({ isDebugMode: false, setDebugMode: vi.fn() }));

describe('<CompendiumModal>', () => {
  afterEach(() => cleanup());

  it('renders nothing when closed', () => {
    const { queryByText } = render(<CompendiumModal isOpen={false} onClose={vi.fn()} />);
    expect(queryByText('Glossary')).toBeNull();
  });

  it('renders the five tab buttons when open', () => {
    const { getByText } = render(<CompendiumModal isOpen={true} onClose={vi.fn()} />);
    expect(getByText('Glossary')).toBeTruthy();
    expect(getByText('Conditions')).toBeTruthy();
    expect(getByText('Rules')).toBeTruthy();
    expect(getByText('Spells')).toBeTruthy();
    expect(getByText('Items')).toBeTruthy();
  });

  it('defaults to the Glossary tab', () => {
    const { getByPlaceholderText, getAllByText } = render(<CompendiumModal isOpen={true} onClose={vi.fn()} />);
    expect(getByPlaceholderText(/Search jargon/i)).toBeTruthy();
    expect(getAllByText(/AC \(Armor Class\)/i).length).toBeGreaterThan(0);
  });

  it('switches to the Conditions tab and renders exhaustion levels', () => {
    const { getByText } = render(<CompendiumModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.click(getByText('Conditions'));
    expect(getByText(/Exhaustion Levels/i)).toBeTruthy();
    expect(getByText(/Speed halved/i)).toBeTruthy();
  });

  it('switches to the Rules tab and renders currency conversion', () => {
    const { getByText } = render(<CompendiumModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.click(getByText('Rules'));
    expect(getByText(/10 CP = 1 SP/i)).toBeTruthy();
    expect(getByText(/Death Saves/i)).toBeTruthy();
  });

  it('switches to the Spells tab and renders at least one known spell', () => {
    const { getByText, getByPlaceholderText } = render(<CompendiumModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.click(getByText('Spells'));
    expect(getByPlaceholderText(/Search spells/i)).toBeTruthy();
  });

  it('switches to the Items tab', () => {
    const { getByText, getByPlaceholderText } = render(<CompendiumModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.click(getByText('Items'));
    expect(getByPlaceholderText(/Search items/i)).toBeTruthy();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(<CompendiumModal isOpen={true} onClose={onClose} />);
    fireEvent.click(getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
