import React from 'react';
import { cx } from './cx';
import Tooltip from './Tooltip';

/** Compact labeled stat block: value on top, label below, optional signed modifier. */
interface StatBadgeProps {
  label: string;
  value: React.ReactNode;
  mod?: number;
  icon?: string;
  tip?: React.ReactNode;
  color?: 'parchment' | 'ember' | 'arcane' | 'verdant' | 'blood' | 'frost';
  className?: string;
  onClick?: () => void;
}

const COLORS: Record<NonNullable<StatBadgeProps['color']>, string> = {
  parchment: 'text-parchment',
  ember: 'text-ember-300',
  arcane: 'text-arcane-300',
  verdant: 'text-verdant-400',
  blood: 'text-blood-400',
  frost: 'text-frost-400',
};

const StatBadge: React.FC<StatBadgeProps> = ({ label, value, mod, icon, tip, color = 'parchment', className, onClick }) => {
  const inner = (
    <div
      className={cx(
        'flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg bg-obsidian-850/80 border border-white/[0.06] min-w-[64px]',
        onClick && 'cursor-pointer hover:border-ember-500/40 transition-colors',
        className,
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      <span className="flex items-center gap-1 text-[9px] font-display font-semibold uppercase tracking-[0.14em] text-parchment-faint">
        {icon && <i className={cx('fas', icon)} aria-hidden="true" />}
        {label}
      </span>
      <span className={cx('text-lg font-bold font-mono leading-none', COLORS[color])}>{value}</span>
      {mod !== undefined && (
        <span className={cx('text-[10px] font-mono', mod >= 0 ? 'text-verdant-400' : 'text-blood-400')}>
          {mod >= 0 ? `+${mod}` : mod}
        </span>
      )}
    </div>
  );
  return tip ? <Tooltip content={tip}>{inner}</Tooltip> : inner;
};

export default StatBadge;
