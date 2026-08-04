import React, { useState } from 'react';
import { Character, CombatState } from '../../../types';
import { cx } from '../primitives/cx';
import HpBar from '../primitives/HpBar';
import Chip from '../primitives/Chip';
import Button from '../primitives/Button';
import IconButton from '../primitives/IconButton';

interface CombatBannerProps {
  combat: CombatState;
  party: Character[];
  isHost: boolean;
  hasBattleMap: boolean;
  onToggleBattleMap: () => void;
}

const modifierText = (m: number | null | undefined) =>
  m != null && m !== 0 ? `${m > 0 ? '+' : ''}${m}` : '';

/** Collapsible combat banner: round header + scrollable initiative list with expandable combatant details. */
const CombatBanner: React.FC<CombatBannerProps> = ({ combat, party, isHost, hasBattleMap, onToggleBattleMap }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!combat?.isActive) return null;

  const enemyMap = new Map(combat.enemies.map((e) => [e.id, e] as const));
  const current = combat.initiative[combat.turnIndex];

  const hpOf = (id: string, type: 'player' | 'enemy') => {
    if (type === 'enemy') {
      const e = enemyMap.get(id);
      return e ? { current: e.hp.current, max: e.hp.max } : null;
    }
    const c = party.find((p) => p.id === id);
    return c ? { current: c.hp.current, max: c.hp.max } : null;
  };

  return (
    <div
      data-tour="combat-tracker"
      className="shrink-0 bg-obsidian-900/85 border-b border-blood-500/25 backdrop-blur-md"
    >
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer hover:opacity-85 transition-opacity"
        >
          <i className="fas fa-khanda text-ember-400 text-xs" aria-hidden="true" />
          <span className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-parchment">
            Round {combat.round}
          </span>
          {!collapsed && current && (
            <span className="text-[10px] font-mono text-parchment-mute truncate">
              <i className="fas fa-play text-ember-500 text-[8px] mr-1" aria-hidden="true" />
              {current.name}
            </span>
          )}
        </button>
        {isHost && (
          <Button
            size="sm"
            variant={hasBattleMap ? 'subtle' : 'ghost'}
            icon="fa-map"
            onClick={onToggleBattleMap}
            title={hasBattleMap ? 'Toggle Battle Map view' : 'Launch VTT Battle Map'}
          >
            {hasBattleMap ? 'Map' : '+ Map'}
          </Button>
        )}
        <IconButton
          icon={collapsed ? 'fa-chevron-down' : 'fa-chevron-up'}
          tip={collapsed ? 'Expand tracker' : 'Collapse tracker'}
          size="sm"
          onClick={() => setCollapsed((v) => !v)}
        />
      </div>

      {!collapsed && (
        <div className="px-2 pb-2 space-y-0.5 max-h-64 overflow-y-auto v2-scrollbar">
          {combat.initiative.map((entry, i) => {
            const isCurrent = i === combat.turnIndex;
            const hp = hpOf(entry.id, entry.type);
            const isDead = entry.isDead || (!!hp && hp.current <= 0);
            const isExpanded = expandedId === entry.id;
            const enemy = entry.type === 'enemy' ? enemyMap.get(entry.id) : undefined;
            const ac = enemy?.ac;
            const conditions =
              entry.type === 'player'
                ? party.find((c) => c.id === entry.id)?.conditions?.map((c) => c.id)
                : enemy?.conditions?.map((c) => c.id);

            return (
              <div key={entry.id}>
                <button
                  type="button"
                  onClick={() => setExpandedId((prev) => (prev === entry.id ? null : entry.id))}
                  className={cx(
                    'w-full flex items-center gap-2 px-2 py-1.5 rounded text-left cursor-pointer select-none border-l-2 transition-colors',
                    isCurrent
                      ? 'bg-ember-500/10 border-l-ember-500'
                      : 'border-l-transparent hover:bg-white/[0.04]',
                    isDead && 'opacity-40',
                    !isDead && entry.hasActedThisTurn && 'opacity-70',
                  )}
                >
                  <i
                    className={cx(
                      'fas text-xs shrink-0',
                      isCurrent ? 'fa-play text-ember-400' : entry.type === 'player' ? 'fa-user text-frost-400' : 'fa-skull text-blood-400',
                    )}
                    aria-hidden="true"
                  />
                  <span
                    className={cx(
                      'flex-1 truncate text-xs',
                      isCurrent ? 'text-ember-200 font-bold' : 'text-parchment-dim',
                    )}
                  >
                    {entry.name}
                    {isDead && <i className="fas fa-skull text-parchment-faint text-[9px] ml-1.5" aria-hidden="true" />}
                  </span>
                  <span className="font-mono text-[10px] text-parchment-faint w-7 text-right">{entry.initiative}</span>
                  {hp && !isDead && (
                    <>
                      <HpBar current={hp.current} max={hp.max} height="sm" className="w-20" />
                      <span className="text-[9px] font-mono text-parchment-faint w-10 text-right whitespace-nowrap">
                        {hp.current}/{hp.max}
                      </span>
                    </>
                  )}
                  <i
                    className={cx('fas text-[8px] text-parchment-faint', isExpanded ? 'fa-chevron-down' : 'fa-chevron-right')}
                    aria-hidden="true"
                  />
                </button>
                {isExpanded && (
                  <div className="ml-6 px-2 py-1.5 space-y-1.5 border-l border-white/[0.08] text-[10px]">
                    {entry.rawRoll != null && (
                      <div className="flex items-center gap-2">
                        <span className="text-parchment-faint uppercase font-bold tracking-wider">Roll</span>
                        <span className="text-parchment font-mono font-bold">
                          {entry.rawRoll}
                          {modifierText(entry.modifier)} = {entry.initiative}
                        </span>
                      </div>
                    )}
                    {ac != null && (
                      <div className="flex items-center gap-2">
                        <span className="text-parchment-faint uppercase font-bold tracking-wider">AC</span>
                        <span className="text-parchment font-mono font-bold">{ac}</span>
                      </div>
                    )}
                    {conditions && conditions.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {conditions.map((c) => (
                          <Chip key={c} color="blood">
                            {c}
                          </Chip>
                        ))}
                      </div>
                    ) : (
                      <span className="text-parchment-faint italic">No active conditions</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CombatBanner;
