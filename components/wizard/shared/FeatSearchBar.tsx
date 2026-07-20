import React from 'react';
import { FEAT_CATEGORIES } from '../../../utils/feats';

/** Props for the FeatSearchBar component. */
interface FeatSearchBarProps {
  search: string;
  category: string;
  onSearchChange: (value: string) => void;
  onCategoryChange: (category: string) => void;
}

/** Search input and category filter buttons for filtering the feat list. */
const FeatSearchBar: React.FC<FeatSearchBarProps> = ({ search, category, onSearchChange, onCategoryChange }) => (
  <div className="space-y-2">
    <input
      type="text"
      placeholder="Search feats..."
      value={search}
      onChange={e => onSearchChange(e.target.value)}
      className="w-full px-3 py-2 bg-stone-950 border border-stone-800 rounded text-xs text-stone-200 outline-none focus:border-amber-700"
    />
    <div className="flex flex-wrap gap-1">
      <button
        onClick={() => onCategoryChange('all')}
        className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider ${
          category === 'all' ? 'bg-amber-900/40 text-amber-400 border border-amber-800/30' : 'bg-stone-900 text-stone-500 border border-stone-800'
        }`}
      >
        All
      </button>
      {FEAT_CATEGORIES.map(c => (
        <button
          key={c.key}
          onClick={() => onCategoryChange(c.key)}
          className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider ${
            category === c.key ? 'bg-amber-900/40 text-amber-400 border border-amber-800/30' : 'bg-stone-900 text-stone-500 border border-stone-800'
          }`}
        >
          <i className={`fas ${c.icon} mr-1 text-[8px]`}></i>{c.label}
        </button>
      ))}
    </div>
  </div>
);

export default FeatSearchBar;
