import React from 'react';
import { cx } from './cx';

export type ButtonVariant = 'primary' | 'arcane' | 'ghost' | 'danger' | 'subtle';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Font Awesome class string, e.g. 'fa-bolt'. Rendered before the label. */
  icon?: string;
  loading?: boolean;
  block?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-ember-600 hover:bg-ember-500 text-obsidian-950 border border-ember-400/40 shadow-[0_4px_20px_rgba(238,155,46,0.25)] hover:shadow-[0_6px_28px_rgba(238,155,46,0.4)] disabled:bg-obsidian-750 disabled:text-parchment-faint disabled:border-obsidian-700 disabled:shadow-none',
  arcane:
    'bg-arcane-700 hover:bg-arcane-600 text-arcane-200 border border-arcane-500/40 shadow-[0_4px_20px_rgba(139,124,246,0.25)] disabled:bg-obsidian-750 disabled:text-parchment-faint disabled:border-obsidian-700 disabled:shadow-none',
  ghost:
    'bg-transparent hover:bg-white/[0.04] text-parchment-dim hover:text-parchment border border-white/10 hover:border-white/20 disabled:opacity-40 disabled:hover:bg-transparent',
  danger:
    'bg-blood-700 hover:bg-blood-600 text-blood-300 border border-blood-500/40 disabled:bg-obsidian-750 disabled:text-parchment-faint disabled:border-obsidian-700',
  subtle:
    'bg-obsidian-800 hover:bg-obsidian-750 text-parchment-dim hover:text-parchment border border-white/[0.06] disabled:opacity-40',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5 rounded-md',
  md: 'px-4 py-2.5 text-sm gap-2 rounded-lg',
  lg: 'px-6 py-3.5 text-base gap-2.5 rounded-lg',
};

/** The one button of the Emberlight system. Ember = primary action, arcane = AI/magic. */
const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  block = false,
  disabled,
  children,
  className,
  type = 'button',
  ...rest
}) => (
  <button
    type={type}
    disabled={disabled || loading}
    className={cx(
      'inline-flex items-center justify-center font-display font-semibold uppercase tracking-wider transition-all duration-150 cursor-pointer disabled:cursor-not-allowed select-none',
      VARIANTS[variant],
      SIZES[size],
      block && 'w-full',
      className,
    )}
    {...rest}
  >
    {loading ? (
      <i className="fas fa-circle-notch fa-spin" aria-hidden="true" />
    ) : (
      icon && <i className={cx('fas', icon)} aria-hidden="true" />
    )}
    {children}
  </button>
);

export default Button;
