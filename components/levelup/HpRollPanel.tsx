import React from 'react';
import { getMod } from '../../services/classEngine';

/** Props for the HpRollPanel component. */
interface HpRollPanelProps {
  hitDie: number;
  averageRoll: number;
  hpRoll: number | null;
  rolling: boolean;
  tempRoll: number;
  conMod: number;
  previewHp: number;
  characterMaxHp: number;
  onRoll: () => void;
  onTakeAverage: () => void;
}

/** Panel for rolling hit dice during level-up. Shows a dice animation, roll/avg buttons, and HP gain summary. */
const HpRollPanel: React.FC<HpRollPanelProps> = ({ hitDie, averageRoll, hpRoll, rolling, tempRoll, conMod, previewHp, characterMaxHp, onRoll, onTakeAverage }) => {
  const hpGain = hpRoll !== null ? Math.max(1, hpRoll + conMod) : 0;
  const finalPreviewHp = previewHp;

  return (
    <div className="space-y-6 py-2 animate-in fade-in duration-350">
      <div className="text-center p-4 bg-stone-950/60 rounded-xl border border-stone-850">
        <p className="text-stone-400 text-sm">Your calling dictates a <span className="text-amber-500 font-bold">1d{hitDie}</span> Hit Die for leveling up.</p>
        <div className="flex justify-center items-center gap-4 my-6">
          <div className={`w-20 h-20 bg-stone-900 border-2 rounded-xl flex flex-col justify-center items-center relative shadow-2xl transition-all ${rolling ? 'border-amber-500 scale-105 rotate-12 animate-bounce' : 'border-stone-800'}`}>
            <span className="text-[10px] text-stone-600 uppercase font-bold absolute top-1.5 tracking-tighter">d{hitDie}</span>
            <span className={`text-4xl font-bold font-mono ${rolling ? 'text-amber-500' : hpRoll !== null ? 'text-green-500' : 'text-stone-500'}`}>{rolling ? tempRoll : hpRoll !== null ? hpRoll : '?'}</span>
          </div>
        </div>
        <div className="flex gap-4 max-w-sm mx-auto">
          <button onClick={onRoll} disabled={rolling} className="flex-1 py-2.5 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg font-bold transition-all text-xs uppercase tracking-wider"><i className="fas fa-dice mr-2"></i> Roll Die</button>
          <button onClick={onTakeAverage} disabled={rolling} className="flex-1 py-2.5 bg-stone-800 hover:bg-stone-700 disabled:opacity-50 text-stone-300 rounded-lg font-bold transition-all text-xs uppercase tracking-wider border border-stone-700">Take Average ({averageRoll})</button>
        </div>
      </div>
      {hpRoll !== null && (
        <div className="bg-stone-950/40 p-4 rounded-xl border border-stone-850 text-center animate-in slide-in-from-bottom-2 duration-300">
          <h3 className="text-stone-300 font-bold mb-2 uppercase tracking-wide text-xs">HP Gained Summary</h3>
          <div className="flex justify-center items-center gap-4 text-sm font-mono">
            <div><span className="text-stone-500 block text-[10px] uppercase font-sans">Roll Result</span><span className="text-stone-200 text-lg font-bold">{hpRoll}</span></div>
            <span className="text-stone-600 text-xl">+</span>
            <div><span className="text-stone-500 block text-[10px] uppercase font-sans">CON Modifier</span><span className={`${conMod >= 0 ? 'text-green-500' : 'text-red-400'} text-lg font-bold`}>{conMod >= 0 ? '+' : ''}{conMod}</span></div>
            <span className="text-stone-600 text-xl">=</span>
            <div className="bg-green-950/20 border border-green-900/30 px-3 py-1 rounded"><span className="text-green-600 block text-[10px] uppercase font-sans font-bold">Total Gained</span><span className="text-green-400 text-lg font-bold font-mono">+{hpGain} HP</span></div>
          </div>
          <p className="text-stone-500 text-[10px] mt-3">Max HP: {characterMaxHp} <span className="text-amber-600">→</span> {finalPreviewHp}</p>
        </div>
      )}
    </div>
  );
};

export default HpRollPanel;
