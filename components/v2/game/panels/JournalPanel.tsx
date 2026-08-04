import React, { useState } from 'react';
import type { Quest, LoreEntry, QuestDifficulty } from '../../../../types';
import Card, { SectionHeader } from '../../primitives/Card';
import Chip from '../../primitives/Chip';
import Tabs from '../../primitives/Tabs';
import EmptyState from '../../primitives/EmptyState';
import { cx } from '../../primitives/cx';
import { capitalize } from './panelUtils';

export interface JournalPanelProps {
  quests: Quest[];
  lore: LoreEntry[];
}

type JournalTab = 'quests' | 'npcs' | 'locations' | 'history' | 'items';

const CATEGORY_MAP: Record<Exclude<JournalTab, 'quests'>, LoreEntry['category']> = {
  npcs: 'NPC',
  locations: 'Location',
  history: 'History',
  items: 'Item',
};

const STATUS_COLOR: Record<Quest['status'], 'ember' | 'verdant' | 'blood'> = {
  active: 'ember',
  completed: 'verdant',
  failed: 'blood',
};

const DIFFICULTY_COLOR: Record<QuestDifficulty, 'neutral' | 'verdant' | 'ember' | 'arcane' | 'blood'> = {
  trivial: 'neutral',
  easy: 'verdant',
  medium: 'ember',
  hard: 'arcane',
  deadly: 'blood',
};

/** Emberlight V2 journal dock panel — quests plus category-filtered lore entries. */
const JournalPanel: React.FC<JournalPanelProps> = ({ quests, lore }) => {
  const [activeTab, setActiveTab] = useState<JournalTab>('quests');

  const loreForTab = (tab: Exclude<JournalTab, 'quests'>) => lore.filter((e) => e.category === CATEGORY_MAP[tab]);
  const activeQuests = quests.filter((q) => q.status === 'active').length;

  const tabItems = [
    { key: 'quests', label: 'Quests', icon: 'fa-scroll', badge: activeQuests },
    { key: 'npcs', label: 'NPCs', icon: 'fa-users', badge: loreForTab('npcs').length },
    { key: 'locations', label: 'Locations', icon: 'fa-location-dot', badge: loreForTab('locations').length },
    { key: 'history', label: 'History', icon: 'fa-book', badge: loreForTab('history').length },
    { key: 'items', label: 'Items', icon: 'fa-gem', badge: loreForTab('items').length },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-obsidian-950 font-body text-parchment">
      <div className="shrink-0 border-b border-white/[0.06] bg-obsidian-900/95 px-3 pb-3 pt-3">
        <Tabs items={tabItems} active={activeTab} onChange={(key) => setActiveTab(key as JournalTab)} small />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto v2-scrollbar px-3 py-4">
        {activeTab === 'quests' ? (
          <div className="space-y-3">
            <SectionHeader icon="fa-scroll">Active Deeds</SectionHeader>
            {quests.length === 0 ? (
              <EmptyState
                compact
                icon="fa-scroll"
                title="No destiny has been carved yet"
                body="Quests the party discovers will be chronicled here."
              />
            ) : (
              quests.map((q) => (
                <Card
                  key={q.id}
                  accent={q.status === 'completed' ? 'verdant' : q.status === 'failed' ? 'blood' : 'ember'}
                  className={cx(q.status === 'completed' && 'opacity-60')}
                >
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <h4 className="font-display text-sm font-semibold text-parchment">{q.title}</h4>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                      {q.difficulty && <Chip color={DIFFICULTY_COLOR[q.difficulty]}>{capitalize(q.difficulty)}</Chip>}
                      <Chip color={STATUS_COLOR[q.status]}>{capitalize(q.status)}</Chip>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-parchment-mute">{q.description}</p>
                </Card>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <SectionHeader icon={CATEGORY_MAP[activeTab] === 'NPC' ? 'fa-users' : CATEGORY_MAP[activeTab] === 'Location' ? 'fa-location-dot' : CATEGORY_MAP[activeTab] === 'History' ? 'fa-book' : 'fa-gem'}>
              {capitalize(activeTab)}
            </SectionHeader>
            {loreForTab(activeTab).length === 0 ? (
              <EmptyState
                compact
                icon="fa-book-open"
                title="The pages remain blank"
                body="Lore revealed on the road will be recorded here."
              />
            ) : (
              loreForTab(activeTab).map((e) => (
                <Card key={e.id} accent="ember">
                  <h4 className="mb-1 font-display text-sm font-semibold text-parchment">{e.title}</h4>
                  <p className="text-xs italic leading-relaxed text-parchment-mute">{e.content}</p>
                </Card>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default JournalPanel;
