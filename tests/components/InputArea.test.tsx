import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
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
});
