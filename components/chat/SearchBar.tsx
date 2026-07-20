import React, { useRef, useEffect } from 'react';
import { MessageRole } from '../../types';

export type FilterType = 'all' | 'narration' | 'player' | 'system';

export const FILTER_OPTIONS: { key: FilterType; label: string; icon: string; match: MessageRole[] }[] = [
  { key: 'all', label: 'All', icon: 'fa-layer-group', match: [MessageRole.MODEL, MessageRole.USER, MessageRole.SYSTEM, MessageRole.TOOL] },
  { key: 'narration', label: 'Narration', icon: 'fa-feather-pointed', match: [MessageRole.MODEL] },
  { key: 'player', label: 'Player', icon: 'fa-user', match: [MessageRole.USER] },
  { key: 'system', label: 'System', icon: 'fa-gear', match: [MessageRole.SYSTEM, MessageRole.TOOL] },
];

interface SearchBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  filteredCount: number;
  totalCount: number;
  show: boolean;
  onToggle: () => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ searchQuery, onSearchChange, activeFilter, onFilterChange, filteredCount, totalCount, show, onToggle }) => {
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (show && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [show]);

  if (!show) return null;

  return (
    <div className="px-4 md:px-8 pb-2 shrink-0">
      <div className="flex items-center gap-1">
        <button onClick={onToggle} className="p-2 rounded-lg text-amber-500 bg-amber-800/30 transition-all duration-200" title="Close search">
          <i className="fas fa-xmark text-sm"></i>
        </button>
        <span className="text-[10px] uppercase tracking-widest text-stone-600 font-bold">Search</span>
      </div>
      <div className="bg-stone-900/50 border border-stone-700/40 rounded-lg p-3 space-y-2.5 mt-1">
        <div className="relative">
          <i className="fas fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-stone-600 text-xs"></i>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search messages..."
            className="w-full bg-stone-800/60 border border-stone-700/40 rounded-md py-2 pl-9 pr-8 text-sm text-stone-300 placeholder-stone-600 focus:outline-none focus:border-amber-700/50 focus:ring-1 focus:ring-amber-800/30 transition-all"
          />
          {searchQuery && (
            <button onClick={() => onSearchChange('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-600 hover:text-stone-400">
              <i className="fas fa-xmark text-xs"></i>
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {FILTER_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => onFilterChange(opt.key)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all duration-200 flex items-center gap-1.5 ${
                activeFilter === opt.key
                  ? 'bg-amber-800/40 text-amber-400 ring-1 ring-amber-700/50'
                  : 'bg-stone-800/40 text-stone-500 hover:text-stone-300 hover:bg-stone-700/40'
              }`}
            >
              <i className={`fas ${opt.icon} text-[8px]`}></i>
              {opt.label}
            </button>
          ))}
          {(searchQuery || activeFilter !== 'all') && (
            <span className="ml-auto text-[10px] text-stone-600 tabular-nums">
              {filteredCount}/{totalCount} shown
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchBar;
