import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Character, SpellDefinition } from '../types';
import { SPELLS_BY_ID, getSpellsForClass } from '../utils/spells';
import { getClassDef } from '../services/classEngine';
import { getMaxPrepared, getCantripsKnown } from '../services/spellcastingEngine';
import SpellDetailModal from './modals/SpellDetailModal';
import Tooltip from './ui/Tooltip';

interface SpellbookModalProps {
  character: Character;
  isOpen: boolean;
  onClose: () => void;
  /** Prepared-caster management (prepare / unprepare). Required. */
  onManageSpellbook: (characterId: string, action: 'prepare' | 'unprepare' | 'learn', spellId: string) => Promise<boolean>;
  /** Known-caster Tasha's-style swap. Optional; only invoked when the character
   *  has `pendingSpellSwap === true`. If omitted, known casters see a read-only view. */
  onSwapKnownSpell?: (characterId: string, oldSpellId: string, newSpellId: string) => Promise<boolean>;
  /** When true, the modal renders a locked overlay (combat active). */
  isCombatActive?: boolean;
}

const SCHOOL_ICONS: Record<string, string> = {
  evocation: 'fa-fire', abjuration: 'fa-shield', conjuration: 'fa-wand-sparkles',
  divination: 'fa-eye', enchantment: 'fa-heart', illusion: 'fa-cloud',
  necromancy: 'fa-skull', transmutation: 'fa-flask',
};

const SPELL_FILTERS = ['all', 'damage', 'healing', 'utility', 'control'] as const;

const levelLabel = (lvl: number): string => {
  if (lvl === 0) return 'Cantrip';
  const suffix = lvl === 1 ? 'st' : lvl === 2 ? 'nd' : lvl === 3 ? 'rd' : 'th';
  return `${lvl}${suffix}`;
};

/** Modal for managing a spellcaster's prepared spells (prepared casters) or
 *  viewing/swapping known spells (known casters). Mirrors the ArcaneRecoveryModal
 *  layout. Bypasses the LLM agent loop — all mutations go through engine methods. */
