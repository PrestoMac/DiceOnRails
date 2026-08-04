import React from 'react';
import { cx } from './cx';

/** Circular portrait with graceful initial fallback (portraitUrl may be empty for pre-generation heroes). */
interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  ring?: 'ember' | 'arcane' | 'none';
  className?: string;
  onClick?: () => void;
  title?: string;
}

const SIZES: Record<NonNullable<AvatarProps['size']>, { box: string; text: string }> = {
  xs: { box: 'w-6 h-6', text: 'text-[10px]' },
  sm: { box: 'w-8 h-8', text: 'text-xs' },
  md: { box: 'w-10 h-10', text: 'text-sm' },
  lg: { box: 'w-16 h-16', text: 'text-xl' },
  xl: { box: 'w-24 h-24', text: 'text-3xl' },
};

const RINGS: Record<NonNullable<AvatarProps['ring']>, string> = {
  ember: 'ring-2 ring-ember-500/50',
  arcane: 'ring-2 ring-arcane-500/50',
  none: 'ring-1 ring-white/10',
};

const Avatar: React.FC<AvatarProps> = ({ name, src, size = 'md', ring = 'none', className, onClick, title }) => {
  const s = SIZES[size];
  const content = src ? (
    <img src={src} alt={name} className="w-full h-full object-cover" loading="lazy" />
  ) : (
    <span className={cx('font-display font-bold text-ember-300', s.text)} aria-hidden="true">
      {(name || '?').trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
  const cls = cx(
    'inline-flex items-center justify-center rounded-full overflow-hidden bg-obsidian-800 shrink-0',
    s.box,
    RINGS[ring],
    onClick && 'cursor-pointer hover:brightness-110 transition',
    className,
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} title={title ?? name} aria-label={title ?? name} className={cls}>
        {content}
      </button>
    );
  }
  return (
    <span className={cls} title={title}>
      {content}
    </span>
  );
};

export default Avatar;
