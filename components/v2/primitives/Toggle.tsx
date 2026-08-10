import React from 'react';
import { cx } from './cx';

/** On/off switch. */
interface ToggleProps {
  on: boolean;
  onToggle: () => void;
  label?: string;
}

const Toggle: React.FC<ToggleProps> = ({ on, onToggle, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    onClick={onToggle}
    className={cx(
      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 cursor-pointer shrink-0 border',
      on ? 'bg-ember-600 border-ember-500/50' : 'bg-obsidian-800 border-white/10',
    )}
  >
    <span
      className={cx(
        'inline-block h-4 w-4 rounded-full bg-parchment shadow transition-transform duration-200',
        on ? 'translate-x-6' : 'translate-x-1',
      )}
    />
  </button>
);

export default Toggle;
