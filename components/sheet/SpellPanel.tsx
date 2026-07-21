import React from 'react';
import { Character, SpellDefinition } from '../../types';
import { SPELLS_BY_ID } from '../../utils/spells';
import { getClassDef } from '../../services/classEngine';

/** Props for the SpellPanel component. */
interface SpellPanelProps {
  character: Character;
  /** Optional handler invoked when the user clicks a spell badge to view details. */
  onViewSpell?: (spell: SpellDefinition) => void;
}

/** Displays a character's spellcasting information: spell slot resources and known/prepared spells list. */
const SpellPanel: React.FC<SpellPanelProps> = ({ character, onViewSpell }) => {
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
              if (!spell) return null;
              if (onViewSpell) {
                return (
                  <button
                    key={sid}
                    onClick={() => onViewSpell(spell)}
                    className="text-[10px] text-stone-300 hover:text-amber-400 bg-stone-900/50 hover:bg-amber-950/30 hover:border-amber-800/50 px-1.5 py-0.5 rounded border border-stone-800 transition-all cursor-pointer"
                    title={`View ${spell.name} details`}
                  >
                    {spell.name}
                  </button>
                );
              }
              return <span key={sid} className="text-[10px] text-stone-400 bg-stone-900/50 px-1.5 py-0.5 rounded border border-stone-800">{spell.name}</span>;
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default SpellPanel;
