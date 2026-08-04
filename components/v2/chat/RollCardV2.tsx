import React from 'react';
import type { RollData } from '../../../types';
import { DIE_POLYGONS, getDieSides } from '../../dice/DiceEngine';
import { cx } from '../primitives/cx';

interface RollCardV2Props {
  roll: RollData;
  /** When provided, the card becomes clickable (replays the roll in the modal popup). */
  onClick?: () => void;
}

const KIND_STYLE = {
  success: {
    border: 'border-verdant-600/40',
    bg: 'bg-verdant-950/25',
    stroke: '#4FC08A',
    number: 'text-verdant-300',
    badge: 'bg-verdant-800/60 text-verdant-300 border border-verdant-600/40',
  },
  failure: {
    border: 'border-blood-600/40',
    bg: 'bg-blood-950/25',
    stroke: '#E06060',
    number: 'text-blood-300',
    badge: 'bg-blood-800/60 text-blood-300 border border-blood-600/40',
  },
  neutral: {
    border: 'border-ember-600/30',
    bg: 'bg-obsidian-900/80',
    stroke: '#EE9B2E',
    number: 'text-ember-300',
    badge: 'bg-obsidian-800 text-parchment-dim border border-white/10',
  },
} as const;

const TYPE_LABELS: Record<RollData['type'], string> = {
  attack: 'Attack',
  skill: 'Skill',
  damage: 'Damage',
  cast_spell: 'Spell',
  save: 'Save',
  death_save: 'Death Save',
};

/** Compact inline dice-roll card (SVG die + breakdown + verdict badge). Clickable to replay. */
const RollCardV2: React.FC<RollCardV2Props> = ({ roll, onClick }) => {
  const dieFace = roll.dieFace || 'd20';
  const sides = getDieSides(dieFace);
  const dieCount = roll.dieCount ?? 1;
  const isMultiDie = dieCount > 1 && !!roll.results && roll.results.length > 0;
  const results = isMultiDie && roll.results ? roll.results : [roll.dieRoll];
  const kind = roll.success === true ? 'success' : roll.success === false ? 'failure' : 'neutral';
  const style = KIND_STYLE[kind];
  const dieData = DIE_POLYGONS[dieFace] || DIE_POLYGONS.d20;
  const nat20 = roll.dieRoll === 20 && sides === 20;
  const nat1 = roll.dieRoll === 1 && sides === 20;
  const dcLabel = roll.type === 'attack' ? 'AC' : 'DC';
  const verdict =
    roll.success === undefined
      ? null
      : roll.type === 'attack'
        ? roll.success
          ? 'Hit'
          : 'Miss'
        : roll.success
          ? 'Pass'
          : 'Fail';

  const isCrit = roll.isCritical === true || nat20;
  const isFumble = roll.isFumble === true || nat1;

  const breakdown = isMultiDie
    ? results.map((r, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="text-parchment-faint"> + </span>}
          <span
            className={
              roll.rerolledIndices?.includes(i) ? 'text-ember-300 font-bold' : 'text-parchment-dim'
            }
          >
            {r}
          </span>
        </React.Fragment>
      ))
    : null;

  const card = (
    <div
      className={cx(
        'inline-flex items-center gap-2.5 px-3 py-2 rounded-lg border font-mono text-xs max-w-[200px] transition-colors',
        style.border,
        style.bg,
      )}
    >
      <svg viewBox="0 0 100 100" className="w-9 h-9 shrink-0" aria-hidden="true">
        {dieFace === 'd6' ? (
          dieData.inner
        ) : (
          <>
            <polygon points={dieData.points} fill="#17140F" stroke={style.stroke} strokeWidth="3.5" />
            {dieData.inner}
          </>
        )}
        <text
          x="50"
          y="54"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={style.stroke}
          fontSize={isMultiDie ? '22' : '26'}
          fontWeight="bold"
          fontFamily="monospace"
        >
          {isMultiDie ? `×${dieCount}` : roll.dieRoll}
        </text>
      </svg>

      <div className="flex flex-col min-w-0 gap-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-parchment-mute text-[10px] uppercase tracking-wider font-bold truncate max-w-[90px]">
            {roll.label ?? TYPE_LABELS[roll.type]}
          </span>
          {isCrit && (
            <span className="px-1.5 py-px rounded-full text-[9px] font-bold uppercase tracking-wider bg-ember-800/60 text-ember-200 border border-ember-500/40">
              Crit
            </span>
          )}
          {isFumble && (
            <span className="px-1.5 py-px rounded-full text-[9px] font-bold uppercase tracking-wider bg-blood-800/60 text-blood-200 border border-blood-500/40">
              Fumble
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 whitespace-nowrap">
          <span className="text-parchment-faint text-[9px] font-bold">
            {isMultiDie ? `${dieCount}${dieFace}` : dieFace}
          </span>
          {isMultiDie ? (
            <span className="truncate">{breakdown}</span>
          ) : (
            <>
              {roll.modifier !== 0 && (
                <>
                  <span className="text-parchment-faint">+</span>
                  <span className="text-parchment-dim">{roll.modifier}</span>
                </>
              )}
              {roll.type === 'skill' && roll.skillRank !== undefined && roll.skillRank > 0 && (
                <>
                  <span className="text-parchment-faint">+</span>
                  <span className="text-parchment-dim">{roll.skillRank}</span>
                </>
              )}
            </>
          )}
          <span className="text-parchment-faint">=</span>
          <span className={cx('font-bold text-sm', style.number)}>{roll.total}</span>
          {roll.dc !== undefined && (
            <span className="ml-0.5 px-1.5 py-px rounded-full text-[9px] font-semibold uppercase tracking-wide bg-white/[0.05] border border-white/10 text-parchment-mute">
              vs {dcLabel} {roll.dc}
            </span>
          )}
          {verdict && (
            <span
              className={cx(
                'px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider',
                style.badge,
              )}
            >
              <i className={cx('fas mr-1 text-[7px]', roll.success ? 'fa-check' : 'fa-xmark')} aria-hidden="true" />
              {verdict}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="block w-auto text-left rounded-lg transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-ember-500/50 cursor-pointer"
        title="Click to replay dice roll"
      >
        {card}
      </button>
    );
  }
  return card;
};

export default RollCardV2;
