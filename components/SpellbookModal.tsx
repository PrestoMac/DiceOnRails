import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Character, SpellDefinition } from '../types';
import { SPELLS_BY_ID, getSpellsForClass } from '../utils/spells';
import { getClassDef } from '../services/classEngine';
import { getMaxPrepared, getCantripsKnown, getMaxCastableSlotLevel } from '../services/spellcastingEngine';
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
  const isWizard = character.class === 'wizard';
  const hasPendingSwap = !!character.pendingSpellSwap;
  const pendingWizardSpellsCount = character.pendingWizardSpells ?? 0;
  const maxCastableLevel = useMemo(() => getMaxCastableSlotLevel(character), [character]);

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
  const masterSpellList = useMemo(() => {
    if (!isPrepared) return [];
    const source = isWizard
      ? knownLeveled
      : classCatalog.filter(s => s.level > 0 && s.level <= maxCastableLevel);

    return source
      .filter(s => filter === 'all' || s.tags?.includes(filter))
      .sort((a, b) => {
        const aPrep = (character.preparedSpells ?? []).includes(a.id);
        const bPrep = (character.preparedSpells ?? []).includes(b.id);
        if (aPrep !== bPrep) return aPrep ? -1 : 1;
        return a.level - b.level || a.name.localeCompare(b.name);
      });
  }, [isPrepared, isWizard, knownLeveled, classCatalog, maxCastableLevel, filter, character.preparedSpells]);

  const availableToLearnSpellbook = useMemo(
    () => isWizard
      ? classCatalog
          .filter(s => s.level > 0 && s.level <= maxCastableLevel)
          .filter(s => !(character.knownSpells ?? []).includes(s.id))
          .filter(s => filter === 'all' || s.tags?.includes(filter))
          .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
      : [],
    [isWizard, classCatalog, character.knownSpells, maxCastableLevel, filter]
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

  const handleSwapConfirm = async (newSpellId: string) => {
    if (!swapPickOld || !onSwapKnownSpell) return;
    const oldId = swapPickOld;
    setSwapPickOld(null);
    setBusy(true);
    setError(null);
    try {
      const ok = await onSwapKnownSpell(character.id, oldId, newSpellId);
      if (!ok) setError('Swap failed — the engine rejected the request.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
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
        {/* Header with Archetype Badge */}
        <div className="px-5 py-3.5 border-b border-stone-800 flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-amber-500 fantasy-font tracking-wide">Spellbook</h2>
              {isWizard && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 inline-flex items-center gap-1">
                  <i className="fas fa-book text-[9px]"></i> Prepared (Spellbook)
                </span>
              )}
              {isPrepared && !isWizard && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 inline-flex items-center gap-1">
                  <i className="fas fa-hands-praying text-[9px]"></i> Prepared (Full List)
                </span>
              )}
              {isKnown && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-950/80 text-purple-300 border border-purple-800/60 inline-flex items-center gap-1">
                  <i className="fas fa-wand-magic-sparkles text-[9px]"></i> Known Spontaneous
                </span>
              )}
            </div>
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
            <span>Spell preparation and swapping are locked during combat.</span>
          </div>
        )}

        {error && (
          <div className="px-5 py-2 bg-red-950/40 border-b border-red-900/50 text-xs text-red-300 shrink-0">
            {error}
          </div>
        )}

        <div className="overflow-y-auto custom-scrollbar px-5 py-4 space-y-4 grow">
          {/* Dynamic Rule Banner */}
          {isWizard && (
            <div className="bg-stone-950/60 border border-stone-800 rounded-lg p-2.5 text-xs text-stone-300 flex items-start gap-2.5">
              <i className="fas fa-info-circle text-amber-400 mt-0.5 shrink-0 text-sm"></i>
              <div>
                <span className="font-semibold text-amber-400">Wizard Spellcasting:</span> You prepare up to <strong>{maxPrepared}</strong> spells from your spellbook ({knownLeveled.length} spells). Unprepared ritual spells in your spellbook can still be cast as rituals!
              </div>
            </div>
          )}
          {isPrepared && !isWizard && (
            <div className="bg-stone-950/60 border border-stone-800 rounded-lg p-2.5 text-xs text-stone-300 flex items-start gap-2.5">
              <i className="fas fa-info-circle text-emerald-400 mt-0.5 shrink-0 text-sm"></i>
              <div>
                <span className="font-semibold text-emerald-400">Prepared Spellcasting:</span> You automatically know all {classDef?.name} spells. Prepare up to <strong>{maxPrepared}</strong> spells outside combat to make them castable.
              </div>
            </div>
          )}
          {isKnown && (
            <div className="bg-stone-950/60 border border-stone-800 rounded-lg p-2.5 text-xs text-stone-300 flex items-start gap-2.5">
              <i className="fas fa-info-circle text-purple-400 mt-0.5 shrink-0 text-sm"></i>
              <div>
                <span className="font-semibold text-purple-400">Known Spellcasting:</span> All {knownLeveled.length} known spells are ready to cast without preparation. You may replace 1 spell per level-up, or 1 cantrip per long rest.
              </div>
            </div>
          )}

          {/* Cantrips Section — count display, optional swap (known casters / long rest), optional learn (free slots) */}
          {(knownCantrips.length > 0 || hasFreeCantripSlots) && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] uppercase font-bold text-amber-600 tracking-widest flex items-center gap-1.5">
                  <span>Cantrips</span>
                  <span className="text-stone-500 font-normal font-sans">(Level 0)</span>
                </p>
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
                        {onSwapKnownSpell && (
                          <Tooltip content={canSwapCantrip ? '' : 'Cantrip swap available after a Long Rest.'} side="left">
                            <button
                              onClick={() => canSwapCantrip && setSwapPickOld(isSwapSource ? null : spell.id)}
                              disabled={busy || isCombatActive || !canSwapCantrip}
                              className={`text-[10px] px-2 py-0.5 rounded border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                                isSwapSource
                                  ? 'bg-red-900/40 text-red-300 border-red-800/50 hover:bg-red-900/60'
                                  : 'bg-stone-800 text-stone-400 border-stone-700 hover:bg-amber-900/40 hover:text-amber-300 hover:border-amber-800/50'
                              }`}
                            >
                              {isSwapSource ? 'Cancel' : 'Replace'}
                            </button>
                          </Tooltip>
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
            <div className="bg-amber-950/20 border border-amber-900/40 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase font-bold text-amber-500 tracking-widest flex items-center gap-1.5">
                  <i className="fas fa-arrows-rotate"></i>
                  <span>{swapOldIsCantrip ? 'Pick New Cantrip' : 'Pick Replacement Spell'}</span>
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
                    <div key={spell.id} className="flex items-center justify-between bg-stone-950/80 rounded-lg px-3 py-1.5 border border-stone-800/80">
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
                        className="text-[10px] px-2 py-0.5 rounded bg-amber-900/50 hover:bg-amber-800 text-amber-300 border border-amber-800/60 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Select
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* CONSOLIDATED 1-SECTION PREPARED CASTER VIEW (Wizard, Cleric, Druid, Paladin) */}
          {isPrepared && (

            <div className="space-y-3">
              {/* Preparation Slots & SRD Rest Gating Banner */}
              <div className="flex flex-col gap-2 bg-stone-950/60 border border-stone-800 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-wider text-stone-400 font-bold">Preparation Slots</span>
                    {isWizard && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 rounded font-semibold flex items-center gap-1">
                        <i className="fas fa-book text-[9px]"></i> {knownLeveled.length} Spells in Book
                      </span>
                    )}
                  </div>
                  <span className={`font-mono text-sm font-bold ${preparedCount > maxPrepared ? 'text-red-500' : 'text-amber-400'}`}>
                    {preparedCount} / {maxPrepared} Prepared
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-stone-800/60 text-xs">
                  <span className="text-[11px] text-stone-400 font-medium flex items-center gap-1.5">
                    <i className="fas fa-hourglass-half text-stone-500"></i> Rest Prep Status:
                  </span>
                  {(character.longRestPrepAvailable ?? true) ? (
                    <Tooltip content="Full Spell Preparation active (Long Rest). Modify your prepared spells freely." side="top">
                      <span className="text-[9px] px-2 py-0.5 rounded font-bold uppercase bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 flex items-center gap-1">
                        <i className="fas fa-sun text-emerald-400 text-[8px]"></i> Full Prep (Long Rest)
                      </span>
                    </Tooltip>
                  ) : character.shortRestSpellSwapAvailable ? (
                    <Tooltip content="2024 SRD rule: You can swap 1 prepared spell per short rest." side="top">
                      <span className="text-[9px] px-2 py-0.5 rounded font-bold uppercase bg-amber-950/80 text-amber-300 border border-amber-800/60 flex items-center gap-1">
                        <i className="fas fa-campground text-amber-400 text-[8px]"></i> 1 Swap Ready (Short Rest)
                      </span>
                    </Tooltip>
                  ) : (
                    <Tooltip content="Take a Short Rest (swap 1 spell) or Long Rest (full re-prepare) to change spells." side="top">
                      <span className="text-[9px] px-2 py-0.5 rounded font-bold uppercase bg-stone-900 text-stone-500 border border-stone-800 flex items-center gap-1">
                        <i className="fas fa-lock text-[8px]"></i> Locked (Rest Required)
                      </span>
                    </Tooltip>
                  )}
                </div>
              </div>

              {/* Pending Wizard Level-Up Additions (if any) */}
              {isWizard && pendingWizardSpellsCount > 0 && (
                <div className="bg-amber-950/40 border border-amber-800/50 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs text-amber-200">
                    <div className="flex items-center gap-2 font-bold">
                      <i className="fas fa-book-bookmark text-amber-400"></i>
                      <span>Level-Up Spells: {pendingWizardSpellsCount} Choice(s) Remaining</span>
                    </div>
                  </div>
                  {availableToLearnSpellbook.length > 0 && (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                      {availableToLearnSpellbook.slice(0, 60).map(spell => (
                        <div key={spell.id} className="flex items-center justify-between bg-stone-950/80 rounded-lg px-3 py-1.5 border border-stone-800/70">
                          <button
                            onClick={() => setViewingSpell(spell)}
                            className="flex items-center gap-2 text-left hover:text-amber-400 transition-colors"
                          >
                            <i className={`fas ${SCHOOL_ICONS[spell.school] || 'fa-star'} text-[10px] text-stone-500 w-3`}></i>
                            <span className="text-xs text-stone-300">{spell.name}</span>
                            <span className="text-[9px] text-stone-600 uppercase">{levelLabel(spell.level)}</span>
                          </button>
                          <button
                            onClick={() => handleLearn(spell.id)}
                            disabled={busy || isCombatActive}
                            className="text-[10px] px-2 py-0.5 rounded bg-amber-900/40 hover:bg-amber-800/60 text-amber-300 border border-amber-800/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Add to Spellbook
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Single Master List Section with Toggle Buttons */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] uppercase font-bold text-stone-500 tracking-widest">
                    {isWizard ? 'Spellbook Spells (Toggle Prepared State)' : 'Class Spells (Toggle Prepared State)'}
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

                {masterSpellList.length === 0 ? (
                  <p className="text-xs text-stone-600 italic bg-stone-950/40 rounded-lg p-2.5 border border-stone-800/50">No spells found matching the selected filter.</p>
                ) : (
                  <div className="space-y-1.5 max-h-80 overflow-y-auto custom-scrollbar pr-1">
                    {masterSpellList.map(spell => {
                      const isPrep = (character.preparedSpells ?? []).includes(spell.id);
                      const atCap = preparedCount >= maxPrepared;
                      const hasPrepAccess = (character.longRestPrepAvailable ?? true) || character.shortRestSpellSwapAvailable;
                      const prepDisabled = busy || isCombatActive || !hasPrepAccess || (!isPrep && atCap);
                      const disabledReason = isCombatActive
                        ? 'Cannot change spells in combat.'
                        : !hasPrepAccess
                          ? 'Modifying prepared spells requires a Short Rest (swap 1) or Long Rest (full prep).'
                          : atCap && !isPrep
                            ? `Preparation cap reached (${maxPrepared}). Unprepare another spell first.`
                            : '';

                      return (
                        <div
                          key={spell.id}
                          className={`flex items-center justify-between rounded-lg px-3 py-1.5 border transition-all ${
                            isPrep
                              ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-200'
                              : 'bg-stone-950/60 border-stone-800/80 text-stone-300'
                          }`}
                        >
                          <button
                            onClick={() => setViewingSpell(spell)}
                            className="flex items-center gap-2 text-left hover:text-amber-400 transition-colors"
                          >
                            <i className={`fas ${SCHOOL_ICONS[spell.school] || 'fa-star'} text-[10px] ${isPrep ? 'text-emerald-400' : 'text-stone-500'} w-3`}></i>
                            <span className={`text-xs ${isPrep ? 'font-semibold text-emerald-200' : 'text-stone-300'}`}>{spell.name}</span>
                            <span className="text-[9px] text-stone-500 uppercase">{levelLabel(spell.level)}</span>
                            {spell.ritual && (
                              <Tooltip content={isWizard ? "Wizards can cast ritual spells directly from their spellbook without preparing them!" : "Ritual spell (10 min cast, 0 slots)"} side="top">
                                <span className="text-[9px] px-1.5 py-0.5 bg-indigo-950 text-indigo-300 border border-indigo-800/60 rounded font-semibold flex items-center gap-1">
                                  <i className="fas fa-sparkles text-[7px]"></i> Ritual
                                </span>
                              </Tooltip>
                            )}
                          </button>

                          {isPrep ? (
                            <Tooltip content={prepDisabled ? disabledReason : 'Click to unprepare'} side="left">
                              <button
                                onClick={() => handleUnprepare(spell.id)}
                                disabled={prepDisabled}
                                className="text-[10px] px-2.5 py-0.5 rounded bg-emerald-900/60 hover:bg-red-900/60 text-emerald-200 hover:text-red-200 border border-emerald-700 hover:border-red-700 transition-all font-semibold flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed group"
                              >
                                <i className="fas fa-check text-[8px] group-hover:hidden"></i>
                                <i className="fas fa-times text-[8px] hidden group-hover:inline"></i>
                                <span>Prepared</span>
                              </button>
                            </Tooltip>
                          ) : (
                            <Tooltip content={prepDisabled ? disabledReason : ''} side="left">
                              <button
                                onClick={() => handlePrepare(spell.id)}
                                disabled={prepDisabled}
                                className="text-[10px] px-2.5 py-0.5 rounded bg-stone-800 hover:bg-amber-900/50 text-stone-400 hover:text-amber-200 border border-stone-700 hover:border-amber-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                + Prepare
                              </button>
                            </Tooltip>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* KNOWN CASTER PATH */}



          {isKnown && (
            <>
              {/* Swap Status Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className={`p-2.5 rounded-lg border flex items-center justify-between ${hasPendingSwap ? 'bg-amber-950/30 border-amber-800/50 text-amber-300' : 'bg-stone-950/40 border-stone-800 text-stone-400'}`}>
                  <span className="flex items-center gap-1.5 text-[11px] font-medium">
                    <i className={`fas fa-arrows-rotate ${hasPendingSwap ? 'text-amber-400' : 'text-stone-500'}`}></i>
                    Leveled Swap
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${hasPendingSwap ? 'bg-amber-900/60 text-amber-200 border border-amber-700/50' : 'bg-stone-800 text-stone-500'}`}>
                    {hasPendingSwap ? 'Available!' : 'On Level-Up'}
                  </span>
                </div>
                <div className={`p-2.5 rounded-lg border flex items-center justify-between ${character.cantripSwapAvailable ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-300' : 'bg-stone-950/40 border-stone-800 text-stone-400'}`}>
                  <span className="flex items-center gap-1.5 text-[11px] font-medium">
                    <i className={`fas fa-sparkles ${character.cantripSwapAvailable ? 'text-emerald-400' : 'text-stone-500'}`}></i>
                    Cantrip Swap
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${character.cantripSwapAvailable ? 'bg-emerald-900/60 text-emerald-200 border border-emerald-700/50' : 'bg-stone-800 text-stone-500'}`}>
                    {character.cantripSwapAvailable ? 'Available!' : 'On Long Rest'}
                  </span>
                </div>
              </div>

              <div>
                <p className="text-[10px] uppercase font-bold text-stone-500 tracking-widest mb-1.5">Known Spells ({knownLeveled.length})</p>
                <div className="space-y-1.5">
                  {knownLeveled.map(spell => {
                    const isSwapSource = swapPickOld === spell.id;
                    const canSwap = hasPendingSwap && onSwapKnownSpell && !isCombatActive;
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
                        {onSwapKnownSpell && (
                          <Tooltip content={canSwap ? '' : 'Leveled spell swaps are granted when you level up.'} side="left">
                            <button
                              onClick={() => canSwap && setSwapPickOld(isSwapSource ? null : spell.id)}
                              disabled={busy || isCombatActive || !canSwap}
                              className={`text-[10px] px-2 py-0.5 rounded border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                                isSwapSource
                                  ? 'bg-red-900/40 text-red-300 border-red-800/50 hover:bg-red-900/60'
                                  : 'bg-stone-800 text-stone-400 border-stone-700 hover:bg-amber-900/40 hover:text-amber-300 hover:border-amber-800/50'
                              }`}
                            >
                              {isSwapSource ? 'Cancel' : 'Replace'}
                            </button>
                          </Tooltip>
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
