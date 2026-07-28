import React from 'react';
import type { TypingUser } from '../../hooks/usePresence';

interface TypingIndicatorProps {
  users: TypingUser[];
}

/** Compact row of "NAME is writing…" chips shown above the chat input in
 *  multiplayer. Each chip leads with the typing character's portrait (or first
 *  initial when no portrait) and three bouncing dots. Hidden entirely when
 *  empty (the layouts handle that gate, but we also render null defensively). */
const TypingIndicator: React.FC<TypingIndicatorProps> = ({ users }) => {
  if (users.length === 0) return null;
  return (
    <div className="px-4 py-1.5 bg-stone-950/80 border-t border-stone-800/60 flex flex-wrap items-center gap-2">
      {users.map((u) => {
        const initial = (u.name || '?').charAt(0).toUpperCase();
        const label = users.length === 1
          ? `${u.name} is writing`
          : `${u.name} and ${users.length - 1} other${users.length - 1 === 1 ? '' : 's'} writing`;
        return (
          <div
            key={u.userId}
            className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-stone-900/80 border border-amber-800/30 text-[11px] text-stone-400 max-w-full"
            title={`${u.name} is typing…`}
          >
            <div className="w-5 h-5 rounded-full overflow-hidden border border-amber-700/40 bg-stone-800 flex items-center justify-center shrink-0">
              {u.portraitUrl ? (
                <img src={u.portraitUrl} alt={u.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-[9px] font-bold text-amber-600/80">{initial}</span>
              )}
            </div>
            <span className="italic truncate max-w-[180px]">{label}</span>
            <span className="inline-flex items-center gap-0.5 ml-1">
              <span className="w-1 h-1 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
              <span className="w-1 h-1 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
              <span className="w-1 h-1 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default TypingIndicator;
