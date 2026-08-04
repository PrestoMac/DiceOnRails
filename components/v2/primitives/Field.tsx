import React from 'react';
import { cx } from './cx';

/** Labeled text input for V2 forms. */
interface FieldProps {
  label?: string;
  hint?: string;
  icon?: string;
  error?: string;
  className?: string;
  inputClassName?: string;
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  type?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}

export const TextField: React.FC<FieldProps> = ({
  label, hint, icon, error, className, inputClassName, value, onChange, onEnter, placeholder, type = 'text', autoFocus, disabled,
}) => (
  <label className={cx('block', className)}>
    {label && (
      <span className="block mb-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.15em] text-parchment-mute">
        {label}
      </span>
    )}
    <span className="relative block">
      {icon && (
        <i
          className={cx('fas', icon, 'absolute left-3 top-1/2 -translate-y-1/2 text-parchment-faint text-xs pointer-events-none')}
          aria-hidden="true"
        />
      )}
      <input
        type={type}
        value={value}
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter?.();
        }}
        className={cx(
          'w-full bg-obsidian-950/80 border rounded-lg px-3 py-2.5 text-sm text-parchment placeholder:text-parchment-faint outline-none transition-colors disabled:opacity-50',
          icon ? 'pl-9' : '',
          error ? 'border-blood-500/60 focus:border-blood-400' : 'border-white/10 focus:border-ember-500/60',
          inputClassName,
        )}
      />
    </span>
    {error ? (
      <span className="block mt-1 text-xs text-blood-400">{error}</span>
    ) : hint ? (
      <span className="block mt-1 text-xs text-parchment-faint">{hint}</span>
    ) : null}
  </label>
);

/** Labeled textarea for V2 forms. */
interface TextAreaProps {
  label?: string;
  hint?: string;
  className?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  showCount?: boolean;
}

export const TextArea: React.FC<TextAreaProps> = ({
  label, hint, className, value, onChange, placeholder, rows = 3, maxLength, showCount = false,
}) => (
  <label className={cx('block', className)}>
    {label && (
      <span className="flex items-baseline justify-between mb-1.5">
        <span className="font-display text-[11px] font-semibold uppercase tracking-[0.15em] text-parchment-mute">{label}</span>
        {showCount && maxLength ? (
          <span className="text-[10px] text-parchment-faint font-mono">
            {value.length}/{maxLength}
          </span>
        ) : null}
      </span>
    )}
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      maxLength={maxLength}
      className="w-full bg-obsidian-950/80 border border-white/10 focus:border-ember-500/60 rounded-lg px-3 py-2.5 text-sm text-parchment placeholder:text-parchment-faint outline-none transition-colors resize-y v2-scrollbar"
    />
    {hint && <span className="block mt-1 text-xs text-parchment-faint">{hint}</span>}
  </label>
);
