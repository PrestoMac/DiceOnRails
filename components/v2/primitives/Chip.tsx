import React from 'react';
import { cx } from './cx';

/** Small rounded tag/pill. Used for filters, status labels, and metadata. */
interface ChipProps {
  children: React.ReactNode;
  icon?: string;
  color?: 'ember' | 'arcane' | 'verdant' | 'blood' | 'frost' | 'neutral';
  active?: boolean;
  onClick?: () => void;
  className?: string;
  title?: string;
}

const COLORS: Record<NonNullable<ChipProps['color']>, string> = {
  ember: 'bg-ember-500/10 text-ember-400 border-ember-500/30',
  arcane: 'bg-arcane-500/10 text-arcane-300 border-arcane-500/30',
  verdant: 'bg-verdant-500/10 text-verdant-400 border-verdant-500/30',
  blood: 'bg-blood-500/10 text-blood-400 border-blood-500/30',
  frost: 'bg-frost-500/10 text-frost-400 border-frost-500/30',
  neutral: 'bg-white/[0.04] text-parchment-dim border-white/10',
};

const ACTIVE: Record<NonNullable<ChipProps['color']>, string> = {
  ember: 'bg-ember-500/25 text-ember-300 border-ember-400/60',
  arcane: 'bg-arcane-500/25 text-arcane-200 border-arcane-400/60',
  verdant: 'bg-verdant-500/25 text-verdant-300 border-verdant-400/60',
  blood: 'bg-blood-500/25 text-blood-300 border-blood-400/60',
  frost: 'bg-frost-500/25 text-frost-300 border-frost-400/60',
  neutral: 'bg-white/[0.12] text-parchment border-white/25',
};

const Chip: React.FC<ChipProps> = ({ children, icon, color = 'neutral', active = false, onClick, className, title }) => {
  const base = cx(
    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold tracking-wide whitespace-nowrap select-none',
    active ? ACTIVE[color] : COLORS[color],
    onClick && 'cursor-pointer transition-colors hover:brightness-125',
    className,
  );
  const inner = (
    <>
      {icon && <i className={cx('fas', icon, 'text-[10px]')} aria-hidden="true" />}
      {children}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={base} title={title}>
        {inner}
      </button>
    );
  }
  return (
    <span className={base} title={title}>
      {inner}
    </span>
  );
};

export default Chip;
