import React from 'react';
import { cx } from './cx';

export interface RailStep {
  key: string;
  label: string;
  icon?: string;
  /** Completed steps show a check and are click-jumpable. */
  done?: boolean;
  /** Step has a blocking validation problem. */
  error?: boolean;
}

interface ProgressRailProps {
  steps: RailStep[];
  currentKey: string;
  onJump?: (key: string) => void;
  /** 'side' = vertical rail (desktop forge), 'top' = compact horizontal (small screens). */
  orientation?: 'side' | 'top';
  className?: string;
}

/** Step navigator with completion checks — the forge's progress spine. */
const ProgressRail: React.FC<ProgressRailProps> = ({ steps, currentKey, onJump, orientation = 'side', className }) => {
  if (orientation === 'top') {
    return (
      <div className={cx('flex items-center gap-1 overflow-x-auto v2-noscroll', className)}>
        {steps.map((step) => {
          const active = step.key === currentKey;
          const clickable = step.done && !active;
          return (
            <button
              key={step.key}
              type="button"
              disabled={!clickable}
              onClick={() => onJump?.(step.key)}
              title={step.label}
              className={cx(
                'flex-1 flex flex-col items-center gap-1 py-1.5 px-1 rounded-md transition-colors min-w-[44px]',
                active ? 'text-ember-300' : step.done ? 'text-verdant-400 cursor-pointer hover:bg-white/[0.04]' : 'text-parchment-faint',
                step.error && 'text-blood-400',
              )}
            >
              <i
                className={cx(
                  'fas text-xs',
                  step.error ? 'fa-circle-exclamation' : step.done && !active ? 'fa-circle-check' : step.icon ?? 'fa-circle',
                )}
                aria-hidden="true"
              />
              <span className="text-[9px] font-display font-semibold uppercase tracking-wider truncate w-full text-center">
                {step.label}
              </span>
              {active && <span className="block w-6 h-0.5 rounded bg-ember-500" />}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <nav className={cx('flex flex-col gap-0.5', className)} aria-label="Progress">
      {steps.map((step) => {
        const active = step.key === currentKey;
        const clickable = step.done && !active;
        return (
          <button
            key={step.key}
            type="button"
            disabled={!clickable}
            onClick={() => onJump?.(step.key)}
            className={cx(
              'flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors w-full',
              active
                ? 'bg-ember-500/10 border border-ember-500/30 text-parchment'
                : step.done
                  ? 'text-parchment-dim hover:bg-white/[0.04] border border-transparent cursor-pointer'
                  : 'text-parchment-faint border border-transparent cursor-default',
              step.error && !active && 'text-blood-400',
            )}
          >
            <span
              className={cx(
                'inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] border shrink-0',
                active
                  ? 'border-ember-500/60 bg-ember-500/15 text-ember-300'
                  : step.done
                    ? 'border-verdant-500/50 bg-verdant-500/10 text-verdant-400'
                    : step.error
                      ? 'border-blood-500/50 text-blood-400'
                      : 'border-white/10 text-parchment-faint',
              )}
            >
              {step.done && !active && !step.error ? (
                <i className="fas fa-check" aria-hidden="true" />
              ) : step.error ? (
                <i className="fas fa-exclamation" aria-hidden="true" />
              ) : (
                <i className={cx('fas', step.icon ?? 'fa-circle')} aria-hidden="true" />
              )}
            </span>
            <span className="font-display text-[11px] font-semibold uppercase tracking-[0.14em] truncate">{step.label}</span>
          </button>
        );
      })}
    </nav>
  );
};

export default ProgressRail;
