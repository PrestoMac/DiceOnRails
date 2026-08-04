import React from 'react';
import Avatar from '../primitives/Avatar';
import StatBadge from '../primitives/StatBadge';
import { cx } from '../primitives/cx';
import { getMod } from '../../../services/classEngine';
import { getEffectiveAsiMap } from '../../creation/asiUtils';
import { ALL_STATS, computePreviewAc, computePreviewHp, getSubraceName } from './forgeUtils';
import type { ForgeState } from './forgeTypes';

export interface ForgePreviewProps {
  wizard: ForgeState;
  className?: string;
}

/**
 * Live "who am I forging" stat block for the sticky forge rail. Recomputes on
 * every wizard-state change: HP via the real engine (subrace/feat effects
 * included), AC from equipped gear + effective DEX, and the six stats with
 * racial (REPLACE-aware) + bonus level allocations applied.
 */
const ForgePreview: React.FC<ForgePreviewProps> = ({ wizard, className }) => {
  const name = wizard.name.trim() || 'Unnamed Hero';
  const subraceName = getSubraceName(wizard);
  const maxHp = computePreviewHp(wizard);
  const ac = computePreviewAc(wizard);
  const profBonus = Math.ceil(wizard.level / 4) + 1;
  const gp = Math.floor(wizard.goldPool);
  const sp = Math.round((wizard.goldPool % 1) * 10);
  const asiMap = getEffectiveAsiMap(wizard.selectedRace, wizard.selectedSubraceId, wizard.halfElfChoice1, wizard.halfElfChoice2);

  return (
    <div className={cx('bg-obsidian-900/70 border border-white/[0.06] rounded-xl p-4 space-y-3', className)}>
      <div className="flex flex-col items-center text-center gap-2">
        <Avatar name={name} size="xl" ring="ember" />
        <div>
          <p className="font-display font-bold text-parchment tracking-wider text-base leading-tight">{name}</p>
          <p className="text-[11px] text-parchment-mute mt-0.5">
            Level {wizard.level} {wizard.selectedRace.name}{subraceName ? ` (${subraceName})` : ''} {wizard.selectedClass.name}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <StatBadge label="HP" value={maxHp} icon="fa-heart" color="blood" tip="Estimated max hit points, including racial and feat bonuses." className="min-w-0" />
        <StatBadge label="AC" value={ac} icon="fa-shield-halved" color="frost" tip="Estimated armor class from equipped armor/shield plus DEX modifier." className="min-w-0" />
        <StatBadge
          label="Gold"
          value={sp > 0 ? `${gp}g ${sp}s` : `${gp}g`}
          icon="fa-coins"
          color="ember"
          tip="Remaining starting wealth (GP/SP)."
          className="min-w-0"
        />
        <StatBadge label="Prof" value={`+${profBonus}`} icon="fa-star" color="verdant" tip="Proficiency bonus at this level." className="min-w-0" />
      </div>

      <div>
        <p className="font-display text-[9px] font-semibold uppercase tracking-[0.18em] text-parchment-faint mb-1.5">Attributes</p>
        <div className="grid grid-cols-3 gap-1.5">
          {ALL_STATS.map(stat => {
            const total = wizard.stats[stat] + (asiMap[stat] || 0) + (wizard.bonusStatAllocations[stat] || 0);
            return (
              <div
                key={stat}
                className="flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-lg bg-obsidian-850/80 border border-white/[0.05]"
              >
                <span className="text-[8px] font-display font-semibold uppercase tracking-[0.14em] text-parchment-faint">{stat}</span>
                <span className="text-sm font-bold font-mono text-parchment leading-none">{total}</span>
                <span className={cx('text-[9px] font-mono leading-none', getMod(total) >= 0 ? 'text-verdant-400' : 'text-blood-400')}>
                  {getMod(total) >= 0 ? `+${getMod(total)}` : getMod(total)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ForgePreview;
