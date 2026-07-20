import React, { useState, useEffect, useRef } from 'react';
import { DIE_POLYGONS, getDieSides, playDiceTick, playDiceResult } from './dice/DiceEngine';

interface DiceRollCardProps {
  type: 'attack' | 'skill' | 'damage' | 'cast_spell' | 'save' | 'death_save';
  dieFace: string;
  dieRoll: number;
  modifier: number;
  total: number;
  dc?: number;
  success?: boolean;
  label?: string;
  skillRank?: number;
  isCritical?: boolean;
  isFumble?: boolean;
  animate?: boolean;
  dieCount?: number;
  results?: number[];
  rerolledIndices?: number[];
}

/** Animated dice roll result card with SVG die faces, roll animation, and success/failure display. */
const DiceRollCard: React.FC<DiceRollCardProps> = ({
  type,
  dieFace,
  dieRoll,
  modifier,
  total,
  dc,
  success,
  label,
  skillRank,
  isCritical,
  isFumble,
  animate = true,
  dieCount = 1,
  results,
  rerolledIndices = [],
}) => {
  const sides = getDieSides(dieFace);
  const isMultiDie = dieCount > 1 && results && results.length > 0;
  const count = isMultiDie ? dieCount : 1;
  const effectiveResults = isMultiDie ? results : [dieRoll];
  const [phase, setPhase] = useState<'rolling' | 'result'>(animate ? 'rolling' : 'result');
  const [displayVals, setDisplayVals] = useState<number[]>(isMultiDie ? results!.slice() : [dieRoll]);
  const [glowClass, setGlowClass] = useState('');
  const timerRefs = useRef<(ReturnType<typeof setInterval> | null)[]>([]);

  useEffect(() => {
    if (!animate) {
      setPhase('result');
      setDisplayVals(isMultiDie ? results!.slice() : [dieRoll]);
      return;
    }

    const settled = new Set<number>();
    const tickCounts = new Array(count).fill(0);

    for (let i = 0; i < count; i++) {
      const delay = isMultiDie ? i * 100 : 0;
      timerRefs.current[i] = setTimeout(() => {
        timerRefs.current[i] = setInterval(() => {
          setDisplayVals(prev => {
            const next = [...prev];
            while (next.length <= i) next.push(1);
            next[i] = Math.floor(Math.random() * sides) + 1;
            return next;
          });
          if (tickCounts[i] === 0) playDiceTick();
          tickCounts[i]++;
          if (tickCounts[i] > 14) {
            if (timerRefs.current[i]) clearInterval(timerRefs.current[i]!);
            settled.add(i);
            if (isMultiDie) {
              setDisplayVals(prev => {
                const next = [...prev];
                next[i] = results![i];
                return next;
              });
            } else {
              setDisplayVals([dieRoll]);
            }
            if (settled.size === count) {
              setPhase('result');
              playDiceResult(success);
            }
          }
        }, 85);
      }, delay) as any;
    }

    return () => {
      timerRefs.current.forEach(t => { if (t) { clearTimeout(t as any); clearInterval(t as any); } });
    };
  }, [animate, dieRoll, sides, success, count, isMultiDie, results]);

  useEffect(() => {
    if (phase === 'result') {
      const t = setTimeout(() => {
        if (success === true) setGlowClass('border-emerald-500/50 shadow-[0_0_12px_rgba(34,197,94,0.3)]');
        else if (success === false) setGlowClass('border-red-500/50 shadow-[0_0_12px_rgba(239,68,68,0.3)]');
        else setGlowClass('border-amber-500/30 shadow-[0_0_8px_rgba(217,119,6,0.2)]');
      }, 50);
      return () => clearTimeout(t);
    }
  }, [phase, success]);

  const rolling = phase === 'rolling';
  const nat20 = dieRoll === 20 && sides === 20;
  const nat1 = dieRoll === 1 && sides === 20;

  const [borderColor, bgColor] = success === true
    ? ['border-emerald-700/40', 'bg-emerald-950/20']
    : success === false
      ? ['border-red-700/40', 'bg-red-950/20']
      : ['border-stone-700/60', 'bg-stone-900/80'];

  const dieStroke = rolling ? '#d97706' : success === true ? '#22c55e' : success === false ? '#ef4444' : '#d97706';

  const numColor = rolling ? 'text-amber-400'
    : isCritical ? 'text-amber-400 font-bold'
    : isFumble ? 'text-red-400 font-bold'
    : nat20 ? 'text-amber-400 font-bold'
    : nat1 ? 'text-red-400 font-bold'
    : 'text-stone-300';

  const dieData = DIE_POLYGONS[dieFace] || DIE_POLYGONS.d20;

  const renderDieSVG = (dieIndex: number, sizeClass: string = 'w-10 h-10') => (
    <div
      key={dieIndex}
      className={`${sizeClass} rounded-lg flex items-center justify-center bg-stone-900/60 border shadow-inner ${
        rolling ? 'animate-dice-roll' : 'animate-dice-settle'
      } ${
        rerolledIndices.includes(dieIndex) ? 'border-amber-400/60 border-2' : 'border-stone-700/50'
      }`}
    >
      <svg viewBox="0 0 100 100" className="w-full h-full transition-transform duration-75">
        {dieFace === 'd6' ? (
          dieData.inner
        ) : (
          <>
            <polygon
              points={dieData.points}
              fill="#1c1917"
              stroke={dieStroke}
              strokeWidth="3.5"
              className="transition-colors duration-300"
            />
            {dieData.inner}
          </>
        )}
        <text
          x="50" y="54"
          textAnchor="middle" dominantBaseline="middle"
          fill={rolling ? '#d97706' : success === true ? '#22c55e' : success === false ? '#ef4444' : '#d4d4d8'}
          fontSize="28" fontWeight="bold" fontFamily="monospace"
          className="transition-all duration-300"
        >
          {rolling ? (displayVals[dieIndex] ?? 1) : effectiveResults[dieIndex]}
        </text>
      </svg>
    </div>
  );

  return (
    <div
      className={`inline-flex items-center gap-3 px-3 py-2 mt-2 rounded-lg border backdrop-blur-sm text-sm font-mono transition-all duration-300 ${borderColor} ${bgColor} ${glowClass}`}
    >
      {isMultiDie ? (
        <div className="flex items-center gap-1">
          {Array.from({ length: count }).map((_, i) => renderDieSVG(i, 'w-8 h-8'))}
        </div>
      ) : (
        renderDieSVG(0)
      )}

      {label && (
        <span className="text-stone-500 text-xs uppercase tracking-wider font-bold max-w-[120px] truncate">
          {label}
        </span>
      )}

      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-stone-500 text-[10px] font-bold">
          {isMultiDie ? `${count}${dieFace}` : dieFace}
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-xs">
        {isMultiDie ? (
          effectiveResults.map((r, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="text-stone-600">+</span>}
              <span className={
                rolling ? 'text-amber-400'
                  : rerolledIndices.includes(i) ? 'text-amber-300 font-bold'
                  : 'text-stone-300'
              }>
                {rolling ? (displayVals[i] ?? 1) : r}
              </span>
            </React.Fragment>
          ))
        ) : (
          <span className={numColor}>{rolling ? (displayVals[0] ?? 1) : dieRoll}</span>
        )}
        {modifier !== 0 && (
          <>
            <span className="text-stone-600">+</span>
            <span className="text-stone-400">{modifier}</span>
          </>
        )}
        {type === 'skill' && skillRank !== undefined && skillRank > 0 && (
          <>
            <span className="text-stone-600">+</span>
            <span className="text-stone-400">{skillRank}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-stone-600">=</span>
        <span
          className={`font-bold text-base ${
            success === true ? 'text-emerald-400'
              : success === false ? 'text-red-400'
              : 'text-amber-400'
          }`}
        >
          {rolling ? '...' : total}
        </span>
      </div>

      {dc !== undefined && (
        <div className="text-stone-600 text-xs">
          vs {type === 'attack' ? 'AC' : 'DC'} {dc}
        </div>
      )}

      {!rolling && success !== undefined && (
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
            success ? 'bg-emerald-800/60 text-emerald-300' : 'bg-red-800/60 text-red-300'
          }`}
        >
          <i className={`fas fa-${success ? 'check' : 'xmark'} mr-1 text-[8px]`}></i>
          {type === 'attack' ? (success ? 'Hit' : 'Miss') : (success ? 'Pass' : 'Fail')}
        </span>
      )}
    </div>
  );
};

export default DiceRollCard;
