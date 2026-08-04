import React from 'react';
import Tooltip from '../primitives/Tooltip';
import { cx } from '../primitives/cx';
import { DRAGON_ANCESTRIES } from '../../creation/constants';
import type { AssessmentStatus } from '../../creation/classRaceAssessment';

/** Blood-tinted inline error banner (restyle of the legacy ErrorBanner). */
export const ForgeErrorBanner: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex items-start gap-3 bg-blood-500/10 border border-blood-500/40 rounded-lg p-3 text-xs text-blood-300">
    <i className="fas fa-exclamation-triangle text-blood-400 mt-0.5 shrink-0" aria-hidden="true" />
    <span>{message}</span>
  </div>
);

/** Increment/decrement control for numeric pools (skill ranks, stat points). */
export const ForgeAdjBtn: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  icon: 'plus' | 'minus';
  /** Visual intent: 'add' hovers verdant, 'remove' hovers blood. */
  tone?: 'add' | 'remove';
}> = ({ onClick, disabled, icon, tone = icon === 'plus' ? 'add' : 'remove' }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={icon === 'plus' ? 'Add' : 'Remove'}
    className={cx(
      'w-7 h-7 inline-flex items-center justify-center rounded-md text-[11px] border transition-colors cursor-pointer select-none',
      'bg-obsidian-800 border-white/[0.08] text-parchment-dim disabled:opacity-25 disabled:cursor-not-allowed',
      tone === 'add' ? 'hover:border-verdant-500/50 hover:text-verdant-300 hover:bg-verdant-500/10' : 'hover:border-blood-500/50 hover:text-blood-300 hover:bg-blood-500/10',
    )}
  >
    <i className={cx('fas', `fa-${icon}`)} aria-hidden="true" />
  </button>
);

/** Engine-support assessment badge with a tooltip explaining the status. */
export const AssessmentBadge: React.FC<{ status: AssessmentStatus; reason: string }> = ({ status, reason }) => (
  <Tooltip content={reason} side="top">
    <span className="inline-flex items-center justify-center w-6 h-6" aria-hidden="true">
      {status === 'disabled' ? (
        <i className="fas fa-ban text-blood-400/80 text-sm" />
      ) : status === 'warning' ? (
        <i className="fas fa-triangle-exclamation text-ember-400/90 text-sm" />
      ) : (
        <i className="fas fa-circle-check text-verdant-400/80 text-sm" />
      )}
    </span>
  </Tooltip>
);

/** Points-remaining banner with pulse emphasis while unspent. */
export const PointsBanner: React.FC<{ label: string; remaining: number; total?: number; className?: string }> = ({
  label, remaining, total, className,
}) => (
  <div className={cx('flex justify-between items-center bg-obsidian-900/70 px-4 py-2.5 rounded-xl border border-white/[0.06]', className)}>
    <span className="text-xs text-parchment-mute">{label}</span>
    <span className={cx('text-base font-bold font-mono', remaining > 0 ? 'text-ember-400 animate-pulse' : 'text-verdant-400')}>
      {remaining}{total !== undefined ? ` / ${total}` : ''}
    </span>
  </div>
);

/** Dragon ancestry/color picker — restyle of the legacy DragonColorPicker (used for Dragonborn race AND Draconic Bloodline origin). */
export const DragonColorPicker: React.FC<{
  selected: string | null;
  onSelect: (id: string) => void;
  flavor: 'race' | 'origin';
}> = ({ selected, onSelect, flavor }) => (
  <div className="bg-ember-500/[0.06] border border-ember-500/25 rounded-xl p-4 space-y-3">
    <p className="font-display text-[11px] font-semibold uppercase tracking-[0.15em] text-ember-400 text-center">
      {flavor === 'race' ? 'Dragonborn: Choose your Draconic Ancestry' : 'Draconic Bloodline: Choose your Dragon Ancestor'}
    </p>
    <div className="grid grid-cols-5 gap-2">
      {DRAGON_ANCESTRIES.map(d => (
        <button
          key={d.id}
          type="button"
          onClick={() => onSelect(d.id)}
          className={cx(
            'p-2 rounded-lg border text-center transition-all cursor-pointer',
            selected === d.id
              ? 'border-ember-500/60 bg-ember-500/15 text-ember-300'
              : 'border-white/[0.08] bg-obsidian-900/60 text-parchment-dim hover:border-white/20',
          )}
        >
          <div className="text-xs font-bold uppercase">{d.label}</div>
          <div className="text-[9px] capitalize text-parchment-faint">{d.damageType}</div>
        </button>
      ))}
    </div>
  </div>
);

/** Collapsible trait list (restyle of the legacy <details> trait blocks). */
export const TraitDetails: React.FC<{ traits: { id: string; name: string; description: string }[]; summary: string }> = ({ traits, summary }) => (
  <details className="mt-2" onClick={e => e.stopPropagation()}>
    <summary className="text-[10px] uppercase text-ember-500/90 cursor-pointer font-bold tracking-wider select-none">
      {summary} ({traits.length})
    </summary>
    <ul className="mt-1.5 space-y-1">
      {traits.map(trait => (
        <li key={trait.id} className="text-[10px] text-parchment-mute leading-snug">
          <strong className="text-parchment-dim">{trait.name}:</strong> {trait.description}
        </li>
      ))}
    </ul>
  </details>
);
