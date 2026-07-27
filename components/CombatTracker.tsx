import React, { useState } from 'react';
import { CombatState, Character } from '../types';
import HpBar from './shared/HpBar';
import Tooltip from './ui/Tooltip';

interface CombatTrackerProps {
  combat: CombatState;
  party: Character[];
  isMobile?: boolean;
  isHost?: boolean;
  hasBattleMap?: boolean;
  onToggleBattleMap?: () => void;
}

const modifierText = (m: number | null | undefined) =>
  m != null && m !== 0 ? `${m > 0 ? '+' : ''}${m}` : '';

const DetailRow: React.FC<{
  label: string;
  gap?: string;
  valueClassName?: string;
  children: React.ReactNode;
}> = ({ label, gap = 'gap-1.5', valueClassName = 'text-stone-300 font-mono', children }) => (
  <div className={`flex items-center ${gap}`}>
    <span className="text-stone-500 uppercase font-bold tracking-wider">{label}</span>
    <span className={valueClassName}>{children}</span>
  </div>
);

const ConditionsList: React.FC<{
  conditions: string[] | undefined;
  className?: string;
}> = ({ conditions, className }) =>
  conditions && conditions.length > 0 ? (
    <div className="flex flex-wrap gap-1">
      {conditions.map(c => (
        <span key={c} className={`px-1.5 py-0.5 rounded bg-red-900/30 text-red-400 font-medium${className ? ` ${className}` : ''}`}>
          {c}
        </span>
      ))}
    </div>
  ) : (
    <span className="text-stone-600 italic">No active conditions</span>
  );

