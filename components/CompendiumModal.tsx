import React, { useState } from 'react';
import GlossaryTab from './compendium/GlossaryTab';
import ConditionsTab from './compendium/ConditionsTab';
import RulesTab from './compendium/RulesTab';
import SpellsTab from './compendium/SpellsTab';
import ItemsTab from './compendium/ItemsTab';

type TabKey = 'glossary' | 'conditions' | 'rules' | 'spells' | 'items';

const TABS: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'glossary', label: 'Glossary', icon: 'fa-book' },
  { key: 'conditions', label: 'Conditions', icon: 'fa-circle-exclamation' },
  { key: 'rules', label: 'Rules', icon: 'fa-scroll' },
  { key: 'spells', label: 'Spells', icon: 'fa-hat-wizard' },
  { key: 'items', label: 'Items', icon: 'fa-treasure-chest' },
];

export interface CompendiumModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Read-only reference modal with five tabs (Glossary, Conditions, Rules, Spells, Items). */
const CompendiumModal: React.FC<CompendiumModalProps> = ({ isOpen, onClose }) => {
  const [tab, setTab] = useState<TabKey>('glossary');

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[150] bg-stone-950/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Compendium"
    >
      <div
        className="bg-stone-900 border border-stone-700 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-stone-800">
          <div className="flex items-center gap-2">
            <i className="fas fa-book-open text-amber-500 text-xl"></i>
            <h2 className="fantasy-font text-2xl font-bold text-amber-500 uppercase tracking-widest">Compendium</h2>
          </div>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-200 text-xl transition-colors" aria-label="Close">
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="flex gap-1 p-3 border-b border-stone-800 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                tab === t.key
                  ? 'bg-amber-900/40 text-amber-400 border border-amber-800/30'
                  : 'text-stone-500 hover:text-stone-300 hover:bg-stone-800/40'
              }`}
            >
              <i className={`fas ${t.icon} text-[10px]`}></i>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          {tab === 'glossary' && <GlossaryTab />}
          {tab === 'conditions' && <ConditionsTab />}
          {tab === 'rules' && <RulesTab />}
          {tab === 'spells' && <SpellsTab />}
          {tab === 'items' && <ItemsTab />}
        </div>
        <div className="px-4 py-2 border-t border-stone-800">
          <p className="text-[10px] leading-relaxed text-stone-600">
            Rules content derived from the System Reference Document 5.1 (Wizards of the Coast), licensed under the Creative Commons Attribution 4.0 International License.
          </p>
        </div>
      </div>
    </div>
  );
};

export default CompendiumModal;
