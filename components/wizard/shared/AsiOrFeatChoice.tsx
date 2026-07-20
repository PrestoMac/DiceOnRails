import React from 'react';

interface AsiOrFeatChoiceProps {
  onChooseAsi: () => void;
  onChooseFeat: () => void;
}

const AsiOrFeatChoice: React.FC<AsiOrFeatChoiceProps> = ({ onChooseAsi, onChooseFeat }) => (
  <div className="bg-stone-950/60 border border-amber-900/30 rounded-xl p-3 text-center mb-3">
    <p className="text-xs text-stone-400">
      Ability Score Improvement level reached.
    </p>
    <p className="text-[10px] text-stone-500 mt-1">
      Choose: Ability Score Improvement <span className="text-amber-600">or</span> a Feat
    </p>
    <div className="grid grid-cols-2 gap-3 mt-3">
      <button
        onClick={onChooseAsi}
        className="p-3 bg-stone-900/60 border border-stone-800 hover:border-amber-700 hover:bg-amber-950/20 rounded-lg transition-all text-center"
      >
        <i className="fas fa-arrow-up text-2xl text-amber-500 mb-1"></i>
        <p className="text-xs font-bold text-stone-200 uppercase tracking-wider">Ability Score</p>
        <p className="text-[9px] text-stone-400 mt-0.5">+1 to two stats, or +2 to one</p>
      </button>
      <button
        onClick={onChooseFeat}
        className="p-3 bg-stone-900/60 border border-stone-800 hover:border-amber-700 hover:bg-amber-950/20 rounded-lg transition-all text-center"
      >
        <i className="fas fa-trophy text-2xl text-amber-500 mb-1"></i>
        <p className="text-xs font-bold text-stone-200 uppercase tracking-wider">Take a Feat</p>
        <p className="text-[9px] text-stone-400 mt-0.5">Choose from the SRD feat list</p>
      </button>
    </div>
  </div>
);

export default AsiOrFeatChoice;
