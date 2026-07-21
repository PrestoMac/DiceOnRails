import React, { useMemo, useState } from 'react';
import { GLOSSARY, GlossaryEntry } from '../../data/glossary';

const CATEGORIES: Array<{ key: GlossaryEntry['category'] | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'combat', label: 'Combat' },
  { key: 'magic', label: 'Magic' },
  { key: 'stats', label: 'Stats' },
  { key: 'progression', label: 'Progression' },
  { key: 'general', label: 'General' },
];

/** Searchable glossary tab in the Compendium modal. */
const GlossaryTab: React.FC = () => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<GlossaryEntry['category'] | 'all'>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GLOSSARY.filter(entry => {
      if (category !== 'all' && entry.category !== category) return false;
      if (!q) return true;
      return (
        entry.term.toLowerCase().includes(q) ||
        entry.definition.toLowerCase().includes(q) ||
        (entry.seeAlso ?? []).some(s => s.toLowerCase().includes(q))
      );
    });
  }, [query, category]);

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search jargon... (AC, DC, ASI, Concentration)"
        className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2.5 text-sm text-stone-200 outline-none focus:border-amber-700"
        aria-label="Search glossary"
      />
      <div className="flex flex-wrap gap-1">
        {CATEGORIES.map(c => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key)}
            className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider transition-all ${
              category === c.key
                ? 'bg-amber-900/40 text-amber-400 border border-amber-800/30'
                : 'bg-stone-900 text-stone-500 border border-stone-800 hover:text-stone-300'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="space-y-2 max-h-[50vh] overflow-y-auto custom-scrollbar pr-1">
        {filtered.length === 0 ? (
          <p className="text-center text-stone-500 text-xs py-6 italic">No matches.</p>
        ) : filtered.map(entry => (
          <div key={entry.term} className="bg-stone-950/40 border border-stone-800 rounded-lg p-3">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 className="text-sm font-bold text-amber-400">{entry.term}</h3>
              {entry.category && (
                <span className="text-[8px] uppercase font-bold text-stone-600 bg-stone-900 px-1.5 py-0.5 rounded">{entry.category}</span>
              )}
            </div>
            <p className="text-xs text-stone-300 leading-relaxed">{entry.definition}</p>
            {entry.seeAlso && entry.seeAlso.length > 0 && (
              <p className="text-[10px] text-stone-600 mt-1.5">
                <span className="font-bold uppercase tracking-wider">See also:</span> {entry.seeAlso.join(', ')}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default GlossaryTab;
