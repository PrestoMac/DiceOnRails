import React, { useState } from 'react';
import type { Message, RollData } from '../../../types';
import { cx } from '../primitives/cx';
import { formatMessageText } from './format';
import RollCardV2 from './RollCardV2';

interface SystemLogGroupProps {
  messages: Message[];
  /** When provided, roll cards become clickable (replays the roll in the dice modal). */
  onRollClick?: (roll: RollData) => void;
}

/** Collects all structured rollData from a group of TOOL messages into a flat list. */
function collectRolls(messages: Message[]): RollData[] {
  const rolls: RollData[] = [];
  for (const m of messages) {
    if (!m.rollData) continue;
    if (Array.isArray(m.rollData)) rolls.push(...m.rollData);
    else rolls.push(m.rollData);
  }
  return rolls;
}

/**
 * Collapsible group replacing a run of consecutive TOOL messages. Dice roll
 * cards are always visible (above the fold); the mechanical text details default
 * to collapsed underneath.
 */
const SystemLogGroup: React.FC<SystemLogGroupProps> = ({ messages, onRollClick }) => {
  const [open, setOpen] = useState(false);
  if (messages.length === 0) return null;

  const rolls = collectRolls(messages);

  return (
    <div className="rounded-lg border border-white/[0.06] bg-obsidian-950/60 overflow-hidden animate-fade-in">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.03] transition-colors cursor-pointer"
        aria-expanded={open}
      >
        <i className="fas fa-terminal text-verdant-600 text-xs" aria-hidden="true" />
        <span className="flex-1 font-display text-[10px] uppercase tracking-[0.18em] text-parchment-mute font-semibold">
          System Log · {messages.length} {messages.length === 1 ? 'entry' : 'entries'}
        </span>
        <i
          className={cx('fas text-[10px] text-parchment-faint transition-transform', open ? 'fa-chevron-up' : 'fa-chevron-down')}
          aria-hidden="true"
        />
      </button>

      {rolls.length > 0 && (
        <div className={cx('px-3 py-2 flex flex-col gap-2', !open && 'border-t border-white/[0.05]')}>
          {rolls.map((rd, i) => (
            <RollCardV2 key={i} roll={rd} onClick={onRollClick ? () => onRollClick(rd) : undefined} />
          ))}
        </div>
      )}

      {open && (
        <div className="border-t border-white/[0.05] max-h-64 overflow-y-auto v2-scrollbar px-3 py-2 space-y-1.5">
          {messages.map((m) => (
            <div key={m.id} className="font-mono text-xs text-parchment-mute leading-relaxed whitespace-pre-wrap">
              {formatMessageText(m.text, m.role)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SystemLogGroup;
