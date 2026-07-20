import React, { useState } from 'react';
import { Quest, LoreEntry } from '../types';
import SectionH from './shared/SectionH';
import TabButton from './shared/TabButton';

interface JournalProps {
  quests: Quest[];
  lore: LoreEntry[];
}

const TABS = [
  { id: 'quests' as const, label: 'Quests', icon: 'fa-scroll' },
  { id: 'npcs' as const, label: 'NPCs', icon: 'fa-users' },
  { id: 'locations' as const, label: 'Locations', icon: 'fa-location-dot' },
  { id: 'history' as const, label: 'History', icon: 'fa-book' },
  { id: 'items' as const, label: 'Items', icon: 'fa-gem' },
];

const CATEGORY_MAP: Record<string, LoreEntry['category']> = {
  npcs: 'NPC',
  locations: 'Location',
  history: 'History',
  items: 'Item',
};

const TAB_ROWS = [TABS.slice(0, 3), TABS.slice(3)];

/** Journal panel with tabbed views for quests, NPCs, locations, history, and item lore entries. */
const Journal: React.FC<JournalProps> = ({ quests, lore }) => {
  const [activeTab, setActiveTab] = useState<string>('quests');
  const filteredLore = activeTab === 'quests' ? [] : lore.filter(e => e.category === CATEGORY_MAP[activeTab]);
  const currentTab = TABS.find(t => t.id === activeTab);

  return (
    <div className="flex flex-col gap-4 fantasy-font animate-in fade-in slide-in-from-right duration-500">
      <div className="flex flex-col gap-0 border-b border-stone-800 pb-0">
        {TAB_ROWS.map((row, i) => (
          <div key={i} className="flex gap-1 justify-center">
            {row.map(tab => (
              <TabButton key={tab.id} active={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} icon={tab.icon}>{tab.label}</TabButton>
            ))}
          </div>
        ))}
      </div>

      {activeTab === 'quests' && (
        <div className="space-y-4">
          <SectionH>Active Deeds</SectionH>
          <div className="space-y-3">
            {quests.length === 0 ? <p className="text-stone-600 italic text-sm">No destiny has been carved yet...</p> : quests.map(q => (
              <div key={q.id} className={`p-3 rounded border transition-all ${q.status === 'completed' ? 'border-green-900 bg-green-950/20 opacity-60' : 'border-stone-800 bg-stone-900/40'}`}>
                <div className="flex justify-between items-start mb-1">
                  <h4 className="font-bold text-stone-200">{q.title}</h4>
                  <span className={`text-[8px] uppercase font-bold px-1.5 py-0.5 rounded ${q.status === 'active' ? 'bg-amber-900 text-amber-400' : q.status === 'completed' ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'}`}>{q.status}</span>
                </div>
                <p className="text-xs text-stone-400 leading-relaxed">{q.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab !== 'quests' && (
        <div className="space-y-4">
          <SectionH>{currentTab?.label ?? activeTab}</SectionH>
          <div className="space-y-4">
            {filteredLore.length === 0 ? <p className="text-stone-600 italic text-sm">The pages remain blank...</p> : filteredLore.map(e => (
              <div key={e.id} className="relative pl-4 border-l-2 border-amber-900/30">
                <h4 className="text-sm font-bold text-stone-300 mb-1">{e.title}</h4>
                <p className="text-xs text-stone-500 italic leading-relaxed">{e.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Journal;
