import React from 'react';
import Avatar from '../primitives/Avatar';

interface TypingStripProps {
  users: Array<{ userId: string; name: string; portraitUrl?: string }>;
}

const BouncingDots: React.FC = () => (
  <span className="inline-flex items-center gap-0.5 ml-1">
    <span className="w-1 h-1 bg-ember-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
    <span className="w-1 h-1 bg-ember-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
    <span className="w-1 h-1 bg-ember-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
  </span>
);

/** "NAME is writing…" chip shown above the composer in multiplayer. Hidden when empty. */
const TypingStrip: React.FC<TypingStripProps> = ({ users }) => {
  if (users.length === 0) return null;
  const first = users[0];
  if (!first) return null;
  const label =
    users.length === 1
      ? `${first.name} is writing…`
      : `${first.name} and ${users.length - 1} other${users.length - 1 === 1 ? '' : 's'} are writing…`;
  return (
    <div className="px-4 py-1.5 bg-obsidian-950/80 border-t border-white/[0.05] flex flex-wrap items-center gap-2">
      <div
        className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-obsidian-900/80 border border-ember-500/20 text-[11px] text-parchment-dim max-w-full"
        title={label}
      >
        <Avatar name={first.name} src={first.portraitUrl ?? null} size="xs" ring="none" />
        <span className="italic truncate max-w-[220px]">{label}</span>
        <BouncingDots />
      </div>
    </div>
  );
};

export default TypingStrip;
