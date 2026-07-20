import React from 'react';
import { SubclassListProps, SpellCardProps } from './types';
import { DRAGON_ANCESTRIES } from './constants';

export const StepH: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="fantasy-font text-4xl font-bold text-amber-500 text-center uppercase tracking-widest">{children}</h2>
);

export const NavBtn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = (props) => (
  <button {...props} className={`w-full py-4 bg-amber-700 hover:bg-amber-600 rounded-lg font-bold text-white transition-all uppercase tracking-widest text-xs ${props.className || ''}`} />
);

export const TabBtn: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button onClick={onClick} className={`flex-1 py-2 font-bold rounded transition-all uppercase tracking-wider ${active ? 'bg-amber-900/40 text-amber-400 border border-amber-800/30' : 'text-stone-500 hover:text-stone-300'}`}>{children}</button>
);

export const AdjBtn: React.FC<{ onClick: () => void; disabled?: boolean; icon: string; hoverColor: string }> = ({ onClick, disabled, icon, hoverColor }) => (
  <button onClick={onClick} disabled={disabled} aria-label={icon === 'plus' ? 'Add' : 'Remove'} className={`w-7 h-7 flex items-center justify-center rounded bg-stone-800 ${hoverColor} disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-stone-400 border border-stone-750 text-xs`}>
    <i className={`fas fa-${icon} text-[9px]`}></i>
  </button>
);

export const ErrorBanner: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex items-start gap-3 bg-red-950/30 border border-red-800/40 rounded-lg p-3 text-xs text-red-300">
    <i className="fas fa-exclamation-triangle text-red-500 mt-0.5 shrink-0"></i>
    <span>{message}</span>
  </div>
);

export const SubclassList: React.FC<SubclassListProps> = ({ subclasses, selectedSubclassId, onSelect, level }) => (
  <div className="space-y-3 max-h-[50vh] overflow-y-auto custom-scrollbar pr-1">
    {subclasses.map(sc => (
      <div key={sc.id} onClick={() => onSelect(sc.id)} className={`border rounded p-4 cursor-pointer transition-all ${selectedSubclassId === sc.id ? 'border-amber-600 bg-amber-900/10' : 'border-stone-800 bg-stone-900/40 hover:border-stone-600'}`}>
        <h3 className="font-bold text-amber-500">{sc.name}</h3>
        <p className="text-xs text-stone-400">{sc.description}</p>
        <details className="mt-2">
          <summary className="text-[10px] uppercase text-amber-700 cursor-pointer">View features ({sc.features.length})</summary>
          <ul className="mt-2 space-y-1">
            {sc.features.map(f => (
              <li key={f.id} className={`text-xs ${f.level > level ? 'opacity-40' : ''}`}>
                <strong>L{f.level}:</strong> {f.name} &mdash; {f.description}
              </li>
            ))}
          </ul>
        </details>
      </div>
    ))}
  </div>
);

export const SpellCard: React.FC<SpellCardProps> = ({ spell, isSelected, onToggle, onView, showLevel }) => (
  <div className={`text-left p-2 rounded border text-xs flex items-center justify-between gap-1 ${isSelected ? 'border-amber-600 bg-amber-900/10' : 'border-stone-800 bg-stone-900/40'}`}>
    <button className="flex-1 text-left font-bold" onClick={onToggle}>
      {spell.name}{showLevel && <span className="text-stone-500"> (L{spell.level})</span>}
    </button>
    <button onClick={onView} className="text-stone-500 hover:text-amber-400 transition-colors px-1" title="View spell details">
      <i className="fas fa-info-circle text-[10px]"></i>
    </button>
  </div>
);

export const DragonColorPicker: React.FC<{
  selected: string | null;
  onSelect: (id: string) => void;
  flavor: 'race' | 'origin';
}> = ({ selected, onSelect, flavor }) => (
  <div className="bg-amber-950/10 border border-amber-800/30 rounded-lg p-4 space-y-3 mt-3">
    <p className="text-xs text-amber-400 font-bold text-center">
      {flavor === 'race' ? 'Dragonborn: Choose your Draconic Ancestry' : 'Draconic Bloodline: Choose your Dragon Ancestor'}
    </p>
    <div className="grid grid-cols-5 gap-2">
      {DRAGON_ANCESTRIES.map(d => (
        <button
          key={d.id}
          onClick={() => onSelect(d.id)}
          className={`p-2 rounded border text-center text-xs transition-all ${selected === d.id ? 'border-amber-600 bg-amber-900/20 text-amber-400' : 'border-stone-800 bg-stone-900/40 text-stone-400 hover:border-stone-600'}`}
        >
          <div className="font-bold uppercase">{d.label}</div>
          <div className="text-[9px] capitalize">{d.damageType}</div>
        </button>
      ))}
    </div>
  </div>
);
