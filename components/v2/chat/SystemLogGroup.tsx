import React, { useState } from 'react';
import type { Message } from '../../../types';
import { cx } from '../primitives/cx';
import { formatMessageText } from './format';

interface SystemLogGroupProps {
  messages: Message[];
}

/** Collapsible group replacing a run of consecutive TOOL messages. Defaults collapsed. */
const SystemLogGroup: React.FC<SystemLogGroupProps> = ({ messages }) => {
  const [open, setOpen] = useState(false);
  if (messages.length === 0) return null;
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
