import React from 'react';
import { cx } from './cx';

/** Friendly empty-state panel: icon in an ember well, title, optional flavor. */
interface EmptyStateProps {
  icon?: string;
  title: string;
  body?: string;
  className?: string;
  compact?: boolean;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon = 'fa-dice-d20', title, body, className, compact = false,
}) => (
  <div className={cx('flex flex-col items-center justify-center text-center', compact ? 'py-8' : 'py-16', className)}>
    <div
      className={cx(
        'flex items-center justify-center rounded-full bg-ember-500/10 border border-ember-500/25 mb-4',
        compact ? 'w-12 h-12' : 'w-20 h-20',
      )}
    >
      <i className={cx('fas text-ember-400', compact ? 'text-lg' : 'text-3xl', icon)} aria-hidden="true" />
    </div>
    <h3 className={cx('font-display font-bold text-parchment tracking-wider', compact ? 'text-base' : 'text-2xl')}>{title}</h3>
    {body && <p className="mt-2 text-sm text-parchment-mute max-w-sm leading-relaxed">{body}</p>}
  </div>
);

export default EmptyState;
