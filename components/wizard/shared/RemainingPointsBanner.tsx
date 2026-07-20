import React from 'react';

/** Props for the RemainingPointsBanner component. */
interface RemainingPointsBannerProps {
  label: string;
  remaining: number;
  total?: number;
  pulseColor?: string;
  completeColor?: string;
}

/** Banner showing remaining/unspent points for a resource (skill points, stat points, etc.) with pulse animation when > 0. */
const RemainingPointsBanner: React.FC<RemainingPointsBannerProps> = ({
  label, remaining, total, pulseColor = 'text-amber-500', completeColor = 'text-green-500',
}) => (
  <div className="flex justify-between items-center bg-stone-950/60 p-3 rounded-lg border border-stone-850">
    <span className="text-xs text-stone-400">{label}</span>
    <span className={`text-lg font-bold font-mono ${remaining > 0 ? `${pulseColor} animate-pulse` : completeColor}`}>
      {remaining}{total !== undefined ? `/${total}` : ''}
    </span>
  </div>
);

export default RemainingPointsBanner;
