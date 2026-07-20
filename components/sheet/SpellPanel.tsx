import React from 'react';
import { Character } from '../../types';
import { SPELLS_BY_ID } from '../../utils/spells';
import { getClassDef, getSpellSaveDc, getSpellAttackBonus } from '../../services/classEngine';

interface SpellPanelProps {
  character: Character;
}

const SpellPanel: React.FC<SpellPanelProps> = ({ character }) => {
  const classDef = getClassDef(character.class);
  if (!classDef?.spellcasting) return null;

  const isPreparedCaster = classDef.spellcasting.prepMode === 'prepared';
  const spellList = isPreparedCaster ? character.preparedSpells : character.knownSpells;

  return (
    <div className="mt-4 space-y-2">
      <h3 className="text-xs uppercase font-bold text-stone-400 tracking-widest border-b border-stone-850 pb-1 text-left">Spellcasting</h3>
      <div className="flex flex-wrap gap-1.5">
        {(character.resources ?? []).filter(r => r.id.startsWith('spell-slot-')).map(slot => {
          const level = slot.id.slice(-1);
          return (
            <div key={slot.id} className="bg-stone-950/30 border border-stone-850 rounded px-2 py-1 text-[10px] flex items-center gap-1.5">
              <span className="text-stone-500">L{level}</span>
              {Array.from({length: slot.max}).map((_, i) => (
                <span key={i} className={`w-2.5 h-2.5 rounded-full ${i < slot.current ? 'bg-amber-600' : 'bg-stone-800 border border-stone-700'}`}></span>
              ))}
              <span className="text-stone-500">{slot.current}/{slot.max}</span>
            </div>
          );
        })}
      </div>
      {spellList && spellList.length > 0 && (
        <div className="text-xs text-left">
          <p className="text-[10px] text-stone-500 uppercase font-bold mb-1">{isPreparedCaster ? 'Prepared' : 'Known'} Spells</p>
          <div className="flex flex-wrap gap-1">
            {spellList.map(sid => {
              const spell = SPELLS_BY_ID[sid];
              return spell ? <span key={sid} className="text-[10px] text-stone-400 bg-stone-900/50 px-1.5 py-0.5 rounded border border-stone-800">{spell.name}</span> : null;
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default SpellPanel;
