import React, { useState, useEffect } from 'react';
import { playDiceTick, playDiceResult } from './dice/DiceEngine';

interface DiceRollModalProps {
  characterName: string;
  rollType: 'skill'|'attack'|'damage'|'save'|'death_save'|'initiative';
  label: string;
  rollResult: number;
  modifier: number;
  skillRank?: number;
  difficulty?: number;
  success?: boolean;
  xpGained?: number;
  sides?: number;
  isCritical?: boolean;
  isFumble?: boolean;
  onClose: () => void;
  count?: number;
  results?: number[];
}

const LS = '#2e2a24';

const StatCell: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div>
    <span className="text-[8px] block text-stone-500 uppercase font-sans">{label}</span>
    <span className="font-bold text-stone-100">{value}</span>
  </div>
);

const Sep = ({ children }: { children: React.ReactNode }) => <span className="text-stone-600 font-sans">{children}</span>;

/** Full-screen modal overlay displaying an animated dice roll with detailed breakdown and auto-dismiss. */
const DiceRollModal: React.FC<DiceRollModalProps> = ({ characterName, rollType, label, rollResult, modifier, skillRank=0, difficulty, success, xpGained, sides=20, onClose, count = 1, results = [] }) => {
  const [rolling, setRolling] = useState(true);
  const diceCount = count || results.length || 1;
  const initialVals = Array(diceCount).fill(1);
  const [displayVals, setDisplayVals] = useState<number[]>(initialVals);
  const [step, setStep] = useState<'rolling'|'result'>('rolling');

  const propsRef = React.useRef({ rollResult, success, sides, diceCount, results });
  propsRef.current = { rollResult, success, sides, diceCount, results };

  useEffect(() => {
    let tickCount = 0;
    const interval = setInterval(() => {
      const { sides: currentSides, results: currentResults, diceCount: currentDiceCount, rollResult: currentRollResult, success: currentSuccess } = propsRef.current;
      setDisplayVals(prev => prev.map(() => Math.floor(Math.random() * currentSides) + 1));
      playDiceTick();
      tickCount++;
      if (tickCount > 16) {
        clearInterval(interval);
        if (currentResults && currentResults.length === currentDiceCount) {
          setDisplayVals(currentResults);
        } else {
          setDisplayVals([currentRollResult]);
        }
        setRolling(false);
        setStep('result');
        playDiceResult(currentSuccess);
      }
    }, 85);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => { if (step==='result') { const t=setTimeout(onClose,3200); return ()=>clearTimeout(t); } }, [step, onClose]);

  const total = rollResult + modifier + (rollType==='skill'?skillRank:0);
  const strokeColor = rolling ? '#d97706' : success === undefined ? '#d97706' : success ? '#22c55e' : '#ef4444';

  const face = (points: string, inner?: React.ReactNode) => (
    <svg viewBox="0 0 100 100" className="w-full h-full transition-transform duration-75">
      <polygon points={points} fill="#1c1917" stroke={strokeColor} strokeWidth="3.5" className="transition-colors duration-300" />
      {inner}
    </svg>
  );

  const renderDieSVG = () => {
    switch (sides) {
      case 4: return face('50,15 90,85 10,85',<><line x1="50" y1="15" x2="50" y2="60" stroke={LS} strokeWidth="1"/><line x1="10" y1="85" x2="50" y2="60" stroke={LS} strokeWidth="1"/><line x1="90" y1="85" x2="50" y2="60" stroke={LS} strokeWidth="1"/></>);
      case 6: return face('',<><rect x="15" y="15" width="70" height="70" rx="8" fill="#1c1917" stroke={strokeColor} strokeWidth="3.5" className="transition-colors duration-300"/><line x1="15" y1="15" x2="35" y2="35" stroke={LS} strokeWidth="1"/><line x1="85" y1="15" x2="65" y2="35" stroke={LS} strokeWidth="1"/><line x1="15" y1="85" x2="35" y2="65" stroke={LS} strokeWidth="1"/><line x1="85" y1="85" x2="65" y2="65" stroke={LS} strokeWidth="1"/><rect x="35" y="35" width="30" height="30" fill="none" stroke={LS} strokeWidth="1"/></>);
      case 8: return face('50,5 90,50 50,95 10,50',<><line x1="50" y1="5" x2="50" y2="95" stroke={LS} strokeWidth="1"/><line x1="10" y1="50" x2="90" y2="50" stroke={LS} strokeWidth="1"/><polygon points="50,30 75,50 50,70 25,50" fill="none" stroke={LS} strokeWidth="1"/></>);
      case 10: return face('50,5 90,30 75,85 25,85 10,30',<><line x1="50" y1="5" x2="50" y2="50" stroke={LS} strokeWidth="1"/><line x1="90" y1="30" x2="50" y2="50" stroke={LS} strokeWidth="1"/><line x1="10" y1="30" x2="50" y2="50" stroke={LS} strokeWidth="1"/><line x1="25" y1="85" x2="50" y2="50" stroke={LS} strokeWidth="1"/><line x1="75" y1="85" x2="50" y2="50" stroke={LS} strokeWidth="1"/></>);
      case 12: return face('50,5 88,32 74,78 26,78 12,32',<><polygon points="50,22 72,40 64,66 36,66 28,40" fill="none" stroke={LS} strokeWidth="1"/><line x1="50" y1="5" x2="50" y2="22" stroke={LS} strokeWidth="1"/><line x1="88" y1="32" x2="72" y2="40" stroke={LS} strokeWidth="1"/><line x1="74" y1="78" x2="64" y2="66" stroke={LS} strokeWidth="1"/><line x1="26" y1="78" x2="36" y2="66" stroke={LS} strokeWidth="1"/><line x1="12" y1="32" x2="28" y2="40" stroke={LS} strokeWidth="1"/></>);
      default: return face('50,5 90,25 90,75 50,95 10,75 10,25',<><polygon points="50,5 50,35 90,25" fill="none" stroke={LS} strokeWidth="1"/><polygon points="50,5 50,35 10,25" fill="none" stroke={LS} strokeWidth="1"/><polygon points="10,25 50,35 10,75" fill="none" stroke={LS} strokeWidth="1"/><polygon points="90,25 50,35 90,75" fill="none" stroke={LS} strokeWidth="1"/><polygon points="50,35 10,75 50,95" fill="none" stroke={LS} strokeWidth="1"/><polygon points="50,35 90,75 50,95" fill="none" stroke={LS} strokeWidth="1"/></>);
    }
  };

  const cls = (r?: boolean) => r ? 'text-amber-500 scale-95' : success === undefined ? 'text-amber-400 scale-110 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]' : success ? 'text-green-400 scale-110 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]' : 'text-red-400 scale-110 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]';
  const dcls = (r?: boolean) => r ? 'animate-bounce scale-110 rotate-12' : success === undefined ? 'scale-105 drop-shadow-[0_0_12px_rgba(217,119,6,0.4)]' : success ? 'scale-105 drop-shadow-[0_0_12px_rgba(34,197,94,0.5)]' : 'drop-shadow-[0_0_12px_rgba(239,68,68,0.4)]';

  const totalCls = success === undefined ? 'bg-stone-900/40 border-stone-800 text-amber-400 font-bold'
    : success ? 'bg-green-950/20 border-green-900/30 text-green-400 font-bold'
    : 'bg-red-950/20 border-red-900/30 text-red-400 font-bold';

  const title = rollType === 'skill' ? `${label.replace(/\b[a-z]/g, c => c.toUpperCase())} Check`
    : rollType === 'save' ? `${label} Save`
    : rollType === 'death_save' ? '⚰️ Death Save' : label;

  const expression = diceCount > 1 ? `${diceCount}d${sides}` : `d${sides}`;

  return (
    <div className="fixed inset-0 bg-stone-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="max-w-sm w-full bg-stone-900/90 border border-stone-800 rounded-2xl p-6 shadow-2xl relative flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
        <div className="absolute inset-x-0 -top-px h-10 bg-gradient-to-b from-amber-500/10 to-transparent pointer-events-none rounded-t-2xl"></div>
        <div className="mb-4">
          <span className="text-[10px] uppercase font-bold text-amber-500 tracking-widest font-mono">{characterName} • {expression}</span>
          <h2 className="fantasy-font text-lg font-bold text-stone-200 uppercase tracking-tight mt-0.5">{title}</h2>
        </div>
        <div className="my-8 flex flex-wrap gap-4 justify-center items-center max-w-full">
          {displayVals.map((val, idx) => (
            <div key={idx} className={`relative w-20 h-20 flex items-center justify-center transition-all duration-300 ${dcls(rolling)}`}>
              {renderDieSVG()}
              <span className={`absolute text-2xl font-bold font-mono tracking-tighter ${cls(rolling)}`}>{val}</span>
              {!rolling && sides === 20 && val === 20 && <span className="absolute -top-2 bg-green-900 border border-green-700 text-green-300 text-[8px] uppercase font-bold font-mono px-1.5 py-0.5 rounded shadow">Nat 20!</span>}
              {!rolling && sides === 20 && val === 1 && <span className="absolute -top-2 bg-red-900 border border-red-700 text-red-300 text-[8px] uppercase font-bold font-mono px-1.5 py-0.5 rounded shadow">Critical Fail!</span>}
            </div>
          ))}
        </div>
        {!rolling ? <div className="space-y-4 w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div>{success !== undefined ? <>
            <span className={`text-xl font-bold uppercase tracking-wider ${success ? 'text-green-500' : 'text-red-500'}`}>{success ? 'SUCCESS' : 'FAILURE'}</span>
            {success && xpGained && xpGained > 0 && <div className="mt-1 flex items-center justify-center gap-1 text-[11px] font-bold text-amber-500 animate-pulse"><i className="fas fa-sparkles"></i><span>+{xpGained} XP Gained!</span></div>}
            {difficulty !== undefined && <p className="text-stone-500 text-[10px] uppercase font-mono mt-1">Target Difficulty: DC {difficulty}</p>}
          </> : <span className="text-xl font-bold uppercase tracking-wider text-amber-500">{rollType === 'attack' ? 'Attack Rolled' : 'Damage Rolled'}</span>}</div>
          <div className="bg-stone-950/60 border border-stone-850 p-2.5 rounded-lg flex items-center justify-center gap-3 text-xs font-mono text-stone-300">
            <StatCell label="Roll" value={rollResult} />
            <Sep>+</Sep>
            <StatCell label="Stat Mod" value={`${modifier >= 0 ? '+' : ''}${modifier}`} />
            {rollType === 'skill' && skillRank > 0 && <><Sep>+</Sep><StatCell label="Rank" value={`+${skillRank}`} /></>}
            <Sep>=</Sep>
            <div className={`px-2 py-0.5 rounded border ${totalCls}`}><span className="text-[8px] block text-stone-500 uppercase font-sans font-normal">Total</span><span>{total}</span></div>
          </div>
          <button onClick={onClose} className="w-full py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-750 text-xs font-bold rounded-lg uppercase tracking-wider transition-colors mt-2">Continue</button>
        </div> : <div className="text-stone-500 text-xs tracking-wide animate-pulse">The dice are tumbling...</div>}
      </div>
    </div>
  );
};

export default DiceRollModal;
