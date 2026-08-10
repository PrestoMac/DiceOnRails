import React from 'react';
import { cx } from './cx';

/** Circular portrait with graceful initial fallback (portraitUrl may be empty for pre-generation heroes). */
interface AvatarProps {
  name: string;
  src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  ring?: 'ember' | 'none';
  className?: string;
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
  none: 'ring-1 ring-white/10',
};

const Avatar: React.FC<AvatarProps> = ({ name, src, size = 'md', ring = 'none', className }) => {
  const s = SIZES[size];
  const content = src ? (
    <img src={src} alt={name} className="w-full h-full object-cover" loading="lazy" />
  ) : (
    <span className={cx('font-display font-bold text-ember-300', s.text)} aria-hidden="true">
      {(name || '?').trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
  return (
    <span className={cx('inline-flex items-center justify-center rounded-full overflow-hidden bg-obsidian-800 shrink-0', s.box, RINGS[ring], className)} title={name}>
      {content}
    </span>
  );
};

export default Avatar;
