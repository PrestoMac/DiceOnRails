import React from 'react';
import { cx } from './cx';

/** HP / resource progress bar with verdant→ember→blood thresholds. */
interface HpBarProps {
  current: number;
  max: number;
  className?: string;
  height?: 'sm' | 'md' | 'lg';
  showNumbers?: boolean;
}

const HEIGHTS: Record<NonNullable<HpBarProps['height']>, string> = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
};

const HpBar: React.FC<HpBarProps> = ({ current, max, className, height = 'md', showNumbers = false }) => {
  const pct = max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : 0;
  const color = pct < 20 ? 'bg-blood-500' : pct < 50 ? 'bg-ember-500' : 'bg-verdant-500';
  return (
    <div className={cx('flex items-center gap-2', className)}>
      <div className={cx('flex-1 rounded-full bg-obsidian-800 overflow-hidden border border-white/[0.05]', HEIGHTS[height])}>
        <div className={cx('h-full rounded-full transition-all duration-500', color)} style={{ width: `${pct}%` }} />
      </div>
      {showNumbers && (
        <span className="text-xs font-mono text-parchment-dim whitespace-nowrap">
          {current}<span className="text-parchment-faint">/{max}</span>
        </span>
      )}
    </div>
  );
};

export default HpBar;
