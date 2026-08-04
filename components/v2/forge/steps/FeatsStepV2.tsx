import React, { useState } from 'react';
import Button from '../../primitives/Button';
import Chip from '../../primitives/Chip';
import Modal from '../../primitives/Modal';
import Tooltip from '../../primitives/Tooltip';
import { TextField } from '../../primitives/Field';
import EmptyState from '../../primitives/EmptyState';
import IconButton from '../../primitives/IconButton';
import Card from '../../primitives/Card';
import { cx } from '../../primitives/cx';
import type { Character } from '../../../../types';
import { FEATS_CATALOG, FEAT_CATEGORIES } from '../../../../utils/feats';
import type { FeatDefinition } from '../../../../utils/feats';
import { filterAvailableFeats, validateFeatPrereqs } from '../../../../services/featsService';
import { SKILLS_LIST } from '../../../../constants';
import { ASI_LEVELS } from '../../../../constants';
import { STAT_LABELS } from '../../../creation/constants';
import { getEffectiveAsiMap } from '../../../creation/asiUtils';
import { ForgeAdjBtn } from '../forgeWidgets';
import { kebabToTitle } from '../forgeUtils';
import type { ForgeState, ForgeStepProps } from '../forgeTypes';

export type FeatsStepV2Props = ForgeStepProps;

type SlotView = 'choose' | 'asi' | 'feat';
const SKILLED_PICK_COUNT = 3;

/**
 * Forge step 6: ASI/Feat milestones — REDESIGN of the legacy stacked feat
 * browsers. Each milestone slot is a summary card; "Configure" opens a modal
 * with three views: choose ASI-or-Feat, the ASI allocator, or the feat picker
 * (search + category chips + prereq-gated list + inline detail panel).
 */
