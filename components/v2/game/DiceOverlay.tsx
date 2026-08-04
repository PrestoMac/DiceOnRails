import React, { useEffect, useRef, useState } from 'react';
import { DIE_POLYGONS, playDiceResult, playDiceTick } from '../../dice/DiceEngine';
import { cx } from '../primitives/cx';
import { Z } from '../primitives/layers';
import Button from '../primitives/Button';
import StatBadge from '../primitives/StatBadge';

type RollType = 'skill' | 'attack' | 'damage' | 'save' | 'death_save' | 'initiative';

interface DiceOverlayProps {
  isOpen: boolean;
  characterName: string;
  rollType?: RollType;
  label?: string;
  rollResult: number;
  modifier: number;
  skillRank?: number;
  difficulty?: number;
  success?: boolean;
  xpGained?: number;
  sides?: number;
  isCritical?: boolean;
  isFumble?: boolean;
  count?: number;
  results?: number[];
  onClose: () => void;
}

const fill = '#17140F';
const EMBER = '#EE9B2E';
const VERDANT = '#4FC08A';
const BLOOD = '#E06060';

/** Full-screen dice roll overlay: animated tumbling dice that settle on the rolled values, then auto-dismiss. */
const DiceOverlay: React.FC<DiceOverlayProps> = ({
  isOpen,
  characterName,
  rollType = 'skill',
  label = '',
  rollResult,
  modifier,
  skillRank = 0,
  difficulty,
  success,
  xpGained,
  sides = 20,
  isCritical,
  isFumble,
  onClose,
  count = 1,
  results = [],
}) => {
  const diceCount = count || results.length || 1;
  const [rolling, setRolling] = useState(true);
  const [displayVals, setDisplayVals] = useState<number[]>(() => Array(diceCount).fill(1));
  const [step, setStep] = useState<'rolling' | 'result'>('rolling');

  const propsRef = useRef({ rollResult, success, sides, diceCount, results });
  propsRef.current = { rollResult, success, sides, diceCount, results };

  // Reset + run the tumbling cycle whenever the overlay opens.
  useEffect(() => {
    if (!isOpen) return;
    setRolling(true);
    setStep('rolling');
    setDisplayVals(Array(propsRef.current.diceCount).fill(1));
    let tickCount = 0;
    const interval = setInterval(() => {
      const { sides: s, results: rs, diceCount: dc, rollResult: rr, success: ok } = propsRef.current;
      setDisplayVals((prev) => prev.map(() => Math.floor(Math.random() * s) + 1));
      playDiceTick();
      tickCount++;
      if (tickCount > 16) {
        clearInterval(interval);
        if (rs && rs.length === dc) setDisplayVals(rs);
        else setDisplayVals([rr]);
        setRolling(false);
        setStep('result');
        playDiceResult(ok);
      }
    }, 85);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Auto-close 3.2s after the result settles.
  useEffect(() => {
    if (!isOpen || step !== 'result') return;
    const t = setTimeout(onClose, 3200);
    return () => clearTimeout(t);
  }, [isOpen, step, onClose]);

  if (!isOpen) return null;

  const faceKey = `d${sides}`;
  const dieData = DIE_POLYGONS[faceKey] || DIE_POLYGONS.d20;
  const strokeColor = rolling ? EMBER : success === undefined ? EMBER : success ? VERDANT : BLOOD;

  const total = rollResult + modifier + (rollType === 'skill' ? skillRank : 0);

  const title =
    rollType === 'skill'
      ? `${label.replace(/\b[a-z]/g, (c) => c.toUpperCase())} Check`
      : rollType === 'save'
        ? `${label} Save`
        : rollType === 'death_save'
          ? 'Death Save'
          : rollType === 'initiative'
            ? 'Initiative'
            : label || (rollType === 'attack' ? 'Attack Roll' : 'Damage Roll');

  const expression = diceCount > 1 ? `${diceCount}d${sides}` : `d${sides}`;

  const verdict =
    success !== undefined
      ? { text: success ? 'SUCCESS' : 'FAILURE', cls: success ? 'text-verdant-400' : 'text-blood-400' }
      : { text: rollType === 'attack' ? 'Attack Rolled' : 'Damage Rolled', cls: 'text-ember-400' };

  const natBadge = (val: number) => {
    if (rolling || sides !== 20) return null;
    if (val === 20 || isCritical) {
      return (
        <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-verdant-800/90 border border-verdant-500/50 text-verdant-300 text-[8px] uppercase font-bold font-mono px-1.5 py-0.5 rounded whitespace-nowrap">
          Nat 20!
        </span>
      );
    }
    if (val === 1 || isFumble) {
      return (
        <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-blood-800/90 border border-blood-500/50 text-blood-300 text-[8px] uppercase font-bold font-mono px-1.5 py-0.5 rounded whitespace-nowrap">
          Critical Fail!
        </span>
      );
    }
    return null;
  };

  return (
    <div
      className={cx('fixed inset-0 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in', Z.dice)}
      role="dialog"
      aria-modal="true"
      aria-label={`${characterName} dice roll`}
    >
      <div className="max-w-sm w-full bg-obsidian-900/95 border border-white/10 rounded-2xl p-6 shadow-[0_24px_70px_rgba(0,0,0,0.7)] relative flex flex-col items-center text-center animate-zoom-in">
        <div className="absolute inset-x-0 -top-px h-10 bg-gradient-to-b from-ember-500/10 to-transparent pointer-events-none rounded-t-2xl" />
        <div className="mb-4">
          <span className="text-[10px] uppercase font-bold text-ember-400 tracking-widest font-mono">
            {characterName} • {expression}
          </span>
          <h2 className="font-display text-lg font-bold text-parchment uppercase tracking-tight mt-0.5">{title}</h2>
        </div>

        <div className="my-8 flex flex-wrap gap-4 justify-center items-center max-w-full">
          {displayVals.map((val, idx) => (
            <div
              key={idx}
              className={cx(
                'relative w-20 h-20 flex items-center justify-center transition-all duration-300',
                rolling
                  ? 'animate-bounce rotate-12 scale-110'
                  : success === undefined
                    ? 'scale-105 drop-shadow-[0_0_12px_rgba(238,155,46,0.4)]'
                    : success
                      ? 'scale-105 drop-shadow-[0_0_12px_rgba(79,192,138,0.5)]'
                      : 'scale-105 drop-shadow-[0_0_12px_rgba(224,96,96,0.45)]',
              )}
            >
              <svg viewBox="0 0 100 100" className="w-full h-full transition-transform duration-75" aria-hidden="true">
                {dieData.points ? (
                  <polygon
                    points={dieData.points}
                    fill={fill}
                    stroke={strokeColor}
                    strokeWidth="3.5"
                    className="transition-colors duration-300"
                  />
                ) : null}
                {dieData.inner}
              </svg>
              <span
                className={cx(
                  'absolute text-2xl font-bold font-mono tracking-tighter',
                  rolling
                    ? 'text-ember-500 scale-95'
                    : success === undefined
                      ? 'text-ember-300'
                      : success
                        ? 'text-verdant-300'
                        : 'text-blood-300',
                )}
              >
                {val}
              </span>
              {natBadge(val)}
            </div>
          ))}
        </div>

        {step === 'result' && !rolling ? (
          <div className="space-y-4 w-full animate-fade-in">
            <div>
              <span className={cx('font-display text-xl font-bold uppercase tracking-wider', verdict.cls)}>
                {verdict.text}
              </span>
              {success && xpGained !== undefined && xpGained > 0 && (
                <div className="mt-1 flex items-center justify-center gap-1 text-[11px] font-bold text-ember-400 animate-pulse">
                  <i className="fas fa-sparkles" aria-hidden="true" />
                  <span>+{xpGained} XP Gained!</span>
                </div>
              )}
              {difficulty !== undefined && (
                <p className="text-parchment-faint text-[10px] uppercase font-mono mt-1">
                  Target Difficulty: DC {difficulty}
                </p>
              )}
            </div>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <StatBadge label="Roll" value={rollResult} />
              <span className="text-parchment-faint font-mono">+</span>
              <StatBadge label="Stat Mod" value={`${modifier >= 0 ? '+' : ''}${modifier}`} />
              {rollType === 'skill' && skillRank > 0 && (
                <>
                  <span className="text-parchment-faint font-mono">+</span>
                  <StatBadge label="Rank" value={`+${skillRank}`} />
                </>
              )}
              <span className="text-parchment-faint font-mono">=</span>
              <StatBadge
                label="Total"
                value={total}
                color={success === undefined ? 'ember' : success ? 'verdant' : 'blood'}
              />
            </div>
            <Button variant="primary" block onClick={onClose}>
              Continue
            </Button>
          </div>
        ) : (
          <div className="text-parchment-mute text-xs tracking-wide animate-pulse">The dice are tumbling...</div>
        )}
      </div>
    </div>
  );
};

export default DiceOverlay;
