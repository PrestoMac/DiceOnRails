import React, { useMemo, useState } from 'react';
import { SpellDefinition } from '../../types';
import { SPELLS_CATALOG } from '../../utils/spells';
import SpellDetailModal from '../modals/SpellDetailModal';

const LEVEL_FILTERS: Array<{ key: number | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 0, label: 'Cantrips' },
  { key: 1, label: 'L1' },
  { key: 2, label: 'L2' },
  { key: 3, label: 'L3' },
  { key: 4, label: 'L4' },
  { key: 5, label: 'L5' },
  { key: 6, label: 'L6' },
  { key: 7, label: 'L7' },
  { key: 8, label: 'L8' },
  { key: 9, label: 'L9' },
];

/** Filterable spell browser surfacing the full SRD catalog. */
const SpellsTab: React.FC = () => {
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<number | 'all'>('all');
  const [school, setSchool] = useState<string>('all');
  const [viewing, setViewing] = useState<SpellDefinition | null>(null);

  const schools = useMemo(() => {
    const set = new Set<string>();
    SPELLS_CATALOG.forEach(s => set.add(s.school));
    return ['all', ...Array.from(set).sort()];
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SPELLS_CATALOG.filter(s => {
      if (level !== 'all' && s.level !== level) return false;
      if (school !== 'all' && s.school !== school) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
    }).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  }, [query, level, school]);

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search spells... (Fireball, Healing Word, Magic Missile)"
        className="w-full bg-stone-950 border border-stone-800 rounded-lg p-2.5 text-sm text-stone-200 outline-none focus:border-amber-700"
        aria-label="Search spells"
      />
      <div className="flex flex-wrap gap-1">
        {LEVEL_FILTERS.map(f => (
          <button
            key={String(f.key)}
            onClick={() => setLevel(f.key)}
            className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider transition-all ${
              level === f.key
                ? 'bg-amber-900/40 text-amber-400 border border-amber-800/30'
                : 'bg-stone-900 text-stone-500 border border-stone-800 hover:text-stone-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {schools.map(s => (
          <button
            key={s}
            onClick={() => setSchool(s)}
            className={`px-2 py-0.5 rounded text-[8px] uppercase font-bold tracking-wider transition-all capitalize ${
              school === s
                ? 'bg-purple-900/40 text-purple-300 border border-purple-800/30'
                : 'bg-stone-900 text-stone-500 border border-stone-800 hover:text-stone-300'
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      <p className="text-[9px] text-stone-600 italic">{filtered.length} of {SPELLS_CATALOG.length} spells</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[50vh] overflow-y-auto custom-scrollbar pr-1">
        {filtered.slice(0, 200).map(s => (
          <button
            key={s.id}
            onClick={() => setViewing(s)}
            className="text-left p-2 bg-stone-950/40 border border-stone-800 rounded hover:bg-stone-900/50 hover:border-amber-800/40 transition-all"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-bold text-stone-200 truncate">{s.name}</span>
              <span className="text-[8px] font-mono text-amber-500 shrink-0">{s.level === 0 ? 'Cantrip' : `L${s.level}`}</span>
            </div>
            <span className="text-[9px] text-stone-500 capitalize">{s.school}</span>
          </button>
        ))}
      </div>
      <SpellDetailModal spell={viewing} onClose={() => setViewing(null)} />
    </div>
  );
};

export default SpellsTab;
