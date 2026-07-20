import React from 'react';
import { FeatDefinition } from '../utils/feats';

interface FeatDetailModalProps {
  feat: FeatDefinition | null;
  onClose: () => void;
  headerSlot?: React.ReactNode;
}

const CATEGORY_COLORS: Record<string, string> = {
  combat: 'text-red-400 border-red-900/40 bg-red-950/20',
  magic: 'text-purple-400 border-purple-900/40 bg-purple-950/20',
  general: 'text-amber-400 border-amber-900/40 bg-amber-950/20',
  armor: 'text-stone-300 border-stone-700 bg-stone-800/40',
  'saving-throw': 'text-blue-400 border-blue-900/40 bg-blue-950/20',
  flavor: 'text-emerald-400 border-emerald-900/40 bg-emerald-950/20'
};

const CATEGORY_LABELS: Record<string, string> = {
  combat: 'Combat',
  magic: 'Magic',
  general: 'General',
  armor: 'Armor',
  'saving-throw': 'Saves & Defense',
  flavor: 'Roleplay'
};

/** Modal displaying full feat details: icon, category, description, mechanical effect, and prerequisites. */
const FeatDetailModal: React.FC<FeatDetailModalProps> = ({ feat, onClose, headerSlot }) => {
  if (!feat) return null;
  const cat = CATEGORY_COLORS[feat.category] || CATEGORY_COLORS.general;
  const catLabel = CATEGORY_LABELS[feat.category] || 'Feat';

  return (
    <div
      className="fixed inset-0 bg-stone-950/90 z-50 flex items-center justify-center p-4 text-stone-200"
      onClick={onClose}
    >
      <div
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/black-paper.png")' }}
      />
      <div
        className={`max-w-lg w-full bg-stone-900 border rounded-2xl p-6 backdrop-blur-md shadow-2xl relative border-l-4 ${cat}`}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-stone-500 hover:text-stone-200 transition-colors"
          aria-label="Close"
        >
          <i className="fas fa-times text-lg"></i>
        </button>

        <div className="flex items-center gap-3 mb-3">
          <div className={`w-12 h-12 rounded-xl border flex items-center justify-center ${cat}`}>
            <i className={`fas ${feat.icon} text-xl`}></i>
          </div>
          <div className="flex-1">
            <span className="text-[9px] uppercase font-bold tracking-widest text-stone-500">{catLabel}</span>
            <h2 className="fantasy-font text-2xl font-bold text-amber-500 uppercase tracking-widest leading-tight">
              {feat.name}
            </h2>
          </div>
        </div>

        {feat.shortName && feat.shortName !== feat.name && (
          <div className="text-[10px] uppercase font-mono text-stone-500 tracking-widest mb-3">
            {feat.shortName}
          </div>
        )}

        <div className="space-y-4 my-4">
          <div>
            <h3 className="text-[10px] uppercase font-bold text-stone-400 tracking-widest mb-1">Description</h3>
            <p className="text-sm text-stone-300 leading-relaxed">{feat.description}</p>
          </div>
          <div className="bg-stone-950/50 border border-stone-800 rounded-lg p-3">
            <h3 className="text-[10px] uppercase font-bold text-amber-500 tracking-widest mb-1 flex items-center gap-1">
              <i className="fas fa-cog text-[9px]"></i> Mechanical Effect
            </h3>
            <p className="text-sm text-amber-100 leading-relaxed">{feat.mechanicalEffect}</p>
          </div>

          {feat.prerequisites && (
            <div className="bg-stone-950/50 border border-stone-800 rounded-lg p-3">
              <h3 className="text-[10px] uppercase font-bold text-red-400 tracking-widest mb-1 flex items-center gap-1">
                <i className="fas fa-lock text-[9px]"></i> Prerequisites
              </h3>
              <ul className="text-xs text-stone-300 space-y-1">
                {feat.prerequisites.level !== undefined && (
                  <li>• Character level {feat.prerequisites.level} or higher</li>
                )}
                {feat.prerequisites.stat && Object.entries(feat.prerequisites.stat).map(([stat, min]) => (
                  <li key={stat}>• {stat.toUpperCase()} {min} or higher</li>
                ))}
                {feat.prerequisites.armorProf?.map(p => (
                  <li key={p}>• {p.charAt(0).toUpperCase() + p.slice(1)} Armor proficiency</li>
                ))}
                {feat.prerequisites.otherFeats?.map(f => (
                  <li key={f}>• {f.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {headerSlot && <div className="border-t border-stone-800 pt-3">{headerSlot}</div>}
      </div>
    </div>
  );
};

export default FeatDetailModal;
