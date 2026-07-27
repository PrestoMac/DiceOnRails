import React, { useState } from 'react';
import { SpellDefinition } from '../../types';
import { StepProps } from './types';
import { getSpellsForClass } from '../../utils/spells';
import { getCantripsKnown, getSpellsKnown, getMaxPrepared, getWizardSpellbookCapacity } from '../../services/spellcastingEngine';
import { StepH, SpellCard } from './SharedComponents';
import SpellDetailModal from '../modals/SpellDetailModal';
import Tooltip from '../ui/Tooltip';

const SPELL_FILTERS = ['all', 'damage', 'healing', 'utility', 'control'];

/** Spell selection step. Displays cantrips and leveled spells for the selected class with filtering, and shows a detail modal on view. */
const SpellsStep: React.FC<StepProps & { onBackToSubclass: () => void; onBackToFeats: () => void; onGoToGear: () => void }> = ({
  wizardState, updateWizard, onBackToSubclass, onBackToFeats, onGoToGear,
}) => {
  const { selectedClass, stats, level, selectedSpells, selectedCantrips } = wizardState;
  const stepCls = "space-y-6 animate-in fade-in duration-500";

  const [spellFilter, setSpellFilter] = useState<string>('all');
  const [viewingSpell, setViewingSpell] = useState<SpellDefinition | null>(null);

  const classSpells = getSpellsForClass(selectedClass.id);
  const cantrips = classSpells.filter(s => s.level === 0);
  // Highest spell level the character actually has slots for, derived from the
  // class slot table (handles full casters, half-casters, and warlock pact magic).
  const maxCastableLevel = (() => {
    const sc = selectedClass.spellcasting;
    if (!sc) return 0;
    const slotsRow = sc.spellSlots?.[Math.min(level - 1, sc.spellSlots.length - 1)];
    if (slotsRow) {
      for (let i = slotsRow.length - 1; i >= 0; i--) {
        if (slotsRow[i] > 0) return i + 1;
      }
    }
    if (selectedClass.id === 'warlock' && sc.pactMagic) {
      if (level >= 17) return 5;
      if (level >= 11) return 4;
      if (level >= 9) return 3;
      if (level >= 5) return 2;
      if (level >= 3) return 1;
    }
    return 1;
  })();
  const leveledSpells = classSpells.filter(s => s.level > 0 && s.level <= maxCastableLevel);
  const maxCantrips = getCantripsKnown({ stats, class: selectedClass.id } as Parameters<typeof getCantripsKnown>[0], level);
  const isWizard = selectedClass.id === 'wizard';
  const isPrepared = selectedClass.spellcasting?.prepMode === 'prepared';
  const maxSpells = isWizard
    ? getWizardSpellbookCapacity(level)
    : isPrepared
    ? getMaxPrepared({ stats, class: selectedClass.id, level } as Parameters<typeof getMaxPrepared>[0], level)
    : getSpellsKnown({ stats, class: selectedClass.id, level } as Parameters<typeof getSpellsKnown>[0], level);
  const preparedCount = selectedSpells.length;
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

  return (
    <div className={`${stepCls} max-h-[75vh] overflow-y-auto custom-scrollbar`}>
      <StepH>Choose Spells</StepH>
      <p className="text-xs text-stone-400 text-center">
        {isWizard ? 'Select spells to add to your wizard spellbook.' : 'Select your spells known or prepared.'}
      </p>
      <div className="bg-stone-950/40 border border-stone-800 rounded-lg p-3 mb-3">
        <p className="text-xs text-stone-400">
          Cantrips: {selectedCantrips.length}/{maxCantrips} |{' '}
          <Tooltip content={spellCategoryTooltip} side="top">
            <span className="underline decoration-dotted">{spellCategoryLabel}</span>
          </Tooltip>
          : {preparedCount}/{maxSpells}
        </p>
      </div>
      <div className="flex flex-wrap gap-1 mb-3">
        {SPELL_FILTERS.map(filter => (
          <button
            key={filter}
            onClick={() => setSpellFilter(filter)}
            className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider border transition-all ${
              spellFilter === filter
                ? 'bg-amber-900/40 text-amber-400 border-amber-800/30'
                : 'bg-stone-900 text-stone-500 border-stone-800 hover:text-stone-300'
            }`}
          >
            {filter}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <p className="text-[10px] uppercase font-bold text-amber-600 tracking-widest">Cantrips</p>
        <div className="grid grid-cols-2 gap-2">
          {filteredCantrips.map(spell => (
            <SpellCard
              key={spell.id}
              spell={spell}
              isSelected={selectedCantrips.includes(spell.id)}
              onToggle={() => handleToggleCantrip(spell.id)}
              onView={() => setViewingSpell(spell)}
            />
          ))}
        </div>
        <p className="text-[10px] uppercase font-bold text-amber-600 tracking-widest mt-3">Leveled Spells</p>
        <div className="grid grid-cols-2 gap-2">
          {filteredLeveledSpells.map(spell => (
            <SpellCard
              key={spell.id}
              spell={spell}
              isSelected={selectedSpells.includes(spell.id)}
              showLevel
              onToggle={() => handleToggleSpell(spell.id)}
              onView={() => setViewingSpell(spell)}
            />
          ))}
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => wizardState.selectedClass.subclassLevel >= 2 ? onBackToSubclass() : onBackToFeats()}
          className="w-1/3 py-3 bg-stone-800 hover:bg-stone-700 rounded-lg font-bold text-stone-400 text-xs"
        >
          Back
        </button>
        <button
          onClick={onGoToGear}
          disabled={selectedCantrips.length < maxCantrips || selectedSpells.length < maxSpells}
          className="w-2/3 py-3 bg-amber-700 hover:bg-amber-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg font-bold text-white transition-all uppercase tracking-wider text-xs shadow-lg shadow-amber-950/40"
        >
          Choose Gear
        </button>
      </div>

      <SpellDetailModal spell={viewingSpell} onClose={() => setViewingSpell(null)} />
    </div>
  );
};

export default SpellsStep;
