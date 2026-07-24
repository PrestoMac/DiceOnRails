import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { Character } from '../../types';
import NotesPanel from '../../components/NotesPanel';

function makeChar(): Character {
  return {
    id: 'char-1', name: 'Aragorn', ownerId: 'user-A',
    notes: 'My journal', gmNotes: 'GM secrets',
  } as unknown as Character;
}

describe('NotesPanel (issue 10 — per-player private notes)', () => {
  const onSaveNotes = vi.fn();
  const onSaveGmNotes = vi.fn();

  it('renders nothing when the viewer is neither owner nor host', () => {
    const { container } = render(
      <NotesPanel character={makeChar()} currentUserId="user-OTHER" isHost={false} onSaveNotes={onSaveNotes} onSaveGmNotes={onSaveGmNotes} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows personal notes only to the owner', () => {
    render(
      <NotesPanel character={makeChar()} currentUserId="user-A" isHost={false} onSaveNotes={onSaveNotes} onSaveGmNotes={onSaveGmNotes} />
    );
    expect(screen.getByText('Personal Notes')).toBeInTheDocument();
    expect(screen.getByText('My journal')).toBeInTheDocument();
    // GM notes must NOT appear for a non-host owner.
    expect(screen.queryByText('GM Notes')).not.toBeInTheDocument();
    expect(screen.queryByText('GM secrets')).not.toBeInTheDocument();
  });

  it('does not show personal notes to a non-owner host (only GM notes)', () => {
    render(
      <NotesPanel character={makeChar()} currentUserId="user-HOST" isHost={true} onSaveNotes={onSaveNotes} onSaveGmNotes={onSaveGmNotes} />
    );
    expect(screen.getByText('GM Notes')).toBeInTheDocument();
    expect(screen.getByText('GM secrets')).toBeInTheDocument();
    // Personal notes must NOT appear for a non-owner.
    expect(screen.queryByText('Personal Notes')).not.toBeInTheDocument();
    expect(screen.queryByText('My journal')).not.toBeInTheDocument();
  });

  it('shows both panels when the viewer is both owner and host', () => {
    render(
      <NotesPanel character={makeChar()} currentUserId="user-A" isHost={true} onSaveNotes={onSaveNotes} onSaveGmNotes={onSaveGmNotes} />
    );
    expect(screen.getByText('Personal Notes')).toBeInTheDocument();
    expect(screen.getByText('GM Notes')).toBeInTheDocument();
  });

  it('owner with no userId treated as owner (anonymous/solo sees their notes)', () => {
    render(
      <NotesPanel character={makeChar()} isHost={false} onSaveNotes={onSaveNotes} onSaveGmNotes={onSaveGmNotes} />
    );
    expect(screen.getByText('Personal Notes')).toBeInTheDocument();
  });

  it('persists edited notes via onSaveNotes', () => {
    render(
      <NotesPanel character={makeChar()} currentUserId="user-A" isHost={false} onSaveNotes={onSaveNotes} onSaveGmNotes={onSaveGmNotes} />
    );
    fireEvent.click(screen.getByText('Edit'));
    const textarea = screen.getByPlaceholderText('Private journal — only you can see this.') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Updated entry' } });
    fireEvent.click(screen.getByText('Save'));
    expect(onSaveNotes).toHaveBeenCalledWith('char-1', 'Updated entry');
  });
});
