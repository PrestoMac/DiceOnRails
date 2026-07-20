import React, { useState } from 'react';
import { SpellDefinition } from '../../types';
import { StepProps } from './types';
import { getSpellsForClass } from '../../utils/spells';
import { getCantripsKnown, getSpellsKnown, getMaxPrepared } from '../../services/spellcastingEngine';
import { StepH, SpellCard } from './SharedComponents';

const SPELL_FILTERS = ['all', 'damage', 'healing', 'utility', 'control'];

const SpellsStep: React.FC<StepProps & { onBackToSubclass: () => void; onBackToFeats: () => void; onGoToGear: () => void }> = ({
  wizardState, updateWizard, onBackToSubclass, onBackToFeats, onGoToGear,
}) => {
  const { selectedClass, stats, level, selectedSpells, selectedCantrips } = wizardState;
  const stepCls = "space-y-6 animate-in fade-in duration-500";

  const [spellFilter, setSpellFilter] = useState<string>('all');
  const [viewingSpell, setViewingSpell] = useState<SpellDefinition | null>(null);

  const classSpells = getSpellsForClass(selectedClass.id);
  const cantrips = classSpells.filter(s => s.level === 0);
  const leveledSpells = classSpells.filter(s => s.level > 0 && s.level <= Math.ceil(level / 2) + 1);
  const maxCantrips = getCantripsKnown({ stats, class: selectedClass.id } as Parameters<typeof getCantripsKnown>[0], level);
  const isPrepared = selectedClass.spellcasting?.prepMode === 'prepared';
  const maxSpells = isPrepared
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

  return (
    <div className={`${stepCls} max-h-[75vh] overflow-y-auto custom-scrollbar`}>
      <StepH>Choose Spells</StepH>
      <p className="text-xs text-stone-400 text-center">Select your spells known or prepared.</p>
      <div className="bg-stone-950/40 border border-stone-800 rounded-lg p-3 mb-3">
        <p className="text-xs text-stone-400">Cantrips: {selectedCantrips.length}/{maxCantrips} | {isPrepared ? 'Prepared' : 'Known'}: {preparedCount}/{maxSpells}</p>
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
          {filteredCantrips.slice(0, 20).map(spell => (
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
          {filteredLeveledSpells.slice(0, 40).map(spell => (
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
          disabled={selectedCantrips.length < maxCantrips || (!isPrepared && selectedSpells.length < maxSpells)}
          className="w-2/3 py-3 bg-amber-700 hover:bg-amber-600 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg font-bold text-white transition-all uppercase tracking-wider text-xs shadow-lg shadow-amber-950/40"
        >
          Choose Gear
        </button>
      </div>

      {viewingSpell && (
        <div
          className="fixed inset-0 z-[200] bg-stone-950/80 flex items-center justify-center p-6"
          onClick={() => setViewingSpell(null)}
        >
          <div className="bg-stone-900 border border-stone-700 rounded-2xl p-6 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="fantasy-font text-2xl text-amber-400">{viewingSpell.name}</h2>
                <p className="text-[10px] text-stone-500 uppercase tracking-widest mt-0.5">
                  {viewingSpell.level === 0 ? 'Cantrip' : `Level ${viewingSpell.level} Spell`}
                  {' · '}{viewingSpell.school}
                </p>
              </div>
              <button onClick={() => setViewingSpell(null)} className="text-stone-500 hover:text-stone-200 text-xl">
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="space-y-3 text-xs text-stone-300">
              <div className="grid grid-cols-2 gap-2 bg-stone-950/50 rounded-lg p-3 border border-stone-800">
                <div>
                  <span className="text-stone-500 uppercase text-[9px] font-bold">Casting Time</span>
                  <p className="font-bold capitalize">{viewingSpell.castingTime}</p>
                </div>
                <div>
                  <span className="text-stone-500 uppercase text-[9px] font-bold">Range</span>
                  <p className="font-bold">{viewingSpell.range}</p>
                </div>
                <div>
                  <span className="text-stone-500 uppercase text-[9px] font-bold">Duration</span>
                  <p className="font-bold">{viewingSpell.duration}</p>
                </div>
                <div>
                  <span className="text-stone-500 uppercase text-[9px] font-bold">Concentration</span>
                  <p className="font-bold">{viewingSpell.requiresConcentration ? 'Yes' : 'No'}</p>
                </div>
              </div>
              {viewingSpell.damage && (
                <div className="bg-red-950/20 border border-red-900/30 rounded-lg p-2">
                  <span className="text-[9px] uppercase font-bold text-red-400">Damage</span>
                  <p className="font-mono font-bold text-red-300">
                    {viewingSpell.damage.dice} {viewingSpell.damage.type}
                  </p>
                </div>
              )}
              <p className="text-stone-400 leading-relaxed">{viewingSpell.description}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpellsStep;
