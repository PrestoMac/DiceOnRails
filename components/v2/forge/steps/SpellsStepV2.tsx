import React, { useState } from 'react';
import Chip from '../../primitives/Chip';
import Modal from '../../primitives/Modal';
import Tooltip from '../../primitives/Tooltip';
import IconButton from '../../primitives/IconButton';
import EmptyState from '../../primitives/EmptyState';
import { cx } from '../../primitives/cx';
import type { SpellDefinition } from '../../../../types';
import { getSpellsForClass } from '../../../../utils/spells';
import { computeSpellCaps } from '../forgeUtils';
import type { ForgeStepProps } from '../forgeTypes';

export type SpellsStepV2Props = ForgeStepProps;

const SPELL_FILTERS = ['all', 'damage', 'healing', 'utility', 'control'];

/**
 * Forge step 7: spell selection — port of the legacy SpellsStep.
 * Caps come from the real engine helpers (getCantripsKnown /
 * getWizardSpellbookCapacity / getMaxPrepared / getSpellsKnown) and the
 * max castable level is derived from the class slot table with the warlock
 * pact fallback (see forgeUtils.computeSpellCaps).
 */
const SpellsStepV2: React.FC<SpellsStepV2Props> = ({ wizard, updateWizard }) => {
  const { selectedClass, selectedSpells, selectedCantrips } = wizard;

  const [spellFilter, setSpellFilter] = useState<string>('all');
  const [viewingSpell, setViewingSpell] = useState<SpellDefinition | null>(null);

  const caps = computeSpellCaps(wizard);
  const { maxCantrips, maxSpells, isWizard, isPrepared, maxCastableLevel } = caps;

  const classSpells = getSpellsForClass(selectedClass.id);
  const cantrips = classSpells.filter(s => s.level === 0);
  const leveledSpells = classSpells.filter(s => s.level > 0 && s.level <= maxCastableLevel);
  const filteredCantrips = cantrips.filter(spell => spellFilter === 'all' || spell.tags?.includes(spellFilter));
  const filteredLeveledSpells = leveledSpells.filter(spell => spellFilter === 'all' || spell.tags?.includes(spellFilter));

  const handleToggleCantrip = (spellId: string) => {
    if (selectedCantrips.includes(spellId)) {
      updateWizard({ selectedCantrips: selectedCantrips.filter(s => s !== spellId) });
    } else if (selectedCantrips.length < maxCantrips) {
      updateWizard({ selectedCantrips: [...selectedCantrips, spellId] });
    }
  };

  const handleToggleSpell = (spellId: string) => {
    if (selectedSpells.includes(spellId)) {
      updateWizard({ selectedSpells: selectedSpells.filter(s => s !== spellId) });
    } else if (selectedSpells.length < maxSpells) {
      updateWizard({ selectedSpells: [...selectedSpells, spellId] });
    }
  };

  const spellCategoryLabel = isWizard ? 'Spellbook' : isPrepared ? 'Prepared' : 'Known';
  const spellCategoryTooltip = isWizard
    ? 'Spellbook Spells: Wizards select 6 1st-level spells for their spellbook at level 1 (+2 per level gained). You can prepare up to INT mod + level of them.'
    : isPrepared
      ? 'Prepared spells (Cleric/Druid/Paladin): you can change your selection after a Long Rest. Limit = spellcasting modifier + level.'
      : 'Known spells (Bard/Sorcerer/Warlock/Ranger): permanently learned. Only changed on level-up.';

  const spellCard = (spell: SpellDefinition, showLevel: boolean) => {
    const isSelected = (showLevel ? selectedSpells : selectedCantrips).includes(spell.id);
    const onToggle = showLevel ? () => handleToggleSpell(spell.id) : () => handleToggleCantrip(spell.id);
    return (
      <div
        key={spell.id}
        className={cx(
          'text-left p-2 rounded-lg border text-xs flex items-center justify-between gap-1 transition-colors',
          isSelected ? 'border-arcane-500/60 bg-arcane-500/10' : 'border-white/[0.08] bg-obsidian-900/60 hover:border-white/20',
        )}
      >
        <button type="button" className="flex items-center gap-2 flex-1 text-left font-bold text-parchment cursor-pointer" onClick={onToggle}>
          <i className={cx('fas text-[10px]', spell.icon || 'fa-hat-wizard', 'text-arcane-400 shrink-0')} aria-hidden="true" />
          <span>
            {spell.name}
            {showLevel && <span className="text-parchment-faint font-normal"> (L{spell.level})</span>}
            {spell.requiresConcentration && (
              <Tooltip content="Requires concentration" side="top">
                <i className="fas fa-arrows-to-circle text-[8px] text-arcane-300/70 ml-1.5" aria-hidden="true" />
              </Tooltip>
            )}
          </span>
        </button>
        <IconButton icon="fa-circle-info" variant="ghost" size="sm" tip="View spell details" onClick={() => setViewingSpell(spell)} />
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-400/90">
          <i className="fas fa-wand-magic-sparkles text-[10px] mr-2" aria-hidden="true" />Choose Spells
        </p>
        <p className="text-[11px] text-parchment-faint mt-1">
          {isWizard ? 'Select spells to add to your wizard spellbook.' : 'Select your spells known or prepared.'}
        </p>
      </div>

      <div className="bg-obsidian-900/70 border border-white/[0.06] rounded-xl px-4 py-2.5 text-xs text-parchment-mute flex items-center gap-2 flex-wrap">
        <span>Cantrips: <strong className={cx('font-mono', selectedCantrips.length >= maxCantrips ? 'text-verdant-400' : 'text-ember-300')}>{selectedCantrips.length}/{maxCantrips}</strong></span>
        <span className="text-parchment-faint">|</span>
        <Tooltip content={spellCategoryTooltip} side="top">
          <span className="underline decoration-dotted cursor-default">{spellCategoryLabel}</span>
        </Tooltip>
        <span>: <strong className={cx('font-mono', selectedSpells.length >= maxSpells ? 'text-verdant-400' : 'text-ember-300')}>{selectedSpells.length}/{maxSpells}</strong></span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SPELL_FILTERS.map(filter => (
          <Chip key={filter} color="arcane" active={spellFilter === filter} onClick={() => setSpellFilter(filter)} className="capitalize">
            {filter}
          </Chip>
        ))}
      </div>

      <div className="space-y-4">
        <div>
          <p className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-arcane-300 mb-2">Cantrips</p>
          {filteredCantrips.length === 0 ? (
            <EmptyState compact icon="fa-hat-wizard" title="No cantrips match" body="Try a different filter." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{filteredCantrips.map(spell => spellCard(spell, false))}</div>
          )}
        </div>
        <div>
          <p className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-arcane-300 mb-2">Leveled Spells</p>
          {filteredLeveledSpells.length === 0 ? (
            <EmptyState compact icon="fa-hat-wizard" title="No spells match" body="Try a different filter." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{filteredLeveledSpells.map(spell => spellCard(spell, true))}</div>
          )}
        </div>
      </div>

      <Modal
        open={viewingSpell !== null}
        onClose={() => setViewingSpell(null)}
        title={viewingSpell?.name}
        subtitle={viewingSpell ? `${viewingSpell.level === 0 ? 'Cantrip' : `Level ${viewingSpell.level}`} · ${viewingSpell.school.charAt(0).toUpperCase() + viewingSpell.school.slice(1)}` : undefined}
        icon="fa-book-open"
      >
        {viewingSpell && (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-obsidian-850/80 border border-white/[0.06] rounded-lg px-3 py-2">
                <p className="text-[9px] uppercase font-bold text-parchment-faint tracking-wider">Casting Time</p>
                <p className="text-parchment-dim capitalize mt-0.5">{viewingSpell.castingTime}</p>
              </div>
              <div className="bg-obsidian-850/80 border border-white/[0.06] rounded-lg px-3 py-2">
                <p className="text-[9px] uppercase font-bold text-parchment-faint tracking-wider">Range</p>
                <p className="text-parchment-dim mt-0.5">{viewingSpell.range}</p>
              </div>
              <div className="bg-obsidian-850/80 border border-white/[0.06] rounded-lg px-3 py-2">
                <p className="text-[9px] uppercase font-bold text-parchment-faint tracking-wider">Duration</p>
                <p className="text-parchment-dim mt-0.5">{viewingSpell.duration}</p>
              </div>
              <div className="bg-obsidian-850/80 border border-white/[0.06] rounded-lg px-3 py-2">
                <p className="text-[9px] uppercase font-bold text-parchment-faint tracking-wider">Concentration</p>
                <p className={cx('mt-0.5 font-bold', viewingSpell.requiresConcentration ? 'text-arcane-300' : 'text-parchment-dim')}>
                  {viewingSpell.requiresConcentration ? 'Yes' : 'No'}
                </p>
              </div>
            </div>
            {viewingSpell.tags && viewingSpell.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {viewingSpell.tags.map(tag => <Chip key={tag} color="arcane" className="capitalize">{tag}</Chip>)}
              </div>
            )}
            <p className="text-parchment-dim leading-relaxed">{viewingSpell.description}</p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default SpellsStepV2;
