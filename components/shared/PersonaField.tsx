import React, { useState } from 'react';
import Tooltip from '../ui/Tooltip';
import { rollTraitFromTable } from '../../utils/backgrounds';

/** A single persona trait field (personality / ideals / bonds / flaws) with a
 *  roll-from-SRD-table button and editable custom-text slots. Shared between
 *  the character-creation wizard and the sheet's BackgroundModal.
 *
 *  Controlled: the parent owns `values` and replaces the full array on change.
 *  When `readOnly` is true, the field renders its entries as plain text with no
 *  roll/edit controls (for viewers without edit rights). */
const PersonaField: React.FC<{
  title: string;
  hint: string;
  dieSize: number;
  values: string[];
  table: readonly string[];
  onChange: (values: string[]) => void;
  max: number;
  readOnly?: boolean;
}> = ({ title, hint, dieSize, values, table, onChange, max, readOnly }) => {
  const [rolling, setRolling] = useState(false);

  const handleRoll = () => {
    if (readOnly) return;
    const entry = rollTraitFromTable(table);
    if (!entry) return;
    setRolling(true);
    setTimeout(() => setRolling(false), 350);
    const emptyIdx = values.findIndex(v => !v || !v.trim());
    if (emptyIdx >= 0) {
      const copy = [...values];
      copy[emptyIdx] = entry;
      onChange(copy);
    } else if (values.length < max) {
      onChange([...values, entry]);
    } else {
      onChange([...values.slice(0, -1), entry]);
    }
  };

  const addCustom = () => {
    if (readOnly || values.length >= max) return;
    onChange([...values, '']);
  };

  const updateAt = (idx: number, text: string) => {
    const copy = [...values];
    copy[idx] = text;
    onChange(copy);
  };

  const removeAt = (idx: number) => {
    onChange(values.filter((_, i) => i !== idx));
  };

  return (
    <div className="bg-stone-900/40 border border-stone-800 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase font-bold text-amber-700 tracking-widest">{title}</p>
          <p className="text-[9px] text-stone-600">{hint}</p>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-1.5">
            {dieSize > 0 && (
              <Tooltip content={`Roll on the SRD ${title.toLowerCase()} table (d${dieSize}). Fills an empty slot, or replaces the last entry.`} side="top">
                <button
                  type="button"
                  onClick={handleRoll}
                  className={`px-2 py-1 rounded bg-stone-800 hover:bg-amber-900/40 border border-stone-700 text-[9px] uppercase font-bold text-amber-500 transition-all ${rolling ? 'animate-spin' : ''}`}
                >
                  <i className="fas fa-dice text-[10px] mr-1"></i>Roll d{dieSize}
                </button>
              </Tooltip>
            )}
            <Tooltip content="Write your own instead." side="top">
              <button
                type="button"
                onClick={addCustom}
                disabled={values.length >= max}
                className="px-2 py-1 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700 text-[9px] uppercase font-bold text-stone-400 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <i className="fas fa-plus text-[9px]"></i>
              </button>
            </Tooltip>
          </div>
        )}
      </div>
      {values.length === 0 ? (
        <p className="text-[10px] text-stone-600 italic px-1">
          {readOnly ? 'Not set.' : dieSize > 0 ? 'Roll for a suggestion, or add your own.' : 'Add your own.'}
        </p>
      ) : (
        <div className="space-y-1.5">
          {values.map((v, idx) => (
            readOnly ? (
              <p key={idx} className="text-[11px] text-stone-300 px-1 leading-relaxed">{v}</p>
            ) : (
              <div key={idx} className="flex items-start gap-1.5">
                <textarea
                  value={v}
                  onChange={e => updateAt(idx, e.target.value)}
                  rows={2}
                  className="flex-1 bg-stone-950 border border-stone-800 rounded p-2 text-[11px] text-stone-300 focus:border-amber-600 outline-none resize-none placeholder-stone-700"
                  placeholder={`${title} entry...`}
                />
                <button
                  type="button"
                  onClick={() => removeAt(idx)}
                  className="mt-1 text-stone-600 hover:text-red-400 transition-colors"
                  title="Remove"
                >
                  <i className="fas fa-times text-[10px]"></i>
                </button>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  );
};

export default PersonaField;
