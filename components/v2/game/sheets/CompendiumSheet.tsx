import React, { useMemo, useState } from 'react';
import { SpellDefinition } from '../../../../types';
import { GLOSSARY, GlossaryEntry } from '../../../../data/glossary';
import { CONDITION_INFO, EXHAUSTION_LEVELS } from '../../../../data/conditionInfo';
import {
  CURRENCY_INFO,
  REST_INFO,
  DEATH_SAVE_INFO,
  EXHAUSTION_INFO,
  COMBAT_RULES,
  DC_TABLE,
  CR_TO_XP,
  DC_TO_XP,
} from '../../../../data/referenceConstants';
import { SPELLS_CATALOG } from '../../../../utils/spells';
import { SRD_ITEMS } from '../../../../utils/srdItems';
import Modal from '../../primitives/Modal';
import Tabs from '../../primitives/Tabs';
import Chip from '../../primitives/Chip';
import Card, { SectionHeader } from '../../primitives/Card';
import { TextField } from '../../primitives/Field';
import { cx } from '../../primitives/cx';
import { ItemDetailModalV2, SpellDetailModalV2, V2ItemDetail } from './DetailModals';

type TabKey = 'glossary' | 'conditions' | 'rules' | 'spells' | 'items';

const TAB_ITEMS = [
  { key: 'glossary', label: 'Glossary', icon: 'fa-book' },
  { key: 'conditions', label: 'Conditions', icon: 'fa-circle-exclamation' },
  { key: 'rules', label: 'Rules', icon: 'fa-scroll' },
  { key: 'spells', label: 'Spells', icon: 'fa-hat-wizard' },
  { key: 'items', label: 'Items', icon: 'fa-box-open' },
];

/* ------------------------------------------------------------------ */
/* Glossary                                                            */
/* ------------------------------------------------------------------ */

const GLOSSARY_CATEGORIES: Array<{ key: GlossaryEntry['category'] | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'combat', label: 'Combat' },
  { key: 'magic', label: 'Magic' },
  { key: 'stats', label: 'Stats' },
  { key: 'progression', label: 'Progression' },
  { key: 'general', label: 'General' },
];

