import React from 'react';
import { CombatState, Character } from '../types';
import HpBar from './shared/HpBar';

interface CombatInitiativeRowProps {
  entry: CombatState['initiative'][0];
  isCurrent: boolean;
  isDead: boolean;
  isExpanded: boolean;
  enemyMap: Map<string, CombatState['enemies'][0]>;
  party: Character[];
  hp: { current: number; max: number } | null;
  isMobile?: boolean;
  onToggle: () => void;
}

const DetailRow: React.FC<{ label: string; gap?: string; valueClassName?: string; children: React.ReactNode }> = ({ label, gap = 'gap-1.5', valueClassName = 'text-stone-300 font-mono', children }) => (
  <div className={`flex items-center ${gap}`}>
    <span className="text-stone-500 uppercase font-bold tracking-wider">{label}</span>
    <span className={valueClassName}>{children}</span>
  </div>
);

const ConditionsList: React.FC<{ conditions: string[] | undefined; className?: string }> = ({ conditions, className }) =>
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

const modifierText = (m: number | null | undefined) =>
  m != null && m !== 0 ? `${m > 0 ? '+' : ''}${m}` : '';

const CombatInitiativeRow: React.FC<CombatInitiativeRowProps> = ({ entry, isCurrent, isDead, isExpanded, enemyMap, party, hp, isMobile, onToggle }) => {
  const icon = entry.type === 'player' ? '👤' : '👾';
  const enemy = entry.type === 'enemy' ? enemyMap.get(entry.id) : null;
  const ac = enemy?.ac;
  const conditions = entry.type === 'player'
    ? party.find(c => c.id === entry.id)?.conditions?.map(c => c.id)
    : enemyMap.get(entry.id)?.conditions?.map(c => c.id);

  if (isMobile) {
    return (
      <div key={entry.id}>
        <div onClick={onToggle} className={`flex items-center gap-2 px-2 py-1 rounded text-[10px] cursor-pointer select-none ${isCurrent ? 'bg-amber-900/20 border-l-2 border-amber-500' : 'border-l-2 border-transparent hover:bg-stone-800/30'} ${isDead ? 'opacity-40' : ''}`}>
          <span className="text-xs">{icon}</span>
          <span className={`flex-1 truncate font-medium ${isCurrent ? 'text-amber-300' : 'text-stone-400'}`}>{entry.name}{isDead ? ' 💀' : ''}</span>
          <span className="font-mono text-[9px] text-stone-500 w-6 text-right">{entry.initiative}</span>
          {hp && !isDead && <HpBar current={hp.current} max={hp.max} width="w-12" height="h-1.5" />}
          <i className={`fas fa-chevron-${isExpanded ? 'down' : 'right'} text-[8px] text-stone-600 transition-transform`}></i>
        </div>
        {isExpanded && (
          <div className="ml-5 px-2 py-1.5 text-[9px] space-y-1 border-l border-stone-800">
            {entry.rawRoll != null && <DetailRow label="Roll">{entry.rawRoll}{modifierText(entry.modifier)} = {entry.initiative}</DetailRow>}
            {ac != null && <DetailRow label="AC">{ac}</DetailRow>}
            <ConditionsList conditions={conditions} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div key={entry.id}>
      <div onClick={onToggle} className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer select-none ${isCurrent ? 'bg-amber-900/20 border-l-2 border-amber-500' : 'border-l-2 border-transparent hover:bg-stone-800/30'} ${isDead ? 'opacity-40' : ''} ${entry.hasActedThisTurn ? 'opacity-70' : ''}`}>
        <span>{icon}</span>
        <span className={`flex-1 truncate ${isCurrent ? 'text-amber-200 font-bold' : 'text-stone-400'}`}>{entry.name}{isDead ? ' 💀' : ''}{isCurrent && !isDead ? ' ◀' : ''}</span>
        <span className="font-mono text-[10px] text-stone-500 w-7 text-right">{entry.initiative}</span>
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
          {ac != null && <DetailRow label="AC" gap="gap-2" valueClassName="text-stone-200 font-mono font-bold">{ac}</DetailRow>}
          <ConditionsList conditions={conditions} className="border border-red-800/40" />
        </div>
      )}
    </div>
  );
};

export default CombatInitiativeRow;
