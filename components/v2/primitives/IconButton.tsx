import React from 'react';
import { cx } from './cx';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Font Awesome class string, e.g. 'fa-cog'. */
  icon: string;
  variant?: 'ghost' | 'primary' | 'danger' | 'subtle';
  size?: 'sm' | 'md' | 'lg';
  /** Native title tooltip text. */
  tip?: string;
}

const VARIANTS: Record<NonNullable<IconButtonProps['variant']>, string> = {
  ghost: 'text-parchment-mute hover:text-parchment hover:bg-white/[0.06]',
  primary: 'text-ember-400 hover:text-ember-300 hover:bg-ember-500/10',
  danger: 'text-blood-400 hover:text-blood-300 hover:bg-blood-500/10',
  subtle: 'text-parchment-dim bg-obsidian-800 hover:bg-obsidian-750 border border-white/[0.06]',
};

const SIZES: Record<NonNullable<IconButtonProps['size']>, string> = {
  sm: 'w-7 h-7 text-xs rounded-md',
  md: 'w-9 h-9 text-sm rounded-lg',
  lg: 'w-11 h-11 text-base rounded-lg',
};

/** Compact icon-only control. Always passes an accessible label. */
const IconButton: React.FC<IconButtonProps> = ({
  icon,
  variant = 'ghost',
  size = 'md',
  tip,
  className,
  disabled,
  ...rest
}) => (
  <button
    type="button"
    disabled={disabled}
    title={tip}
    aria-label={tip ?? rest['aria-label']}
    className={cx(
      'inline-flex items-center justify-center transition-colors duration-150 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed select-none',
      VARIANTS[variant],
      SIZES[size],
      className,
    )}
    {...rest}
  >
    <i className={cx('fas', icon)} aria-hidden="true" />
  </button>
);

export default IconButton;
