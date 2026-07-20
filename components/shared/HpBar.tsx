import React from 'react';

/** Props for the HpBar component. */
interface HpBarProps {
  current: number;
  max: number;
  width?: string;
  height?: string;
}

const hpPercent = (current: number, max: number) => Math.max(0, Math.min(100, (current / max) * 100));
const hpColor = (pct: number) => pct < 20 ? 'bg-red-600' : pct < 50 ? 'bg-amber-600' : 'bg-green-600';

/** Health-point progress bar with dynamic color (green / amber / red) based on remaining HP percentage. */
const HpBar: React.FC<HpBarProps> = ({ current, max, width = 'w-14', height = 'h-2' }) => {
  const pct = hpPercent(current, max);
  return (
    <div className={`${width} ${height} bg-stone-800 rounded-full overflow-hidden`}>
      <div className={`h-full ${hpColor(pct)} transition-all duration-300`} style={{ width: `${pct}%` }} />
    </div>
  );
};

export default HpBar;
