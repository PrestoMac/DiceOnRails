import React from 'react';
import { cx } from './cx';

/** Standard content panel of the Emberlight system. */
interface CardProps {
  children: React.ReactNode;
  className?: string;
  /** Adds hoverable interaction styling + cursor. */
  interactive?: boolean;
  onClick?: () => void;
  /** Accent left border. */
  accent?: 'ember' | 'arcane' | 'verdant' | 'blood' | 'frost' | 'none';
  title?: string;
}

const ACCENTS: Record<NonNullable<CardProps['accent']>, string> = {
  ember: 'border-l-2 border-l-ember-500/70',
  arcane: 'border-l-2 border-l-arcane-500/70',
  verdant: 'border-l-2 border-l-verdant-500/70',
  blood: 'border-l-2 border-l-blood-500/70',
  frost: 'border-l-2 border-l-frost-500/70',
  none: '',
};

const Card: React.FC<CardProps> = ({ children, className, interactive = false, onClick, accent = 'none', title }) => {
  const cls = cx(
    'bg-obsidian-900/70 border border-white/[0.06] rounded-xl p-4',
    ACCENTS[accent],
    interactive && 'cursor-pointer transition-all hover:bg-obsidian-850 hover:border-white/[0.12] hover:-translate-y-px',
    className,
  );
  if (onClick || interactive) {
    return (
      <div role="button" tabIndex={0} onClick={onClick} title={title}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }}
        className={cls}>
        {children}
      </div>
    );
  }
  return <div className={cls} title={title}>{children}</div>;
};

export default Card;

/** Section heading with ember tick. */
export const SectionHeader: React.FC<{ children: React.ReactNode; icon?: string; right?: React.ReactNode; className?: string }> = ({
  children, icon, right, className,
}) => (
  <div className={cx('flex items-center justify-between gap-2 mb-2.5', className)}>
    <h3 className="flex items-center gap-2 font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-ember-400/90">
      {icon && <i className={cx('fas', icon, 'text-[10px]')} aria-hidden="true" />}
      {children}
    </h3>
    {right}
  </div>
);
