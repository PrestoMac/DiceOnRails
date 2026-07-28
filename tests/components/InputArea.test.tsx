import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import InputArea from '../../components/InputArea';

vi.mock('../../services/supabaseClient', () => ({ supabaseClient: {} }));
vi.mock('../../services/audioService', () => ({ getVoices: () => Promise.resolve([]) }));
vi.mock('../../services/authService', () => ({ authService: { updatePassword: vi.fn() } }));
vi.mock('../../utils/debug', () => ({ isDebugMode: false, setDebugMode: vi.fn() }));

const baseCharacter = {
  id: 'c1', name: 'Hero', class: 'Wizard', race: 'Human', level: 1,
  hp: { current: 6, max: 6 },
  stats: { str: 10, dex: 14, con: 12, int: 18, wis: 12, cha: 10 },
  inventory: [{ name: 'Potion of Healing', quantity: 1, type: 'potion' as const }],
  currency: { gp: 0, sp: 0, cp: 0 },
  location: '',
  experience: 0, experienceToNextLevel: 300,
  unusedStatPoints: 0, maxHpBonus: 0, hitDice: { current: 1, max: 1 },
  skills: { arcana: 2, perception: 1 },
  knownSpells: ['magic-missile'],
  preparedSpells: [],
};

describe('<InputArea> expanded Quick Actions', () => {
  afterEach(() => cleanup());

  it('renders spell quick actions', () => {
    const { getByText } = render(<InputArea onSendMessage={vi.fn()} isLoading={false} character={baseCharacter as never} />);
    expect(getByText('Magic Missile')).toBeTruthy();
  });

  it('renders trained skills as quick actions', () => {
    const { getByText } = render(<InputArea onSendMessage={vi.fn()} isLoading={false} character={baseCharacter as never} />);
    expect(getByText('Arcana')).toBeTruthy();
    expect(getByText('Perception')).toBeTruthy();
  });

  it('renders potions as item quick actions', () => {
    const { getByText } = render(<InputArea onSendMessage={vi.fn()} isLoading={false} character={baseCharacter as never} />);
    expect(getByText('Potion of Healing')).toBeTruthy();
  });

  it('renders a death save action when HP is 0', () => {
    const dying = { ...baseCharacter, hp: { current: 0, max: 6 } };
    const { getByText } = render(<InputArea onSendMessage={vi.fn()} isLoading={false} character={dying as never} />);
    expect(getByText('Death Save')).toBeTruthy();
  });

  it('does NOT render a death save action when HP > 0', () => {
    const { queryByText } = render(<InputArea onSendMessage={vi.fn()} isLoading={false} character={baseCharacter as never} />);
    expect(queryByText('Death Save')).toBeNull();
  });

  it('renders Arcane Recovery button when character is a wizard with charge available', () => {
    const wizard = { ...baseCharacter, class: 'wizard', resources: [{ id: 'arcane-recovery', name: 'Arcane Recovery', current: 1, max: 1, resetOn: 'long', source: 'class', sourceId: 'wizard' }] };
    const { getByText } = render(<InputArea onSendMessage={vi.fn()} isLoading={false} character={wizard as never} onArcaneRecovery={vi.fn()} />);
    expect(getByText('Arcane Recovery')).toBeTruthy();
  });

  it('hides Arcane Recovery button when charge is exhausted', () => {
    const wizard = { ...baseCharacter, class: 'wizard', resources: [{ id: 'arcane-recovery', name: 'Arcane Recovery', current: 0, max: 1, resetOn: 'long', source: 'class', sourceId: 'wizard' }] };
    const { queryByText } = render(<InputArea onSendMessage={vi.fn()} isLoading={false} character={wizard as never} onArcaneRecovery={vi.fn()} />);
    expect(queryByText('Arcane Recovery')).toBeNull();
  });

  it('hides Arcane Recovery button for non-wizard characters', () => {
    const { queryByText } = render(<InputArea onSendMessage={vi.fn()} isLoading={false} character={baseCharacter as never} onArcaneRecovery={vi.fn()} />);
    expect(queryByText('Arcane Recovery')).toBeNull();
  });
});

describe('<InputArea> typing indicator sync (Bug 3)', () => {
  afterEach(() => cleanup());

  it('calls onInputChanged("") on send so the typing indicator clears immediately', () => {
    const onInputChanged = vi.fn();
    const onSendMessage = vi.fn();
    const { getByPlaceholderText, getByRole } = render(
      <InputArea onSendMessage={onSendMessage} isLoading={false} character={baseCharacter as never} onInputChanged={onInputChanged} />,
    );
    const input = getByPlaceholderText('What do you do, adventurer?');
    // Type via RTL's fireEvent so React's synthetic onChange fires (raw
    // dispatchEvent('input') doesn't trigger React's onChange in jsdom).
    fireEvent.change(input, { target: { value: 'I attack the goblin' } });
    expect(onInputChanged).toHaveBeenLastCalledWith('I attack the goblin');
    // Click the submit button to fire the form submit.
    fireEvent.click(getByRole('button', { name: /Act Now/i }));
    expect(onSendMessage).toHaveBeenCalledWith('I attack the goblin');
    expect(onInputChanged).toHaveBeenLastCalledWith('');
  });

  it('does NOT call onSendMessage or onInputChanged("") when input is empty', () => {
    const onInputChanged = vi.fn();
    const onSendMessage = vi.fn();
    const { getByRole } = render(
      <InputArea onSendMessage={onSendMessage} isLoading={false} character={baseCharacter as never} onInputChanged={onInputChanged} />,
    );
    // When input is empty the "Act Now" submit button is disabled.
    const submitBtn = getByRole('button', { name: /Act Now/i });
    expect((submitBtn as HTMLButtonElement).disabled).toBe(true);
    expect(onSendMessage).not.toHaveBeenCalled();
    expect(onInputChanged).not.toHaveBeenCalledWith('');
  });
});
