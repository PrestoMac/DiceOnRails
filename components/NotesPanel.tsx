import React, { useState, useEffect } from 'react';
import { Character } from '../types';

interface NotesPanelProps {
  character: Character;
  /** The current viewer's user id. Used to gate the personal `notes` field to
   *  the character's owner (private-by-convention). */
  currentUserId?: string;
  /** True when the viewer is the campaign host. Gates the `gmNotes` field.
   *  Currently always false at the play stage (host_id is not plumbed through);
   *  wire this from campaign metadata to enable GM notes. */
  isHost?: boolean;
  /** Persist edited notes back to game state. */
  onSaveNotes: (charId: string, notes: string) => void;
  onSaveGmNotes: (charId: string, gmNotes: string) => void;
}

/**
 * Per-player private notes (issue 10). Privacy is enforced by UI convention, not
 * at the data layer: notes live on the Character in the shared game-state blob,
 * but this panel only renders them for the owner (notes) or host (gmNotes). The
 * fields are deliberately excluded from buildContextString / buildBatchContextString
 * so the LLM never sees them. For a trusted-friends group this is the right
 * tradeoff; true cryptographic privacy would require a separate RLS-gated table.
 */
const NotesPanel: React.FC<NotesPanelProps> = ({ character, currentUserId, isHost, onSaveNotes, onSaveGmNotes }) => {
  const isOwner = !currentUserId || character.ownerId === currentUserId;
  const [notes, setNotes] = useState(character.notes ?? '');
  const [gmNotes, setGmNotes] = useState(character.gmNotes ?? '');
  const [editingNotes, setEditingNotes] = useState(false);
  const [editingGm, setEditingGm] = useState(false);

  // Re-sync local draft when the underlying character changes (e.g. remote sync).
  useEffect(() => { if (!editingNotes) setNotes(character.notes ?? ''); }, [character.notes, editingNotes]);
  useEffect(() => { if (!editingGm) setGmNotes(character.gmNotes ?? ''); }, [character.gmNotes, editingGm]);

  if (!isOwner && !isHost) return null;

  return (
    <div className="mt-4 space-y-3">
      {isOwner && (
        <div className="bg-stone-950/40 border border-stone-850 rounded-lg p-3 text-left">
          <div className="flex items-center justify-between mb-1.5">
            <h3 className="text-xs uppercase font-bold text-amber-500 tracking-widest flex items-center gap-2">
              <i className="fas fa-feather-pointed text-[10px]"></i>Personal Notes
            </h3>
            {!editingNotes
              ? <button onClick={() => setEditingNotes(true)} className="text-[10px] text-stone-500 hover:text-amber-500 uppercase tracking-wider transition-colors">Edit</button>
              : <button onClick={() => { onSaveNotes(character.id, notes); setEditingNotes(false); }} className="text-[10px] text-green-500 hover:text-green-400 uppercase tracking-wider transition-colors">Save</button>}
          </div>
          {editingNotes ? (
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Private journal — only you can see this."
              className="w-full h-24 bg-stone-900 border border-stone-800 rounded p-2 text-xs text-stone-300 resize-y focus:outline-none focus:border-amber-700/50"
            />
          ) : (
            <p className="text-xs text-stone-400 whitespace-pre-wrap italic min-h-[1.5rem]">{notes || 'No personal notes yet.'}</p>
          )}
        </div>
      )}
      {isHost && (
        <div className="bg-amber-950/20 border border-amber-900/40 rounded-lg p-3 text-left">
          <div className="flex items-center justify-between mb-1.5">
            <h3 className="text-xs uppercase font-bold text-amber-400 tracking-widest flex items-center gap-2">
              <i className="fas fa-crown text-[10px]"></i>GM Notes
            </h3>
            {!editingGm
              ? <button onClick={() => setEditingGm(true)} className="text-[10px] text-stone-500 hover:text-amber-500 uppercase tracking-wider transition-colors">Edit</button>
              : <button onClick={() => { onSaveGmNotes(character.id, gmNotes); setEditingGm(false); }} className="text-[10px] text-green-500 hover:text-green-400 uppercase tracking-wider transition-colors">Save</button>}
          </div>
          {editingGm ? (
            <textarea
              value={gmNotes}
              onChange={e => setGmNotes(e.target.value)}
              placeholder="Host-only notes — visible only to the campaign host."
              className="w-full h-24 bg-stone-900 border border-stone-800 rounded p-2 text-xs text-stone-300 resize-y focus:outline-none focus:border-amber-700/50"
            />
          ) : (
            <p className="text-xs text-stone-400 whitespace-pre-wrap italic min-h-[1.5rem]">{gmNotes || 'No GM notes yet.'}</p>
          )}
        </div>
      )}
    </div>
  );
};

export default NotesPanel;