/** Combat initiative tracker panel showing turn order, HP bars, and expandable combatant details. */
const CombatTracker: React.FC<CombatTrackerProps> = ({ combat, party, isMobile, isHost, hasBattleMap, onToggleBattleMap }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => setExpandedId(prev => prev === id ? null : id);

  if (!combat?.isActive) return null;

  const enemyMap = new Map(combat.enemies.map(e => [e.id, e] as const));

  const getEnemyHp = (id: string) => {
    const e = enemyMap.get(id);
    return e ? { current: e.hp.current, max: e.hp.max } : null;
  };

  const getCharacterHp = (id: string) => {
    const c = party.find(p => p.id === id);
    return c ? { current: c.hp.current, max: c.hp.max } : null;
  };

  if (isMobile) {
    return (
      <div className="bg-stone-900/95 border-b border-stone-800 backdrop-blur-md">
        <div className="w-full px-3 py-2 flex items-center justify-between text-stone-300">
          <button onClick={() => setCollapsed(!collapsed)} className="flex items-center gap-2 flex-1">
            <span className="text-amber-500 text-xs">⚔️</span>
            <span className="text-xs font-bold uppercase tracking-wider">Round {combat.round}</span>
            <span className="text-[10px] text-stone-500 font-mono">
              {combat.initiative[combat.turnIndex]?.name || '—'}
            </span>
          </button>
          <div className="flex items-center gap-2">
            {isHost && onToggleBattleMap && (
              <button
                onClick={onToggleBattleMap}
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                  hasBattleMap ? 'bg-amber-900/40 border-amber-700 text-amber-300' : 'bg-stone-800 border-stone-700 text-stone-400 hover:text-stone-200'
                }`}
                title={hasBattleMap ? 'Toggle Battle Map' : 'Launch Battle Map'}
              >
                🗺 {hasBattleMap ? 'Map' : '+ Map'}
              </button>
            )}
            <button onClick={() => setCollapsed(!collapsed)} className="p-1">
              <i className={`fas fa-chevron-${collapsed ? 'down' : 'up'} text-xs text-stone-600 transition-transform`}></i>
            </button>
          </div>
        </div>
        {!collapsed && (
          <div className="px-2 pb-2 space-y-0.5">
            {combat.initiative.map((entry, i) => {
              const isCurrent = i === combat.turnIndex;
              const hp = entry.type === 'player' ? getCharacterHp(entry.id) : getEnemyHp(entry.id);
              const isDead = entry.isDead || (hp && hp.current <= 0);
              const icon = entry.type === 'player' ? '👤' : '👾';
              const isExpanded = expandedId === entry.id;
              const enemy = entry.type === 'enemy' ? enemyMap.get(entry.id) : null;
              const ac = enemy?.ac;
              const conditions = entry.type === 'player'
                ? party.find(c => c.id === entry.id)?.conditions?.map(c => c.id)
                : enemyMap.get(entry.id)?.conditions?.map(c => c.id);

              return (
                <div key={entry.id}>
                  <div
                    onClick={() => toggleExpand(entry.id)}
                    className={`flex items-center gap-2 px-2 py-1 rounded text-[10px] cursor-pointer select-none ${
                      isCurrent ? 'bg-amber-900/20 border-l-2 border-amber-500' : 'border-l-2 border-transparent hover:bg-stone-800/30'
                    } ${isDead ? 'opacity-40' : ''}`}
                  >
                    <span className="text-xs">{icon}</span>
                    <span className={`flex-1 truncate font-medium ${isCurrent ? 'text-amber-300' : 'text-stone-400'}`}>
                      {entry.name}{isDead ? ' 💀' : ''}
                    </span>
                    <span className="font-mono text-[9px] text-stone-500 w-6 text-right">{entry.initiative}</span>
                    {hp && !isDead && <HpBar current={hp.current} max={hp.max} width="w-12" height="h-1.5" />}
                    <i className={`fas fa-chevron-${isExpanded ? 'down' : 'right'} text-[8px] text-stone-600 transition-transform`}></i>
                  </div>
                  {isExpanded && (
                    <div className="ml-5 px-2 py-1.5 text-[9px] space-y-1 border-l border-stone-800">
                      {entry.rawRoll != null && (
                        <DetailRow label="Roll">
                          {entry.rawRoll}{modifierText(entry.modifier)} = {entry.initiative}
                        </DetailRow>
                      )}
                      {ac != null && <DetailRow label="AC">{ac}</DetailRow>}
                      <ConditionsList conditions={conditions} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`transition-all duration-300 w-full`}>
      <div className="bg-stone-900/90 backdrop-blur-md border border-stone-800 rounded-lg shadow-2xl overflow-hidden">
        <div className="w-full px-3 py-2 flex items-center justify-between bg-stone-950/50">
          <button onClick={() => setCollapsed(!collapsed)} className="flex items-center gap-2 flex-1 hover:opacity-80 transition-opacity">
            <span className="text-amber-500 text-sm">⚔️</span>
            {!collapsed && (
              <>
                <Tooltip content="The current combat round. Each combatant takes one turn per round in initiative order." side="bottom">
                  <span className="text-xs font-bold uppercase tracking-wider text-stone-200">Round {combat.round}</span>
                </Tooltip>
                <span className="text-[10px] font-mono text-stone-400 ml-1">
                  {combat.initiative[combat.turnIndex]?.name || '—'}
                </span>
              </>
            )}
          </button>
          <div className="flex items-center gap-2">
            {isHost && onToggleBattleMap && (
              <button
                onClick={onToggleBattleMap}
                className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider border transition-colors ${
                  hasBattleMap ? 'bg-amber-900/40 border-amber-700 text-amber-300' : 'bg-stone-800 border-stone-700 text-stone-400 hover:text-stone-200 hover:border-amber-600/50'
                }`}
                title={hasBattleMap ? 'Toggle Battle Map view' : 'Launch VTT Battle Map'}
              >
                🗺 {hasBattleMap ? 'Battle Map' : '+ Launch Map'}
              </button>
            )}
            <button onClick={() => setCollapsed(!collapsed)} className="p-1">
              <i className={`fas fa-chevron-${collapsed ? 'down' : 'up'} text-xs text-stone-500 transition-transform`}></i>
            </button>
          </div>
        </div>
        {!collapsed && (
          <div className="px-2 pb-2 space-y-0.5 max-h-80 overflow-y-auto custom-scrollbar">
            {combat.initiative.map((entry, i) => {
              const isCurrent = i === combat.turnIndex;
              const hp = entry.type === 'player' ? getCharacterHp(entry.id) : getEnemyHp(entry.id);
              const isDead = entry.isDead || (hp && hp.current <= 0);
              const icon = entry.type === 'player' ? '👤' : '👾';
              const isExpanded = expandedId === entry.id;
              const enemy = entry.type === 'enemy' ? enemyMap.get(entry.id) : null;
              const ac = enemy?.ac;
              const conditions = entry.type === 'player'
                ? party.find(c => c.id === entry.id)?.conditions?.map(c => c.id)
                : enemyMap.get(entry.id)?.conditions?.map(c => c.id);

              return (
                <div key={entry.id}>
                  <div
                    onClick={() => toggleExpand(entry.id)}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer select-none ${
                      isCurrent ? 'bg-amber-900/20 border-l-2 border-amber-500' : 'border-l-2 border-transparent hover:bg-stone-800/30'
                    } ${isDead ? 'opacity-40' : ''} ${entry.hasActedThisTurn ? 'opacity-70' : ''}`}
                  >
                    <span>{icon}</span>
                    <span className={`flex-1 truncate ${isCurrent ? 'text-amber-200 font-bold' : 'text-stone-400'}`}>
                      {entry.name}{isDead ? ' 💀' : ''}{isCurrent && !isDead ? ' ◀' : ''}
                    </span>
                    <Tooltip content="Initiative = d20 + DEX modifier, rolled at the start of combat. Higher goes first; ties broken by DEX score, then rolled-off." side="left">
                      <span className="font-mono text-[10px] text-stone-500 w-7 text-right">{entry.initiative}</span>
                    </Tooltip>
                    {hp && !isDead && <HpBar current={hp.current} max={hp.max} />}
                    {hp && !isDead && <span className="text-[9px] font-mono text-stone-500 w-10 text-right">{hp.current}/{hp.max}</span>}
                    <i className={`fas fa-chevron-${isExpanded ? 'down' : 'right'} text-[8px] text-stone-600 transition-transform`}></i>
                  </div>
                  {isExpanded && (
                    <div className="ml-5 px-2 py-1.5 text-[10px] space-y-1.5 border-l border-stone-800">
                      {entry.rawRoll != null && (
                        <DetailRow label="Roll" gap="gap-2" valueClassName="text-stone-200 font-mono font-bold">
                          {entry.rawRoll}{modifierText(entry.modifier)} = {entry.initiative}
                        </DetailRow>
                      )}
                      {ac != null && (
                        <DetailRow label="AC" gap="gap-2" valueClassName="text-stone-200 font-mono font-bold">{ac}</DetailRow>
                      )}
                      <ConditionsList conditions={conditions} className="border border-red-800/40" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default CombatTracker;
