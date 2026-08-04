import React from 'react';
import { cx } from './cx';

/** Segmented tab row for switching sections inside a panel. */
export interface TabItem {
  key: string;
  label: string;
  icon?: string;
  badge?: number | string;
}

interface TabsProps {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
  /** Compact variant for tight spaces. */
  small?: boolean;
}

const Tabs: React.FC<TabsProps> = ({ items, active, onChange, className, small = false }) => (
  <div
    role="tablist"
    className={cx(
      'flex items-center gap-1 p-1 rounded-lg bg-obsidian-900/80 border border-white/[0.06] overflow-x-auto v2-noscroll',
      className,
    )}
  >
    {items.map((item) => {
      const isActive = item.key === active;
      return (
        <button
          key={item.key}
          role="tab"
          aria-selected={isActive}
          type="button"
          onClick={() => onChange(item.key)}
          className={cx(
            'flex-1 inline-flex items-center justify-center gap-1.5 rounded-md font-display font-semibold uppercase tracking-wider whitespace-nowrap transition-colors cursor-pointer',
            small ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-[11px]',
            isActive
              ? 'bg-ember-500/15 text-ember-300 border border-ember-500/40'
              : 'text-parchment-mute hover:text-parchment-dim border border-transparent',
          )}
        >
          {item.icon && <i className={cx('fas', item.icon, small ? 'text-[9px]' : 'text-[10px]')} aria-hidden="true" />}
          {item.label}
          {item.badge !== undefined && item.badge !== 0 && item.badge !== '' && (
            <span className="ml-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-ember-500 text-obsidian-950 text-[9px] font-bold">
              {item.badge}
            </span>
          )}
        </button>
      );
    })}
  </div>
);

export default Tabs;