const GlossaryTabV2: React.FC = () => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<GlossaryEntry['category'] | 'all'>('all');
  const [expandedTerm, setExpandedTerm] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GLOSSARY.filter((entry) => {
      if (category !== 'all' && entry.category !== category) return false;
      if (!q) return true;
      return (
        entry.term.toLowerCase().includes(q) ||
        entry.definition.toLowerCase().includes(q) ||
        (entry.seeAlso ?? []).some((s) => s.toLowerCase().includes(q))
      );
    });
  }, [query, category]);

  return (
    <div className="space-y-3">
      <TextField
        icon="fa-magnifying-glass"
        value={query}
        onChange={setQuery}
        placeholder="Search jargon... (AC, DC, ASI, Concentration)"
      />
      <div className="flex flex-wrap gap-1">
        {GLOSSARY_CATEGORIES.map((c) => (
          <Chip key={c.key} color="ember" active={category === c.key} onClick={() => setCategory(c.key)}>
            {c.label}
          </Chip>
        ))}
      </div>
      <div className="space-y-1.5 max-h-[52vh] overflow-y-auto v2-scrollbar pr-1">
        {filtered.length === 0 ? (
          <p className="text-center text-parchment-faint text-xs py-6 italic">No matches.</p>
        ) : (
          filtered.map((entry) => {
            const expanded = expandedTerm === entry.term;
            return (
              <Card
                key={entry.term}
                interactive
                className="p-3"
                onClick={() => setExpandedTerm((prev) => (prev === entry.term ? null : entry.term))}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-ember-300">{entry.term}</h3>
                  <div className="flex items-center gap-1.5">
                    {entry.category && <Chip color="neutral" className="uppercase text-[8px]">{entry.category}</Chip>}
                    <i
                      className={cx('fas text-[9px] text-parchment-faint', expanded ? 'fa-chevron-down' : 'fa-chevron-right')}
                      aria-hidden="true"
                    />
                  </div>
                </div>
                {expanded && (
                  <div className="mt-2 animate-fade-in">
                    <p className="text-xs text-parchment-dim leading-relaxed">{entry.definition}</p>
                    {entry.seeAlso && entry.seeAlso.length > 0 && (
                      <p className="text-[10px] text-parchment-faint mt-1.5">
                        <span className="font-bold uppercase tracking-wider">See also:</span> {entry.seeAlso.join(', ')}
                      </p>
                    )}
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Conditions                                                          */
/* ------------------------------------------------------------------ */

const toneChip = (tone?: string): 'verdant' | 'blood' | 'ember' =>
  tone === 'buff' ? 'verdant' : tone === 'debuff' ? 'blood' : 'ember';
const toneText = (tone?: string): string =>
  tone === 'buff' ? 'text-verdant-400' : tone === 'debuff' ? 'text-blood-400' : 'text-ember-400';

const ConditionsTabV2: React.FC = () => {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <section>
        <SectionHeader icon="fa-circle-exclamation">Standard Conditions</SectionHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {Object.entries(CONDITION_INFO).map(([id, info]) => {
            const open = openId === id;
            return (
              <Card
                key={id}
                interactive
                accent={info.tone === 'buff' ? 'verdant' : info.tone === 'debuff' ? 'blood' : 'none'}
                className="p-2.5"
                onClick={() => setOpenId((prev) => (prev === id ? null : id))}
              >
                <div className="flex items-center gap-1.5">
                  <i className={cx('fas text-[10px]', info.icon, toneText(info.tone))} aria-hidden="true" />
                  <h4 className="flex-1 text-xs font-bold text-parchment capitalize">{id}</h4>
                  {info.tone && <Chip color={toneChip(info.tone)} className="uppercase text-[8px]">{info.tone}</Chip>}
                  <i className={cx('fas text-[8px] text-parchment-faint', open ? 'fa-chevron-down' : 'fa-chevron-right')} aria-hidden="true" />
                </div>
                {open && (
                  <div className="mt-2 animate-fade-in">
                    <p className="text-[11px] text-parchment-dim leading-relaxed mb-1">{info.summary}</p>
                    {info.effects && info.effects.length > 0 && (
                      <ul className="text-[10px] text-parchment-mute space-y-0.5 list-disc list-inside">
                        {info.effects.map((eff, i) => (
                          <li key={i}>{eff}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </section>
      <section>
        <SectionHeader icon="fa-battery-quarter">Exhaustion Levels (cumulative)</SectionHeader>
        <div className="space-y-1">
          {EXHAUSTION_LEVELS.map((l) => (
            <div key={l.level} className="bg-ember-500/[0.06] border border-ember-500/20 rounded-lg p-2 flex items-start gap-3">
              <span className="text-xs font-bold font-mono text-ember-400 shrink-0 w-8">L{l.level}</span>
              <div>
                <div className="text-xs font-bold text-parchment-dim">{l.label}</div>
                <div className="text-[10px] text-parchment-mute">{l.description}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-parchment-faint mt-2 italic">A Long Rest reduces exhaustion by 1 level.</p>
      </section>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Rules                                                               */
/* ------------------------------------------------------------------ */

const RulesTabV2: React.FC = () => (
  <div className="space-y-5 text-xs">
    <section>
      <SectionHeader icon="fa-coins">Currency</SectionHeader>
      <Card className="p-3">
        <p className="font-mono text-sm text-parchment">{CURRENCY_INFO.conversion}</p>
        <div className="flex gap-3 mt-2 text-[10px]">
          <span className="text-ember-400">Gold (GP)</span>
          <span className="text-parchment-mute">Silver (SP)</span>
          <span className="text-ember-700">Copper (CP)</span>
        </div>
      </Card>
    </section>

    <section>
      <SectionHeader icon="fa-gauge-high">Difficulty Classes</SectionHeader>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {DC_TABLE.map((d) => (
          <div key={d.dc} className="bg-obsidian-850/80 border border-white/[0.06] rounded-lg p-2 text-center">
            <div className="text-sm font-bold text-ember-300 font-mono">DC {d.dc}</div>
            <div className="text-[9px] text-parchment-faint uppercase">{d.label}</div>
          </div>
        ))}
      </div>
    </section>

    <section>
      <SectionHeader icon="fa-star">Skill Check XP Rewards</SectionHeader>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {DC_TO_XP.map((x) => (
          <div key={x.dc} className="bg-obsidian-850/80 border border-white/[0.06] rounded-lg p-2 text-center">
            <div className="text-[9px] text-parchment-faint uppercase">
              {x.label} (DC {x.dc})
            </div>
            <div className="text-sm font-bold text-verdant-400 font-mono">+{x.xp} XP</div>
          </div>
        ))}
      </div>
    </section>

    <section>
      <SectionHeader icon="fa-dragon">Monster CR → XP</SectionHeader>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
        {CR_TO_XP.map((x) => (
          <div key={x.cr} className="bg-obsidian-850/80 border border-white/[0.06] rounded-lg p-1.5 text-center">
            <div className="text-[9px] text-parchment-faint uppercase">CR {x.cr}</div>
            <div className="text-xs font-bold text-ember-300 font-mono">{x.xp}</div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-parchment-faint mt-1.5 italic">Solo play adds +25% Adventurer's Buffer to all XP awards.</p>
    </section>

    <section>
      <SectionHeader icon="fa-bed">Rest Mechanics</SectionHeader>
      <div className="space-y-2">
        {REST_INFO.map((r) => (
          <Card key={r.key} className="p-3">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-sm font-bold text-ember-300">{r.label}</h4>
              <Chip color="neutral" className="uppercase text-[8px]">{r.duration}</Chip>
            </div>
            <p className="text-[11px] text-parchment-dim mb-1.5 leading-relaxed">{r.description}</p>
            <ul className="text-[10px] text-parchment-mute space-y-0.5 list-disc list-inside">
              {r.restores.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </section>

    <section>
      <SectionHeader icon="fa-heart-pulse">Death Saves</SectionHeader>
      <Card className="p-3 space-y-1">
        <p className="text-parchment-dim">{DEATH_SAVE_INFO.description}</p>
        <p className="text-verdant-400 text-[11px]">Success: {DEATH_SAVE_INFO.success}</p>
        <p className="text-blood-400 text-[11px]">Failure: {DEATH_SAVE_INFO.failure}</p>
        <p className="text-parchment-mute text-[10px]">Nat 20: {DEATH_SAVE_INFO.nat20}</p>
        <p className="text-parchment-mute text-[10px]">Nat 1: {DEATH_SAVE_INFO.nat1}</p>
        <p className="text-parchment-mute text-[10px]">{DEATH_SAVE_INFO.takingDamage}</p>
      </Card>
    </section>

    <section>
      <SectionHeader icon="fa-battery-quarter">Exhaustion (cumulative)</SectionHeader>
      <Card className="p-3 space-y-0.5">
        {EXHAUSTION_INFO.map((l) => (
          <div key={l.level} className="text-[11px] text-parchment-dim">
            <strong className="text-ember-400 font-mono">L{l.level}:</strong> {l.description}
          </div>
        ))}
      </Card>
    </section>

    <section>
      <SectionHeader icon="fa-shield-halved">Combat Reference</SectionHeader>
      <div className="space-y-2">
        {Object.values(COMBAT_RULES).map((rule) => (
          <Card key={rule.label} className="p-3">
            <h4 className="text-xs font-bold text-ember-300 mb-0.5">{rule.label}</h4>
            <p className="text-[11px] text-parchment-mute leading-relaxed">{rule.description}</p>
          </Card>
        ))}
      </div>
    </section>
  </div>
);

/* ------------------------------------------------------------------ */
/* Spells                                                              */
/* ------------------------------------------------------------------ */

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

const SpellsTabV2: React.FC = () => {
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<number | 'all'>('all');
  const [school, setSchool] = useState<string>('all');
  const [viewing, setViewing] = useState<SpellDefinition | null>(null);

  const schools = useMemo(() => {
    const set = new Set<string>();
    SPELLS_CATALOG.forEach((s) => set.add(s.school));
    return ['all', ...Array.from(set).sort()];
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SPELLS_CATALOG.filter((s) => {
      if (level !== 'all' && s.level !== level) return false;
      if (school !== 'all' && s.school !== school) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
    }).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  }, [query, level, school]);

  return (
    <div className="space-y-3">
      <TextField
        icon="fa-magnifying-glass"
        value={query}
        onChange={setQuery}
        placeholder="Search spells... (Fireball, Healing Word, Magic Missile)"
      />
      <div className="flex flex-wrap gap-1">
        {LEVEL_FILTERS.map((f) => (
          <Chip key={String(f.key)} color="ember" active={level === f.key} onClick={() => setLevel(f.key)}>
            {f.label}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {schools.map((s) => (
          <Chip key={s} color="arcane" active={school === s} onClick={() => setSchool(s)} className="capitalize">
            {s}
          </Chip>
        ))}
      </div>
      <p className="text-[10px] text-parchment-faint italic">
        {filtered.length} of {SPELLS_CATALOG.length} spells
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[52vh] overflow-y-auto v2-scrollbar pr-1">
        {filtered.slice(0, 200).map((s) => (
          <Card key={s.id} interactive className="p-2" onClick={() => setViewing(s)}>
            <div className="flex items-center gap-2">
              <i className={cx('fas text-[10px]', s.icon || 'fa-hat-wizard', 'text-arcane-400 shrink-0')} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-bold text-parchment truncate">{s.name}</span>
                  <span className="text-[9px] font-mono text-ember-400 shrink-0">{s.level === 0 ? 'Cantrip' : `L${s.level}`}</span>
                </div>
                <span className="text-[10px] text-parchment-faint capitalize">{s.school}</span>
              </div>
            </div>
          </Card>
        ))}
      </div>
      <SpellDetailModalV2 spell={viewing} onClose={() => setViewing(null)} />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Items                                                               */
/* ------------------------------------------------------------------ */

type ItemFilter = 'all' | 'weapon' | 'armor' | 'shield' | 'potion' | 'gear' | 'other';

const ITEM_FILTERS: Array<{ key: ItemFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'weapon', label: 'Weapons' },
  { key: 'armor', label: 'Armor' },
  { key: 'shield', label: 'Shields' },
  { key: 'potion', label: 'Potions' },
  { key: 'gear', label: 'Gear' },
];

const rarityText = (rarity?: string) =>
  rarity === 'uncommon'
    ? 'text-frost-400'
    : rarity === 'rare'
      ? 'text-arcane-300'
      : rarity === 'very rare'
        ? 'text-blood-300'
        : rarity === 'legendary'
          ? 'text-ember-400'
          : 'text-parchment-mute';

const ItemsTabV2: React.FC = () => {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ItemFilter>('all');
  const [viewing, setViewing] = useState<V2ItemDetail | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SRD_ITEMS.filter((item) => {
      if (filter !== 'all' && item.type !== filter) return false;
      if (!q) return true;
      return item.name.toLowerCase().includes(q) || (item.description ?? '').toLowerCase().includes(q);
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [query, filter]);

  return (
    <div className="space-y-3">
      <TextField
        icon="fa-magnifying-glass"
        value={query}
        onChange={setQuery}
        placeholder="Search items... (Longsword, Chain Mail, Potion of Healing)"
      />
      <div className="flex flex-wrap gap-1">
        {ITEM_FILTERS.map((f) => (
          <Chip key={f.key} color="ember" active={filter === f.key} onClick={() => setFilter(f.key)}>
            {f.label}
          </Chip>
        ))}
      </div>
      <p className="text-[10px] text-parchment-faint italic">
        {filtered.length} of {SRD_ITEMS.length} items
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[52vh] overflow-y-auto v2-scrollbar pr-1">
        {filtered.slice(0, 200).map((item, idx) => {
          const detail: V2ItemDetail = {
            name: item.name,
            quantity: 1,
            type: item.type,
            rarity: item.rarity,
            description: item.description,
            weight: item.weight,
            cost: item.cost,
            stats: item.stats,
          };
          return (
            <Card key={`${item.name}-${idx}`} interactive className="p-2" onClick={() => setViewing(detail)}>
              <div className="flex items-center gap-2">
                <i className={cx('fas text-[10px]', item.icon || 'fa-gem', 'text-parchment-faint shrink-0')} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-bold text-parchment truncate">{item.name}</span>
                    <span className={cx('text-[8px] uppercase font-bold shrink-0', rarityText(item.rarity))}>
                      {item.rarity || 'common'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-parchment-faint">
                    <span className="capitalize">{item.type || 'item'}</span>
                    {item.cost && <span>• {item.cost}</span>}
                    {item.stats?.damage && <span className="text-blood-400 font-mono">• {item.stats.damage}</span>}
                    {item.stats?.acFormula && <span className="text-frost-400 font-mono">• {item.stats.acFormula}</span>}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <ItemDetailModalV2 item={viewing} onClose={() => setViewing(null)} />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Sheet                                                               */
/* ------------------------------------------------------------------ */

interface CompendiumSheetProps {
  open: boolean;
  onClose: () => void;
}

/** Read-only SRD reference sheet: Glossary, Conditions, Rules, Spells, Items. */
const CompendiumSheet: React.FC<CompendiumSheetProps> = ({ open, onClose }) => {
  const [tab, setTab] = useState<TabKey>('glossary');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Compendium"
      icon="fa-book-open"
      size="xl"
      footer={
        <p className="text-[10px] leading-relaxed text-parchment-faint">
          Rules content derived from the System Reference Document 5.1 (Wizards of the Coast), licensed under the Creative
          Commons Attribution 4.0 International License.
        </p>
      }
    >
      <Tabs items={TAB_ITEMS} active={tab} onChange={(k) => setTab(k as TabKey)} className="mb-4" />
      {tab === 'glossary' && <GlossaryTabV2 />}
      {tab === 'conditions' && <ConditionsTabV2 />}
      {tab === 'rules' && <RulesTabV2 />}
      {tab === 'spells' && <SpellsTabV2 />}
      {tab === 'items' && <ItemsTabV2 />}
    </Modal>
  );
};

export default CompendiumSheet;