const FeatsStepV2: React.FC<FeatsStepV2Props> = ({ wizard, updateWizard }) => {
  const { selectedClass, selectedRace, stats, inventory, allocatedSkills, level, asiFeatSlots } = wizard;
  const asiMap = getEffectiveAsiMap(selectedRace, wizard.selectedSubraceId, wizard.halfElfChoice1, wizard.halfElfChoice2);

  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [view, setView] = useState<SlotView>('choose');
  const [featSearch, setFeatSearch] = useState('');
  const [featCategory, setFeatCategory] = useState<string>('all');
  const [detailFeat, setDetailFeat] = useState<FeatDefinition | null>(null);

  /** Feats from slots BEFORE the edited one (prereq simulation — ported). */
  const collectedFeatsSoFar = (uptoIdx: number): string[] =>
    asiFeatSlots.slice(0, uptoIdx).filter(s => s.type === 'feat' && s.featId).map(s => s.featId as string);

  const slotAllocTotal = (slot: ForgeState['asiFeatSlots'][number]): number =>
    Object.values(slot.statAllocations || {}).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);

  const isSlotComplete = (slot: ForgeState['asiFeatSlots'][number]): boolean => {
    if (slot.type === 'feat') {
      if (!slot.featId) return false;
      if (slot.featId === 'skilled' && (slot.skillChoices || []).length !== SKILLED_PICK_COUNT) return false;
      return true;
    }
    if (slot.type === 'asi') return slotAllocTotal(slot) === 2;
    return false;
  };

  const updateSlot = (idx: number, slot: ForgeState['asiFeatSlots'][number]) => {
    const next = [...asiFeatSlots];
    next[idx] = slot;
    updateWizard({ asiFeatSlots: next });
  };

  const openSlot = (idx: number) => {
    setEditingIdx(idx);
    setFeatSearch('');
    setFeatCategory('all');
    setDetailFeat(null);
    const t = asiFeatSlots[idx]?.type ?? null;
    setView(t === 'asi' ? 'asi' : t === 'feat' ? 'feat' : 'choose');
  };

  const closeModal = () => setEditingIdx(null);

  const editingSlot = editingIdx !== null ? asiFeatSlots[editingIdx] : null;

  /** Simulated character for feat prerequisite checks — ported verbatim recipe. */
  const buildSimChar = (uptoIdx: number): Character => ({
    id: 'tmp', name: wizard.name, class: selectedClass.id, race: selectedRace.id, level,
    hp: { current: 0, max: 0 },
    stats: (() => {
      const out = { ...stats };
      for (const [k, v] of Object.entries(asiMap)) (out as Record<string, number>)[k] = ((out as Record<string, number>)[k] || 0) + v;
      return out;
    })(),
    inventory, currency: { gp: 0, sp: 0, cp: 0 }, location: '',
    experience: 0, experienceToNextLevel: 0,
    unusedStatPoints: 0, maxHpBonus: 0, hitDice: { current: level, max: level },
    skills: allocatedSkills,
    feats: collectedFeatsSoFar(uptoIdx),
  });

  const slotSummary = (slot: ForgeState['asiFeatSlots'][number]): React.ReactNode => {
    if (slot.type === 'asi') {
      const parts = Object.entries(slot.statAllocations || {})
        .filter(([, v]) => (v ?? 0) > 0)
        .map(([k, v]) => `+${v} ${STAT_LABELS[k] || k.toUpperCase()}`);
      return parts.length > 0
        ? <span className="text-verdant-300">{parts.join(', ')}</span>
        : <span className="text-parchment-faint">Ability Score Improvement — allocate 2 points</span>;
    }
    if (slot.type === 'feat') {
      const feat = FEATS_CATALOG.find(f => f.id === slot.featId);
      return slot.featId
        ? <span className="text-ember-300">Feat: {feat?.name || kebabToTitle(slot.featId)}</span>
        : <span className="text-parchment-faint">Feat — choose one</span>;
    }
    return <span className="text-parchment-faint italic">Choose one</span>;
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-400/90">
          <i className="fas fa-trophy text-[10px] mr-2" aria-hidden="true" />Feats &amp; Ability Improvements
        </p>
        <p className="text-[11px] text-parchment-mute mt-1.5">
          At level <span className="text-ember-300 font-bold">{level}</span>, you have reached{' '}
          <Tooltip
            content="ASI/Feat milestones occur at levels 4, 8, 12, 16, 19. At each, you choose between an Ability Score Improvement (+1 to two stats or +2 to one) OR a Feat. Level 1 grants one starting slot (variant rule)."
            side="top"
          >
            <span className="text-ember-300 font-bold underline decoration-dotted cursor-default">
              {asiFeatSlots.length} Ability Score Improvement milestone{asiFeatSlots.length === 1 ? '' : 's'}
            </span>
          </Tooltip>
          . For each, choose: Ability Score Improvement <span className="text-ember-400">or</span> a Feat.
        </p>
      </div>

      <div className="space-y-3">
        {asiFeatSlots.map((slot, idx) => {
          const complete = isSlotComplete(slot);
          return (
            <div
              key={idx}
              className={cx(
                'rounded-xl p-4 border transition-colors flex items-center gap-4',
                complete ? 'bg-verdant-500/[0.06] border-verdant-500/30' : 'bg-obsidian-900/70 border-white/[0.06]',
              )}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] uppercase font-bold text-ember-400 tracking-widest">
                    Slot {idx + 1} — Level {ASI_LEVELS[idx]}
                  </p>
                  {complete && (
                    <span className="text-[9px] text-verdant-400 font-bold flex items-center gap-0.5">
                      <i className="fas fa-circle-check" aria-hidden="true" /> Done
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-bold text-parchment mt-0.5 truncate">{slotSummary(slot)}</h3>
              </div>
              <Button variant="subtle" size="sm" icon="fa-sliders" onClick={() => openSlot(idx)}>
                Configure
              </Button>
            </div>
          );
        })}
      </div>

      <Modal
        open={editingIdx !== null}
        onClose={closeModal}
        size="lg"
        title={editingIdx !== null ? `Slot ${editingIdx + 1} — Level ${ASI_LEVELS[editingIdx]}` : undefined}
        subtitle="Ability Score Improvement or a Feat"
        icon="fa-trophy"
        footer={
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" size="sm" icon="fa-rotate-left" onClick={() => { if (editingIdx !== null) updateSlot(editingIdx, { level: 0, type: null }); setView('choose'); }}>
              Change choice
            </Button>
            <Button size="sm" onClick={closeModal} disabled={editingSlot === null || !isSlotComplete(editingSlot)}>
              Done
            </Button>
          </div>
        }
      >
        {editingIdx !== null && editingSlot && view === 'choose' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card
              interactive
              onClick={() => { updateSlot(editingIdx, { level: 0, type: 'asi', statAllocations: {} }); setView('asi'); }}
              className="text-center p-5"
            >
              <i className="fas fa-arrow-up text-2xl text-ember-400 mb-2 block" aria-hidden="true" />
              <p className="font-display text-xs font-bold text-parchment uppercase tracking-wider">Ability Score</p>
              <p className="text-[10px] text-parchment-mute mt-1">+1 to two stats, or +2 to one</p>
            </Card>
            <Card
              interactive
              onClick={() => { updateSlot(editingIdx, { level: 0, type: 'feat' }); setView('feat'); }}
              className="text-center p-5"
            >
              <i className="fas fa-trophy text-2xl text-ember-400 mb-2 block" aria-hidden="true" />
              <p className="font-display text-xs font-bold text-parchment uppercase tracking-wider">Take a Feat</p>
              <p className="text-[10px] text-parchment-mute mt-1">Choose from the SRD feat list</p>
            </Card>
          </div>
        )}

        {editingIdx !== null && editingSlot && view === 'asi' && (() => {
          const total = slotAllocTotal(editingSlot);
          return (
            <div className="space-y-3">
              <div className="flex justify-between items-center bg-obsidian-950/70 px-4 py-2.5 rounded-xl border border-white/[0.06]">
                <span className="text-xs text-parchment-mute">Points to allocate:</span>
                <span className={cx('text-base font-bold font-mono', total === 2 ? 'text-verdant-400' : 'text-ember-400')}>{total}/2</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {(Object.keys(stats) as (keyof Character['stats'])[]).map(stat => {
                  const allocs = (editingSlot.statAllocations || {}) as Record<string, number>;
                  const al = allocs[stat] || 0;
                  const racialBonus = asiMap[stat] || 0;
                  const currentFinal = stats[stat] + racialBonus;
                  const proposed = currentFinal + al;
                  const disableAdd = al >= 2 || total >= 2 || proposed > 20;
                  const disableRem = al <= 0;
                  const setAlloc = (delta: number) => {
                    const sa = { ...(editingSlot.statAllocations || {}) } as Record<string, number>;
                    sa[stat] = Math.max(0, (sa[stat] || 0) + delta);
                    updateSlot(editingIdx, { ...editingSlot, statAllocations: sa });
                  };
                  return (
                    <div key={stat} role="group" aria-label={STAT_LABELS[stat]} className="bg-obsidian-900/70 border border-white/[0.06] rounded-lg p-2 text-center">
                      <div className="text-[9px] uppercase text-parchment-faint font-bold">{STAT_LABELS[stat]}</div>
                      <div className="flex items-center justify-center gap-1 my-1.5">
                        <ForgeAdjBtn onClick={() => setAlloc(-1)} disabled={disableRem} icon="minus" />
                        <span className={cx('text-xs font-mono font-bold w-7', al > 0 ? 'text-verdant-400' : 'text-parchment-dim')}>{proposed}</span>
                        <ForgeAdjBtn onClick={() => setAlloc(1)} disabled={disableAdd} icon="plus" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {editingIdx !== null && editingSlot && view === 'feat' && (() => {
          const simChar = buildSimChar(editingIdx);
          let avail = filterAvailableFeats(simChar, featSearch);
          if (featCategory !== 'all') avail = avail.filter(f => f.category === featCategory);
          const selectedFeat = FEATS_CATALOG.find(f => f.id === editingSlot.featId) || null;
          return (
            <div className="space-y-3">
              {selectedFeat ? (
                <div className="bg-ember-500/[0.08] border border-ember-500/30 rounded-xl p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-obsidian-800 border border-white/[0.08] shrink-0">
                      <i className={cx('fas', selectedFeat.icon, 'text-ember-400')} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[9px] uppercase font-bold text-ember-400 tracking-widest">Selected</p>
                      <h4 className="text-sm font-bold text-parchment truncate">{selectedFeat.name}</h4>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => setDetailFeat(selectedFeat)}>Details</Button>
                    <IconButton icon="fa-xmark" variant="ghost" size="sm" tip="Clear feat" onClick={() => updateSlot(editingIdx, { level: 0, type: 'feat' })} />
                  </div>
                </div>
              ) : (
                <>
                  <TextField value={featSearch} onChange={setFeatSearch} placeholder="Search feats..." icon="fa-magnifying-glass" />
                  <div className="flex flex-wrap gap-1.5">
                    <Chip color="ember" active={featCategory === 'all'} onClick={() => setFeatCategory('all')}>All</Chip>
                    {FEAT_CATEGORIES.map(c => (
                      <Chip key={c.key} color="ember" icon={c.icon} active={featCategory === c.key} onClick={() => setFeatCategory(c.key)}>
                        {c.label}
                      </Chip>
                    ))}
                  </div>
                </>
              )}

              {detailFeat && (
                <Card accent="arcane" className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-display font-bold text-parchment text-sm flex items-center gap-2">
                      <i className={cx('fas', detailFeat.icon, 'text-arcane-300')} aria-hidden="true" />
                      {detailFeat.name}
                      <span className="text-[9px] font-mono text-arcane-300/80 uppercase">{detailFeat.shortName}</span>
                    </h4>
                    <IconButton icon="fa-xmark" variant="ghost" size="sm" tip="Close details" onClick={() => setDetailFeat(null)} />
                  </div>
                  <p className="text-[11px] text-parchment-dim leading-relaxed">{detailFeat.description}</p>
                  <p className="text-[11px] text-verdant-300/90 leading-relaxed"><strong>Effect:</strong> {detailFeat.mechanicalEffect}</p>
                  {detailFeat.prerequisites && (
                    <p className="text-[10px] text-parchment-faint">
                      <strong>Prerequisites:</strong>{' '}
                      {[
                        detailFeat.prerequisites.level !== undefined ? `Level ${detailFeat.prerequisites.level}` : null,
                        ...(detailFeat.prerequisites.stat
                          ? Object.entries(detailFeat.prerequisites.stat).map(([s, v]) => `${String(s).toUpperCase()} ${v}+`)
                          : []),
                        ...(detailFeat.prerequisites.armorProf || []).map(p => `${p} armor proficiency`),
                        ...(detailFeat.prerequisites.otherFeats || []).map(id => FEATS_CATALOG.find(f => f.id === id)?.name || kebabToTitle(id)),
                      ].filter((x): x is string => x !== null).join(', ')}
                    </p>
                  )}
                </Card>
              )}

              {editingSlot.featId === 'skilled' && (
                <Card accent="verdant" className="space-y-2">
                  <p className="text-[10px] uppercase font-bold text-verdant-300 tracking-widest">
                    Skilled: Choose {SKILLED_PICK_COUNT} Skills ({(editingSlot.skillChoices || []).length}/{SKILLED_PICK_COUNT})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {SKILLS_LIST.map(s => {
                      const isPicked = (editingSlot.skillChoices || []).includes(s.name);
                      const full = !isPicked && (editingSlot.skillChoices || []).length >= SKILLED_PICK_COUNT;
                      return (
                        <Chip
                          key={s.name}
                          color="verdant"
                          active={isPicked}
                          onClick={full ? undefined : () => {
                            const cur = editingSlot.skillChoices || [];
                            updateSlot(editingIdx, {
                              ...editingSlot,
                              skillChoices: isPicked ? cur.filter(x => x !== s.name) : [...cur, s.name],
                            });
                          }}
                          className={full ? 'opacity-40' : undefined}
                        >
                          {s.label}
                        </Chip>
                      );
                    })}
                  </div>
                </Card>
              )}

              {editingSlot.featId === 'resilient' && (
                <Card accent="frost" className="space-y-2">
                  <p className="text-[10px] uppercase font-bold text-frost-300 tracking-widest">Resilient: Choose a Save Stat</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map(stat => (
                      <Chip
                        key={stat}
                        color="frost"
                        active={(editingSlot.saveStatChoice || 'con') === stat}
                        onClick={() => updateSlot(editingIdx, { ...editingSlot, saveStatChoice: stat })}
                      >
                        {stat.toUpperCase()}
                      </Chip>
                    ))}
                  </div>
                </Card>
              )}

              {!editingSlot.featId && (
                avail.length === 0 ? (
                  <EmptyState compact icon="fa-trophy" title="No matching feats" body="Try a different search or category." />
                ) : (
                  <div className="space-y-1.5 max-h-[40dvh] overflow-y-auto v2-scrollbar pr-1">
                    {avail.map(feat => {
                      const v = validateFeatPrereqs(simChar, feat.id);
                      return (
                        <div
                          key={feat.id}
                          role="button"
                          tabIndex={0}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (v.ok) selectFeat(feat); } }}
                          onClick={() => { if (v.ok) selectFeat(feat); }}
                          className={cx(
                            'p-2.5 rounded-lg border transition-all flex items-start gap-2.5',
                            v.ok
                              ? 'border-white/[0.08] bg-obsidian-900/60 hover:border-ember-500/40 hover:bg-obsidian-850 cursor-pointer'
                              : 'border-white/[0.04] bg-obsidian-950/40 opacity-50 cursor-not-allowed',
                          )}
                        >
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-obsidian-800 border border-white/[0.08] shrink-0">
                            <i className={cx('fas', feat.icon, 'text-ember-400 text-sm')} aria-hidden="true" />
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-bold text-parchment truncate">{feat.name}</p>
                              <IconButton
                                icon="fa-circle-info"
                                variant="ghost"
                                size="sm"
                                tip="Details"
                                onClick={e => { e.stopPropagation(); setDetailFeat(feat); }}
                              />
                            </div>
                            <p className="text-[9px] text-ember-400/80 font-mono uppercase tracking-wider">{feat.shortName}</p>
                            <p className="text-[10px] text-parchment-mute mt-0.5 line-clamp-2">{feat.mechanicalEffect}</p>
                            {!v.ok && (
                              <p className="text-[9px] text-blood-400 mt-1">
                                <i className="fas fa-lock text-[8px] mr-1" aria-hidden="true" />{v.reason}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </div>
          );

          function selectFeat(feat: FeatDefinition): void {
            if (editingIdx === null) return;
            updateSlot(editingIdx, {
              level: 0,
              type: 'feat',
              featId: feat.id,
              ...(feat.id === 'resilient' ? { saveStatChoice: 'con' as const } : {}),
            });
            setDetailFeat(null);
          }
        })()}
      </Modal>
    </div>
  );
};

export default FeatsStepV2;
