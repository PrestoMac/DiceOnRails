import React, { useState, useMemo } from 'react';
import type { Character, SpellDefinition } from '../../../../types';
import { SPELLS_BY_ID, getSpellsForClass } from '../../../../utils/spells';
import { getClassDef } from '../../../../services/classEngine';
import { getMaxPrepared, getCantripsKnown, getMaxCastableSlotLevel } from '../../../../services/spellcastingEngine';
import Modal from '../../primitives/Modal';
import Button from '../../primitives/Button';
import Chip from '../../primitives/Chip';
import Card from '../../primitives/Card';
import Tooltip from '../../primitives/Tooltip';
import ConfirmDialog from '../../primitives/ConfirmDialog';
import { cx } from '../../primitives/cx';
import { SpellDetailModalV2, SCHOOL_ICONS } from './DetailModals';

export type SpellbookManageAction = 'learn' | 'prepare' | 'unprepare' | 'forget' | 'finish_prep';

interface SpellbookSheetProps {
  character: Character;
  open: boolean;
  onClose: () => void;
  /** Prepared-caster management (prepare / unprepare / learn / forget / finish_prep). */
  onManageSpellbook: (characterId: string, action: SpellbookManageAction, spellId: string) => Promise<boolean>;
  /** Known-caster Tasha's-style swap. */
  onSwapKnownSpell: (characterId: string, oldSpellId: string, newSpellId: string) => Promise<boolean>;
  /** When true, all mutations are locked (combat active). */
  isCombatActive?: boolean;
}

const SPELL_FILTERS = ['all', 'damage', 'healing', 'utility', 'control'] as const;

const levelLabel = (lvl: number): string => {
  if (lvl === 0) return 'Cantrip';
  const suffix = lvl === 1 ? 'st' : lvl === 2 ? 'nd' : lvl === 3 ? 'rd' : 'th';
  return `${lvl}${suffix}`;
};

const rowBase = 'flex items-center justify-between rounded-lg px-3 py-1.5 border transition-all';
const rowIdle = 'bg-obsidian-950/80 border-white/[0.08]';
const rowSwapSource = 'bg-blood-950/40 border-blood-900/60';

const actionBtn = 'text-[10px] px-2 py-0.5 rounded border font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed';

/** Small icon-labeled spell name button that opens the detail modal. */
const SpellNameButton: React.FC<{
  spell: SpellDefinition;
  active?: boolean;
  showLevel?: boolean;
  ritualChip?: React.ReactNode;
  onView: (spell: SpellDefinition) => void;
}> = ({ spell, active, showLevel = true, ritualChip, onView }) => (
  <button
    type="button"
    onClick={() => onView(spell)}
    className="flex items-center gap-2 text-left hover:text-ember-300 transition-colors cursor-pointer"
  >
    <i
      className={cx('fas', SCHOOL_ICONS[spell.school] || 'fa-star', 'text-[10px] w-3', active ? 'text-verdant-400' : 'text-parchment-faint')}
      aria-hidden="true"
    />
    <span className={cx('text-xs', active ? 'font-semibold text-verdant-300' : 'text-parchment-dim')}>{spell.name}</span>
    {showLevel && <span className="text-[9px] text-parchment-faint uppercase">{levelLabel(spell.level)}</span>}
    {ritualChip}
  </button>
);

/** Emberlight V2 spellbook sheet: prepared-caster management (prepare / unprepare /
 *  learn w/ SRD rest gating) and known-caster swap tracking (leveled + cantrip).
 *  Full port of the legacy SpellbookModal onto the V2 primitive kit. All mutations
 *  go through the engine-backed onManageSpellbook / onSwapKnownSpell callbacks —
 *  this sheet never touches the LLM agent loop. */
