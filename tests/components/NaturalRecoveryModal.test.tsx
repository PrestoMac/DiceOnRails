import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NaturalRecoveryModal from '../../components/NaturalRecoveryModal';
import type { Character } from '../../types';

function makeDruid(overrides: Partial<Character> = {}): Character {
  return {
    id: 'druid-1',
    name: 'Willow',
    class: 'druid',
    race: 'half-elf',
    level: 4,
    hp: { current: 30, max: 30 },
    stats: { str: 8, dex: 14, con: 12, int: 12, wis: 16, cha: 10 },
    inventory: [],
    currency: { gp: 10, sp: 0, cp: 0 },
    location: 'Test Grove',
    experience: 0,
    experienceToNextLevel: 2700,
    unusedStatPoints: 0,
    maxHpBonus: 0,
    hitDice: { current: 4, max: 4 },
    skills: {},
    resources: [
      { id: 'spell-slot-1', name: 'Level 1 Spell Slot', current: 2, max: 4, resetOn: 'long', source: 'class', sourceId: 'druid' },
      { id: 'spell-slot-2', name: 'Level 2 Spell Slot', current: 0, max: 3, resetOn: 'long', source: 'class', sourceId: 'druid' },
    ],
    ...overrides,
  };
}

describe('NaturalRecoveryModal', () => {
  it('renders with druid info and recovery capacity', () => {
    const druid = makeDruid();
    const onRecover = vi.fn();
    render(
      <NaturalRecoveryModal
        character={druid}
        isOpen={true}
        onClose={() => {}}
        onRecover={onRecover}
      />
    );
    expect(screen.getByText('Natural Recovery')).toBeInTheDocument();
    expect(screen.getByText(/Willow/)).toBeInTheDocument();
    expect(screen.getByText(/2 levels/)).toBeInTheDocument(); // ceil(4/2) = 2
  });

  it('allows selecting spell slots to recover', () => {
    const druid = makeDruid();
    const onRecover = vi.fn();
    render(
      <NaturalRecoveryModal
        character={druid}
        isOpen={true}
        onClose={() => {}}
        onRecover={onRecover}
      />
    );
    // Find the Recover Slots button and click it (no slots selected = no-op, but exercises the button)
    const recoverBtn = screen.getByText('Recover Slots');
    fireEvent.click(recoverBtn);
    // With no allocations, onRecover should not be called
    expect(onRecover).not.toHaveBeenCalled();
  });

  it('Cancel button calls onClose', () => {
    const druid = makeDruid();
    const onClose = vi.fn();
    render(
      <NaturalRecoveryModal
        character={druid}
        isOpen={true}
        onClose={onClose}
        onRecover={() => {}}
      />
    );
    const cancelBtn = screen.getByText('Cancel');
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not render any content when closed', () => {
    const druid = makeDruid();
    render(
      <NaturalRecoveryModal
        character={druid}
        isOpen={false}
        onClose={() => {}}
        onRecover={() => {}}
      />
    );
    expect(screen.queryByText('Natural Recovery')).not.toBeInTheDocument();
  });
});