const SpellbookModal: React.FC<SpellbookModalProps> = ({
  character, isOpen, onClose, onManageSpellbook, onSwapKnownSpell, isCombatActive,
}) => {
  const [filter, setFilter] = useState<typeof SPELL_FILTERS[number]>('all');
  const [viewingSpell, setViewingSpell] = useState<SpellDefinition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [swapPickOld, setSwapPickOld] = useState<string | null>(null);

  const classDef = useMemo(() => getClassDef(character.class), [character.class]);
  const prepMode = classDef?.spellcasting?.prepMode;
  const isPrepared = prepMode === 'prepared';
  const isKnown = prepMode === 'known';
  const hasPendingSwap = !!character.pendingSpellSwap;

  const maxPrepared = useMemo(
    () => isPrepared ? getMaxPrepared(character, character.level) : 0,
    [character, isPrepared]
  );

  const knownCantrips = useMemo(
    () => (character.knownSpells ?? []).map(id => SPELLS_BY_ID[id]).filter(s => s && s.level === 0),
    [character.knownSpells]
  );
  const knownLeveled = useMemo(
    () => (character.knownSpells ?? []).map(id => SPELLS_BY_ID[id]).filter(s => s && s.level > 0).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
    [character.knownSpells]
  );
  const preparedLeveled = useMemo(
    () => (character.preparedSpells ?? []).map(id => SPELLS_BY_ID[id]).filter(s => s && s.level > 0).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
    [character.preparedSpells]
  );
  const preparedCount = preparedLeveled.length;

  const classCatalog = useMemo(
    () => classDef ? getSpellsForClass(classDef.id) : [],
    [classDef]
  );
  const availableToPrepare = useMemo(
    () => isPrepared
      ? classCatalog
          .filter(s => s.level > 0)
          .filter(s => !(character.preparedSpells ?? []).includes(s.id))
          .filter(s => filter === 'all' || s.tags?.includes(filter))
          .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
      : [],
    [isPrepared, classCatalog, character.preparedSpells, filter]
  );

  const cantripCap = useMemo(
    () => classDef?.spellcasting ? getCantripsKnown(character, character.level) : 0,
    [character, classDef]
  );
  const hasFreeCantripSlots = knownCantrips.length < cantripCap;
  const availableCantrips = useMemo(
    () => classCatalog
      .filter(s => s.level === 0)
      .filter(s => !(character.knownSpells ?? []).includes(s.id))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [classCatalog, character.knownSpells]
  );
  const swapOldIsCantrip = swapPickOld ? (SPELLS_BY_ID[swapPickOld]?.level === 0) : false;

  const runAction = async (fn: () => Promise<boolean>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await fn();
      if (!ok) setError('Action failed — check caps or class restrictions.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handlePrepare = (spellId: string) =>
    runAction(() => onManageSpellbook(character.id, 'prepare', spellId));
  const handleUnprepare = (spellId: string) =>
    runAction(() => onManageSpellbook(character.id, 'unprepare', spellId));
  const handleLearn = (spellId: string) =>
    runAction(() => onManageSpellbook(character.id, 'learn', spellId));

  const handleSwapConfirm = (newSpellId: string) => {
    if (!swapPickOld || !onSwapKnownSpell) return;
    const oldId = swapPickOld;
    setSwapPickOld(null);
    runAction(async () => {
      const ok = await onSwapKnownSpell(character.id, oldId, newSpellId);
      return ok;
    });
  };

  const handleClose = () => {
    setError(null);
    setSwapPickOld(null);
    onClose();
  };

  if (!isOpen) return null;

  const casterHeader = classDef?.spellcasting
    ? `${character.name} · Level ${character.level} ${classDef.name}`
    : character.name;

  return createPortal(
    <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm" onClick={handleClose}>
      <div
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-stone-900 border border-stone-700 rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-stone-800 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold text-amber-500 fantasy-font tracking-wide">Spellbook</h2>
            <p className="text-xs text-stone-400 mt-0.5">{casterHeader}</p>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 hover:bg-stone-800 rounded-lg text-stone-500 hover:text-stone-300 transition-colors"
            aria-label="Close"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        {isCombatActive && (
          <div className="px-5 py-2 bg-red-950/40 border-b border-red-900/50 text-xs text-red-300 flex items-center gap-2 shrink-0">
            <i className="fas fa-gavel"></i>
            <span>Spell preparation is locked during combat.</span>
          </div>
        )}

        {error && (
          <div className="px-5 py-2 bg-red-950/40 border-b border-red-900/50 text-xs text-red-300 shrink-0">
            {error}
          </div>
        )}

        <div className="overflow-y-auto custom-scrollbar px-5 py-4 space-y-4 grow">
          {/* Cantrips section — count display, optional swap (known casters), optional learn (free slots) */}
          {(knownCantrips.length > 0 || hasFreeCantripSlots) && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] uppercase font-bold text-amber-600 tracking-widest">Cantrips</p>
                {cantripCap > 0 && (
                  <span className="font-mono text-xs font-bold text-amber-400">
                    {knownCantrips.length} / {cantripCap}
                  </span>
                )}
              </div>
              {knownCantrips.length > 0 ? (
                <div className="space-y-1.5">
                  {knownCantrips.map(spell => {
                    const isSwapSource = swapPickOld === spell.id;
                    const canSwapCantrip = !isCombatActive && !!onSwapKnownSpell && ((isKnown && hasPendingSwap) || character.cantripSwapAvailable);
                    return (
                      <div key={spell.id} className={`flex items-center justify-between rounded-lg px-3 py-1.5 border transition-all ${
                        isSwapSource ? 'bg-red-950/40 border-red-900/60' : 'bg-stone-950 border-stone-800'
                      }`}>
                        <button
                          onClick={() => setViewingSpell(spell)}
                          className="flex items-center gap-2 text-left hover:text-amber-400 transition-colors"
                        >
                          <i className={`fas ${SCHOOL_ICONS[spell.school] || 'fa-star'} text-[10px] text-stone-500 w-3`}></i>
                          <span className="text-xs text-stone-300">{spell.name}</span>
                        </button>
                        {canSwapCantrip && (
                          <button
                            onClick={() => setSwapPickOld(isSwapSource ? null : spell.id)}
                            disabled={busy}
                            className={`text-[10px] px-2 py-0.5 rounded border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                              isSwapSource
                                ? 'bg-red-900/40 text-red-300 border-red-800/50 hover:bg-red-900/60'
                                : 'bg-stone-800 text-stone-400 border-stone-700 hover:bg-amber-900/40 hover:text-amber-300 hover:border-amber-800/50'
                            }`}
                          >
                            {isSwapSource ? 'Cancel' : 'Replace'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-stone-600 italic">No cantrips known yet.</p>
              )}

              {/* Available Cantrips — learn when free slots (any caster) */}
              {hasFreeCantripSlots && availableCantrips.length > 0 && !swapPickOld && (
                <div className="mt-2">
                  <p className="text-[10px] uppercase font-bold text-stone-500 tracking-widest mb-1.5">Available Cantrips</p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                    {availableCantrips.map(spell => (
                      <div key={spell.id} className="flex items-center justify-between bg-stone-950/50 rounded-lg px-3 py-1.5 border border-stone-800/70">
                        <button
                          onClick={() => setViewingSpell(spell)}
                          className="flex items-center gap-2 text-left hover:text-amber-400 transition-colors"
                        >
                          <i className={`fas ${SCHOOL_ICONS[spell.school] || 'fa-star'} text-[10px] text-stone-500 w-3`}></i>
                          <span className="text-xs text-stone-300">{spell.name}</span>
                        </button>
                        <button
                          onClick={() => handleLearn(spell.id)}
                          disabled={busy || isCombatActive}
                          className="text-[10px] px-2 py-0.5 rounded bg-stone-800 hover:bg-amber-900/40 text-stone-400 hover:text-amber-300 border border-stone-700 hover:border-amber-800/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Learn
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {swapPickOld && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] uppercase font-bold text-amber-600 tracking-widest">
                  {swapOldIsCantrip ? 'Pick New Cantrip' : 'Pick New Spell'}
                </p>
                <div className="flex flex-wrap gap-1">
                  {SPELL_FILTERS.map(f => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider border transition-all ${
                        filter === f
                          ? 'bg-amber-900/40 text-amber-400 border-amber-800/30'
                          : 'bg-stone-900 text-stone-500 border-stone-800 hover:text-stone-300'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                {classCatalog
                  .filter(s => swapOldIsCantrip ? s.level === 0 : s.level > 0)
                  .filter(s => !(character.knownSpells ?? []).includes(s.id))
                  .filter(s => filter === 'all' || s.tags?.includes(filter))
                  .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
                  .slice(0, 60)
                  .map(spell => (
                    <div key={spell.id} className="flex items-center justify-between bg-stone-950/50 rounded-lg px-3 py-1.5 border border-stone-800/70">
                      <button
                        onClick={() => setViewingSpell(spell)}
                        className="flex items-center gap-2 text-left hover:text-amber-400 transition-colors"
                      >
                        <i className={`fas ${SCHOOL_ICONS[spell.school] || 'fa-star'} text-[10px] text-stone-500 w-3`}></i>
                        <span className="text-xs text-stone-300">{spell.name}</span>
                        <span className="text-[9px] text-stone-600 uppercase">{levelLabel(spell.level)}</span>
                      </button>
                      <button
                        onClick={() => handleSwapConfirm(spell.id)}
                        disabled={busy}
                        className="text-[10px] px-2 py-0.5 rounded bg-stone-800 hover:bg-amber-900/40 text-stone-400 hover:text-amber-300 border border-stone-700 hover:border-amber-800/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Learn
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* PREPARED CASTER PATH */}
          {isPrepared && (
            <>
              <div className="flex items-center justify-between bg-stone-950/50 border border-stone-800 rounded-lg px-3 py-2">
                <span className="text-xs uppercase tracking-wider text-stone-400">Prepared Spells</span>
                <span className={`font-mono text-sm font-bold ${preparedCount > maxPrepared ? 'text-red-500' : 'text-amber-400'}`}>
                  {preparedCount} / {maxPrepared}
                </span>
              </div>

              <div>
                <p className="text-[10px] uppercase font-bold text-stone-500 tracking-widest mb-1.5">Currently Prepared</p>
                {preparedLeveled.length === 0 ? (
                  <p className="text-xs text-stone-600 italic">No leveled spells prepared.</p>
                ) : (
                  <div className="space-y-1.5">
                    {preparedLeveled.map(spell => (
                      <div key={spell.id} className="flex items-center justify-between bg-stone-950 rounded-lg px-3 py-1.5 border border-stone-800">
                        <button
                          onClick={() => setViewingSpell(spell)}
                          className="flex items-center gap-2 text-left hover:text-amber-400 transition-colors"
                        >
                          <i className={`fas ${SCHOOL_ICONS[spell.school] || 'fa-star'} text-[10px] text-stone-500 w-3`}></i>
                          <span className="text-xs text-stone-300">{spell.name}</span>
                          <span className="text-[9px] text-stone-600 uppercase">{levelLabel(spell.level)}</span>
                        </button>
                        <button
                          onClick={() => handleUnprepare(spell.id)}
                          disabled={busy || isCombatActive}
                          className="text-[10px] px-2 py-0.5 rounded bg-stone-800 hover:bg-red-900/40 text-stone-400 hover:text-red-300 border border-stone-700 hover:border-red-800/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Unprepare
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] uppercase font-bold text-stone-500 tracking-widest">Available to Prepare</p>
                  <div className="flex flex-wrap gap-1">
                    {SPELL_FILTERS.map(f => (
                      <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider border transition-all ${
                          filter === f
                            ? 'bg-amber-900/40 text-amber-400 border-amber-800/30'
                            : 'bg-stone-900 text-stone-500 border-stone-800 hover:text-stone-300'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
                {availableToPrepare.length === 0 ? (
                  <p className="text-xs text-stone-600 italic">No matching spells available.</p>
                ) : (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                    {availableToPrepare.slice(0, 60).map(spell => {
                      const atCap = preparedCount >= maxPrepared;
                      return (
                        <div key={spell.id} className="flex items-center justify-between bg-stone-950/50 rounded-lg px-3 py-1.5 border border-stone-800/70">
                          <button
                            onClick={() => setViewingSpell(spell)}
                            className="flex items-center gap-2 text-left hover:text-amber-400 transition-colors"
                          >
                            <i className={`fas ${SCHOOL_ICONS[spell.school] || 'fa-star'} text-[10px] text-stone-500 w-3`}></i>
                            <span className="text-xs text-stone-300">{spell.name}</span>
                            <span className="text-[9px] text-stone-600 uppercase">{levelLabel(spell.level)}</span>
                          </button>
                          <Tooltip content={atCap ? `Cap reached (${maxPrepared}). Unprepare a spell first.` : ''} side="left">
                            <button
                              onClick={() => handlePrepare(spell.id)}
                              disabled={busy || isCombatActive || atCap}
                              className="text-[10px] px-2 py-0.5 rounded bg-stone-800 hover:bg-amber-900/40 text-stone-400 hover:text-amber-300 border border-stone-700 hover:border-amber-800/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              Prepare
                            </button>
                          </Tooltip>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* KNOWN CASTER PATH */}
          {isKnown && (
            <>
              <div className="flex items-center justify-between bg-stone-950/50 border border-stone-800 rounded-lg px-3 py-2">
                <span className="text-xs uppercase tracking-wider text-stone-400">Known Spells</span>
                <span className="font-mono text-sm font-bold text-amber-400">{knownLeveled.length}</span>
              </div>

              {hasPendingSwap && onSwapKnownSpell ? (
                <div className="bg-amber-950/30 border border-amber-900/50 rounded-lg px-3 py-2 text-xs text-amber-200">
                  <i className="fas fa-arrows-rotate mr-1.5"></i>
                  You may swap one known spell for another (granted on level-up).
                  {!swapPickOld && ' Click a known spell below to replace it.'}
                  {swapPickOld && ' Now pick a new spell from the catalog below.'}
                </div>
              ) : (
                <div className="bg-stone-950/40 border border-stone-800 rounded-lg px-3 py-2 text-xs text-stone-400">
                  <i className="fas fa-info-circle mr-1.5"></i>
                  Known spells are permanent. A free one-for-one swap is granted each
                  time you gain a level — visit your level-up flow to use it.
                </div>
              )}

              <div>
                <p className="text-[10px] uppercase font-bold text-stone-500 tracking-widest mb-1.5">Known Spells</p>
                <div className="space-y-1.5">
                  {knownLeveled.map(spell => {
                    const isSwapSource = swapPickOld === spell.id;
                    return (
                      <div key={spell.id} className={`flex items-center justify-between rounded-lg px-3 py-1.5 border transition-all ${
                        isSwapSource ? 'bg-red-950/40 border-red-900/60' : 'bg-stone-950 border-stone-800'
                      }`}>
                        <button
                          onClick={() => setViewingSpell(spell)}
                          className="flex items-center gap-2 text-left hover:text-amber-400 transition-colors"
                        >
                          <i className={`fas ${SCHOOL_ICONS[spell.school] || 'fa-star'} text-[10px] text-stone-500 w-3`}></i>
                          <span className="text-xs text-stone-300">{spell.name}</span>
                          <span className="text-[9px] text-stone-600 uppercase">{levelLabel(spell.level)}</span>
                        </button>
                        {hasPendingSwap && onSwapKnownSpell && !isCombatActive && (
                          <button
                            onClick={() => setSwapPickOld(isSwapSource ? null : spell.id)}
                            disabled={busy}
                            className={`text-[10px] px-2 py-0.5 rounded border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                              isSwapSource
                                ? 'bg-red-900/40 text-red-300 border-red-800/50 hover:bg-red-900/60'
                                : 'bg-stone-800 text-stone-400 border-stone-700 hover:bg-amber-900/40 hover:text-amber-300 hover:border-amber-800/50'
                            }`}
                          >
                            {isSwapSource ? 'Cancel' : 'Replace'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>


            </>
          )}

          {!classDef?.spellcasting && (
            <p className="text-sm text-stone-500 text-center py-4">{character.name} is not a spellcaster.</p>
          )}
        </div>

        <div className="px-5 py-3 border-t border-stone-800 flex justify-end shrink-0">
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-stone-800 text-stone-400 hover:bg-stone-700 hover:text-stone-300 transition-all"
          >
            Done
          </button>
        </div>
      </div>

      <SpellDetailModal spell={viewingSpell} onClose={() => setViewingSpell(null)} />
    </div>,
    document.body
  );
};

export default SpellbookModal;