const SpellbookSheet: React.FC<SpellbookSheetProps> = ({
  character, open, onClose, onManageSpellbook, onSwapKnownSpell, isCombatActive,
}) => {
  const [filter, setFilter] = useState<(typeof SPELL_FILTERS)[number]>('all');
  const [viewingSpell, setViewingSpell] = useState<SpellDefinition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [swapPickOld, setSwapPickOld] = useState<string | null>(null);
  const [showLockConfirm, setShowLockConfirm] = useState(false);

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
    if (!swapPickOld) return;
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
    const hasPrepAccess = (character.longRestPrepAvailable ?? true) || character.shortRestSpellSwapAvailable;
    const hasCantripAccess = !!character.cantripSwapAvailable;
    const shouldConfirmLock = !isCombatActive && ((isPrepared && hasPrepAccess) || hasCantripAccess);

    if (shouldConfirmLock) {
      setShowLockConfirm(true);
    } else {
      setError(null);
      setSwapPickOld(null);
      setShowLockConfirm(false);
      onClose();
    }
  };

  const handleConfirmLockAndClose = async () => {
    setBusy(true);
    try {
      await onManageSpellbook(character.id, 'finish_prep', '');
    } catch (err) {
      console.warn('[SpellbookSheet] finish_prep error:', err);
    } finally {
      setBusy(false);
      setShowLockConfirm(false);
      setError(null);
      setSwapPickOld(null);
      onClose();
    }
  };

  const casterHeader = classDef?.spellcasting
    ? `${character.name} · Level ${character.level} ${classDef.name}`
    : character.name;

  const filterChips = (
    <div className="flex flex-wrap gap-1">
      {SPELL_FILTERS.map(f => (
        <Chip key={f} color="arcane" active={filter === f} onClick={() => setFilter(f)} className="capitalize">
          {f}
        </Chip>
      ))}
    </div>
  );

  return (
    <>
      <Modal
        open={open}
        onClose={handleClose}
        title="Spellbook"
        subtitle={casterHeader}
        icon="fa-book"
        size="lg"
        dismissable={!showLockConfirm}
        footer={(
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={handleClose}>Done</Button>
          </div>
        )}
      >
        <div className="space-y-4">
          {/* Combat-lock banner */}
          {isCombatActive && (
            <div className="px-3 py-2 bg-blood-950/40 border border-blood-900/50 rounded-lg text-xs text-blood-300 flex items-center gap-2">
              <i className="fas fa-gavel" aria-hidden="true" />
              <span>Spell preparation and swapping are locked during combat.</span>
            </div>
          )}

          {error && (
            <div className="px-3 py-2 bg-blood-950/40 border border-blood-900/50 rounded-lg text-xs text-blood-300">
              {error}
            </div>
          )}

          {/* Archetype badge */}
          <div className="flex items-center gap-2 flex-wrap">
            {isWizard && (
              <Chip color="arcane" icon="fa-book">Prepared (Spellbook)</Chip>
            )}
            {isPrepared && !isWizard && (
              <Chip color="verdant" icon="fa-hands-praying">Prepared (Full List)</Chip>
            )}
            {isKnown && (
              <Chip color="ember" icon="fa-wand-magic-sparkles">Known Spontaneous</Chip>
            )}
          </div>

          {/* Dynamic rule banner */}
          {isWizard && (
            <Card accent="arcane" className="text-xs text-parchment-dim flex items-start gap-2.5 !p-2.5">
              <i className="fas fa-circle-info text-arcane-300 mt-0.5 shrink-0 text-sm" aria-hidden="true" />
              <div>
                <span className="font-semibold text-arcane-300">Wizard Spellcasting:</span> You prepare up to <strong>{maxPrepared}</strong> spells from your spellbook ({knownLeveled.length} spells). Unprepared ritual spells in your spellbook can still be cast as rituals!
              </div>
            </Card>
          )}
          {isPrepared && !isWizard && (
            <Card accent="verdant" className="text-xs text-parchment-dim flex items-start gap-2.5 !p-2.5">
              <i className="fas fa-circle-info text-verdant-400 mt-0.5 shrink-0 text-sm" aria-hidden="true" />
              <div>
                <span className="font-semibold text-verdant-400">Prepared Spellcasting:</span> You automatically know all {classDef?.name} spells. Prepare up to <strong>{maxPrepared}</strong> spells outside combat to make them castable.
              </div>
            </Card>
          )}
          {isKnown && (
            <Card accent="ember" className="text-xs text-parchment-dim flex items-start gap-2.5 !p-2.5">
              <i className="fas fa-circle-info text-ember-400 mt-0.5 shrink-0 text-sm" aria-hidden="true" />
              <div>
                <span className="font-semibold text-ember-400">Known Spellcasting:</span> All {knownLeveled.length} known spells are ready to cast without preparation. You may replace 1 spell per level-up, or 1 cantrip per long rest.
              </div>
            </Card>
          )}

          {/* Cantrips section — count display, optional swap, optional learn (free slots) */}
          {(knownCantrips.length > 0 || hasFreeCantripSlots) && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] uppercase font-bold text-ember-400/90 tracking-widest flex items-center gap-1.5">
                  <span>Cantrips</span>
                  <span className="text-parchment-faint font-normal">(Level 0)</span>
                </p>
                {cantripCap > 0 && (
                  <span className="font-mono text-xs font-bold text-ember-300">
                    {knownCantrips.length} / {cantripCap}
                  </span>
                )}
              </div>
              {knownCantrips.length > 0 ? (
                <div className="space-y-1.5">
                  {knownCantrips.map(spell => {
                    const isSwapSource = swapPickOld === spell.id;
                    const canSwapCantrip = !isCombatActive && ((isKnown && hasPendingSwap) || character.cantripSwapAvailable);
                    const tipContent = canSwapCantrip ? '' : 'Cantrip swap available after a Long Rest.';
                    return (
                      <div key={spell.id} className={cx(rowBase, isSwapSource ? rowSwapSource : rowIdle)}>
                        <SpellNameButton spell={spell} showLevel={false} onView={setViewingSpell} />
                        <Tooltip content={tipContent} side="left" disabled={!tipContent}>
                          <button
                            type="button"
                            onClick={() => canSwapCantrip && setSwapPickOld(isSwapSource ? null : spell.id)}
                            disabled={busy || isCombatActive || !canSwapCantrip}
                            className={cx(
                              actionBtn,
                              isSwapSource
                                ? 'bg-blood-900/40 text-blood-300 border-blood-800/50 hover:bg-blood-900/60'
                                : 'bg-obsidian-800 text-parchment-mute border-white/10 hover:bg-ember-500/10 hover:text-ember-300 hover:border-ember-500/40',
                            )}
                          >
                            {isSwapSource ? 'Cancel' : 'Replace'}
                          </button>
                        </Tooltip>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-parchment-faint italic">No cantrips known yet.</p>
              )}

              {/* Available cantrips — learn when free slots (any caster) */}
              {hasFreeCantripSlots && availableCantrips.length > 0 && !swapPickOld && (
                <div className="mt-2">
                  <p className="text-[10px] uppercase font-bold text-parchment-faint tracking-widest mb-1.5">Available Cantrips</p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto v2-scrollbar pr-1">
                    {availableCantrips.map(spell => (
                      <div key={spell.id} className={cx(rowBase, 'bg-obsidian-950/50 border-white/[0.06]')}>
                        <SpellNameButton spell={spell} showLevel={false} onView={setViewingSpell} />
                        <Button
                          variant="subtle"
                          size="sm"
                          icon="fa-plus"
                          onClick={() => handleLearn(spell.id)}
                          disabled={busy || isCombatActive}
                        >
                          Learn
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Two-step swap flow — pick the replacement from the class catalog */}
          {swapPickOld && (
            <Card accent="ember" className="!p-3">
              <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                <p className="text-[10px] uppercase font-bold text-ember-400 tracking-widest flex items-center gap-1.5">
                  <i className="fas fa-arrows-rotate" aria-hidden="true" />
                  <span>{swapOldIsCantrip ? 'Pick New Cantrip' : 'Pick Replacement Spell'}</span>
                </p>
                {filterChips}
              </div>
              <div className="space-y-1.5 max-h-64 overflow-y-auto v2-scrollbar pr-1">
                {classCatalog
                  .filter(s => swapOldIsCantrip ? s.level === 0 : s.level > 0)
                  .filter(s => !(character.knownSpells ?? []).includes(s.id))
                  .filter(s => filter === 'all' || s.tags?.includes(filter))
                  .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
                  .slice(0, 60)
                  .map(spell => (
                    <div key={spell.id} className={cx(rowBase, rowIdle)}>
                      <SpellNameButton spell={spell} onView={setViewingSpell} />
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleSwapConfirm(spell.id)}
                        disabled={busy}
                      >
                        Select
                      </Button>
                    </div>
                  ))}
              </div>
            </Card>
          )}

          {/* Consolidated 1-section prepared-caster view (Wizard, Cleric, Druid, Paladin) */}
          {isPrepared && (
            <div className="space-y-3">
              {/* Preparation slots + SRD rest gating banner */}
              <div className="flex flex-col gap-2 bg-obsidian-950/60 border border-white/[0.06] rounded-lg p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-wider text-parchment-mute font-bold">Preparation Slots</span>
                    {isWizard && (
                      <Chip color="arcane" icon="fa-book">{knownLeveled.length} Spells in Book</Chip>
                    )}
                  </div>
                  <span className={cx('font-mono text-sm font-bold', preparedCount > maxPrepared ? 'text-blood-400' : 'text-ember-300')}>
                    {preparedCount} / {maxPrepared} Prepared
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] text-xs">
                  <span className="text-[11px] text-parchment-mute font-medium flex items-center gap-1.5">
                    <i className="fas fa-hourglass-half text-parchment-faint" aria-hidden="true" /> Rest Prep Status:
                  </span>
                  {(character.longRestPrepAvailable ?? true) ? (
                    <Tooltip content="Full Spell Preparation active (Long Rest). Modify your prepared spells freely." side="top">
                      <Chip color="verdant" icon="fa-sun" className="uppercase">Full Prep (Long Rest)</Chip>
                    </Tooltip>
                  ) : character.shortRestSpellSwapAvailable ? (
                    <Tooltip content="2024 SRD rule: You can swap 1 prepared spell per short rest." side="top">
                      <Chip color="ember" icon="fa-campground" className="uppercase">1 Swap Ready (Short Rest)</Chip>
                    </Tooltip>
                  ) : (
                    <Tooltip content="Take a Short Rest (swap 1 spell) or Long Rest (full re-prepare) to change spells." side="top">
                      <Chip color="blood" icon="fa-lock" className="uppercase">Locked (Rest Required)</Chip>
                    </Tooltip>
                  )}
                </div>
              </div>

              {/* Pending wizard level-up additions (if any) */}
              {isWizard && pendingWizardSpellsCount > 0 && (
                <Card accent="ember" className="!p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs text-ember-200">
                    <div className="flex items-center gap-2 font-bold">
                      <i className="fas fa-book-bookmark text-ember-400" aria-hidden="true" />
                      <span>Level-Up Spells: {pendingWizardSpellsCount} Choice(s) Remaining</span>
                    </div>
                  </div>
                  {availableToLearnSpellbook.length > 0 && (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto v2-scrollbar pr-1">
                      {availableToLearnSpellbook.slice(0, 60).map(spell => (
                        <div key={spell.id} className={cx(rowBase, rowIdle)}>
                          <SpellNameButton spell={spell} onView={setViewingSpell} />
                          <Button
                            variant="primary"
                            size="sm"
                            icon="fa-book"
                            onClick={() => handleLearn(spell.id)}
                            disabled={busy || isCombatActive}
                          >
                            Add to Spellbook
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )}

              {/* Single master list with toggle buttons */}
              <div>
                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                  <p className="text-[10px] uppercase font-bold text-parchment-faint tracking-widest">
                    {isWizard ? 'Spellbook Spells (Toggle Prepared State)' : 'Class Spells (Toggle Prepared State)'}
                  </p>
                  {filterChips}
                </div>

                {masterSpellList.length === 0 ? (
                  <p className="text-xs text-parchment-faint italic bg-obsidian-950/40 rounded-lg p-2.5 border border-white/[0.06]">No spells found matching the selected filter.</p>
                ) : (
                  <div className="space-y-1.5 max-h-80 overflow-y-auto v2-scrollbar pr-1">
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
                          className={cx(
                            rowBase,
                            isPrep ? 'bg-verdant-950/30 border-verdant-800/60' : rowIdle,
                          )}
                        >
                          <SpellNameButton
                            spell={spell}
                            active={isPrep}
                            onView={setViewingSpell}
                            ritualChip={spell.ritual ? (
                              <Tooltip
                                content={isWizard ? 'Wizards can cast ritual spells directly from their spellbook without preparing them!' : 'Ritual spell (10 min cast, 0 slots)'}
                                side="top"
                              >
                                <Chip color="frost" icon="fa-sparkles">Ritual</Chip>
                              </Tooltip>
                            ) : undefined}
                          />

                          {isPrep ? (
                            <Tooltip
                              content={prepDisabled ? disabledReason : 'Click to unprepare'}
                              side="left"
                              disabled={prepDisabled && !disabledReason}
                            >
                              <button
                                type="button"
                                onClick={() => handleUnprepare(spell.id)}
                                disabled={prepDisabled}
                                className={cx(
                                  actionBtn,
                                  'flex items-center gap-1 bg-verdant-900/40 hover:bg-blood-900/50 text-verdant-300 hover:text-blood-300 border-verdant-700/60 hover:border-blood-700/60 group',
                                )}
                              >
                                <i className="fas fa-check text-[8px] group-hover:hidden" aria-hidden="true" />
                                <i className="fas fa-xmark text-[8px] hidden group-hover:inline" aria-hidden="true" />
                                <span>Prepared</span>
                              </button>
                            </Tooltip>
                          ) : (
                            <Tooltip content={disabledReason} side="left" disabled={!disabledReason}>
                              <button
                                type="button"
                                onClick={() => handlePrepare(spell.id)}
                                disabled={prepDisabled}
                                className={cx(
                                  actionBtn,
                                  'bg-obsidian-800 hover:bg-ember-500/10 text-parchment-mute hover:text-ember-200 border-white/10 hover:border-ember-500/40',
                                )}
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

          {/* Known-caster path */}
          {isKnown && (
            <>
              {/* Swap tracker grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className={cx(
                  'p-2.5 rounded-lg border flex items-center justify-between',
                  hasPendingSwap ? 'bg-ember-500/10 border-ember-500/40 text-ember-300' : 'bg-obsidian-950/40 border-white/[0.06] text-parchment-mute',
                )}>
                  <span className="flex items-center gap-1.5 text-[11px] font-medium">
                    <i className={cx('fas fa-arrows-rotate', hasPendingSwap ? 'text-ember-400' : 'text-parchment-faint')} aria-hidden="true" />
                    Leveled Swap
                  </span>
                  <Chip color={hasPendingSwap ? 'ember' : 'neutral'} className="uppercase">
                    {hasPendingSwap ? 'Available!' : 'On Level-Up'}
                  </Chip>
                </div>
                <div className={cx(
                  'p-2.5 rounded-lg border flex items-center justify-between',
                  character.cantripSwapAvailable ? 'bg-verdant-500/10 border-verdant-500/40 text-verdant-300' : 'bg-obsidian-950/40 border-white/[0.06] text-parchment-mute',
                )}>
                  <span className="flex items-center gap-1.5 text-[11px] font-medium">
                    <i className={cx('fas fa-sparkles', character.cantripSwapAvailable ? 'text-verdant-400' : 'text-parchment-faint')} aria-hidden="true" />
                    Cantrip Swap
                  </span>
                  <Chip color={character.cantripSwapAvailable ? 'verdant' : 'neutral'} className="uppercase">
                    {character.cantripSwapAvailable ? 'Available!' : 'On Long Rest'}
                  </Chip>
                </div>
              </div>

              <div>
                <p className="text-[10px] uppercase font-bold text-parchment-faint tracking-widest mb-1.5">Known Spells ({knownLeveled.length})</p>
                <div className="space-y-1.5">
                  {knownLeveled.map(spell => {
                    const isSwapSource = swapPickOld === spell.id;
                    const canSwap = hasPendingSwap && !isCombatActive;
                    const tipContent = canSwap ? '' : 'Leveled spell swaps are granted when you level up.';
                    return (
                      <div key={spell.id} className={cx(rowBase, isSwapSource ? rowSwapSource : rowIdle)}>
                        <SpellNameButton spell={spell} onView={setViewingSpell} />
                        <Tooltip content={tipContent} side="left" disabled={!tipContent}>
                          <button
                            type="button"
                            onClick={() => canSwap && setSwapPickOld(isSwapSource ? null : spell.id)}
                            disabled={busy || isCombatActive || !canSwap}
                            className={cx(
                              actionBtn,
                              isSwapSource
                                ? 'bg-blood-900/40 text-blood-300 border-blood-800/50 hover:bg-blood-900/60'
                                : 'bg-obsidian-800 text-parchment-mute border-white/10 hover:bg-ember-500/10 hover:text-ember-300 hover:border-ember-500/40',
                            )}
                          >
                            {isSwapSource ? 'Cancel' : 'Replace'}
                          </button>
                        </Tooltip>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {!classDef?.spellcasting && (
            <p className="text-sm text-parchment-mute text-center py-4">{character.name} is not a spellcaster.</p>
          )}
        </div>
      </Modal>

      <SpellDetailModalV2 spell={viewingSpell} onClose={() => setViewingSpell(null)} />

      <ConfirmDialog
        open={showLockConfirm}
        title="Finish Spell & Cantrip Preparation?"
        icon="fa-lock"
        body={(
          <div className="space-y-2.5 leading-relaxed bg-obsidian-950/70 p-3.5 rounded-lg border border-white/[0.06] text-xs">
            <p>
              Are you finished modifying your prepared spells and cantrip selections? Once confirmed, your spell list and cantrip swap will be <strong className="text-ember-300">locked</strong> until your next rest:
            </p>
            <ul className="list-disc list-inside text-parchment-mute space-y-1 pl-1">
              <li><strong className="text-parchment">Long Rest:</strong> Full re-preparation of daily spells + 1 cantrip swap (2024 SRD rule).</li>
              <li><strong className="text-parchment">Short Rest (2024 SRD):</strong> Allows swapping 1 prepared spell from your spellbook/class list.</li>
            </ul>
          </div>
        )}
        confirmLabel="Confirm & Lock Spells"
        cancelLabel="Keep Preparing"
        onConfirm={handleConfirmLockAndClose}
        onCancel={() => setShowLockConfirm(false)}
      />
    </>
  );
};

export default SpellbookSheet;
