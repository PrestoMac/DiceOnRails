import React from 'react';

interface StartModeScreenProps {
  onQuickStart: () => void;
  onCustom: () => void;
}

const ModeCard: React.FC<{
  icon: string;
  title: string;
  subtitle: string;
  description: string;
  badge: string;
  accent: 'amber' | 'stone';
  onClick: () => void;
}> = ({ icon, title, subtitle, description, badge, accent, onClick }) => {
  const accentBg = accent === 'amber' ? 'hover:border-amber-600 hover:bg-amber-900/10' : 'hover:border-stone-500 hover:bg-stone-800/30';
  const iconRing = accent === 'amber' ? 'bg-amber-900/20 border-amber-700/40 group-hover:scale-110' : 'bg-stone-800/40 border-stone-700 group-hover:scale-105';
  const iconColor = accent === 'amber' ? 'text-amber-500' : 'text-stone-300';
  const cta = accent === 'amber' ? 'bg-amber-700 hover:bg-amber-600 text-white' : 'bg-stone-700 hover:bg-stone-600 text-stone-100';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex flex-col items-center text-center p-6 md:p-8 bg-stone-900/40 backdrop-blur-sm border-2 border-stone-800 rounded-2xl transition-all duration-300 ${accentBg}`}
    >
      <div className={`w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center mb-4 border-2 transition-transform duration-500 ${iconRing}`}>
        <i className={`fas ${icon} text-2xl md:text-3xl ${iconColor}`}></i>
      </div>
      <span className={`text-[10px] uppercase tracking-widest font-bold mb-2 px-3 py-1 rounded-full ${accent === 'amber' ? 'bg-amber-900/30 text-amber-400' : 'bg-stone-800 text-stone-400'}`}>{badge}</span>
      <h2 className="fantasy-font text-2xl md:text-3xl text-stone-100 mb-1">{title}</h2>
      <p className="text-xs md:text-sm text-amber-600/80 uppercase tracking-wider font-bold mb-3">{subtitle}</p>
      <p className="text-xs md:text-sm text-stone-400 leading-relaxed mb-6 max-w-xs">{description}</p>
      <span className={`mt-auto px-6 py-2.5 rounded-lg font-bold text-xs uppercase tracking-widest transition-all ${cta}`}>Choose</span>
    </button>
  );
};

/** Decision screen presented before character creation: Quick Start (preset hero) vs Custom (full wizard). */
const StartModeScreen: React.FC<StartModeScreenProps> = ({ onQuickStart, onCustom }) => {
  return (
    <div className="fixed inset-0 bg-stone-950 z-50 flex flex-col items-center justify-center p-4 md:p-6 text-stone-200 overflow-y-auto custom-scrollbar">
      <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#444 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
      <div className="relative z-10 w-full max-w-4xl flex flex-col items-center animate-in fade-in duration-700">
        <div className="text-center mb-8 md:mb-12">
          <p className="text-stone-500 text-xs uppercase tracking-widest font-bold mb-2">A new chronicle begins</p>
          <h1 className="fantasy-font text-4xl md:text-5xl text-amber-600 tracking-tight mb-3">Choose Your Path</h1>
          <p className="text-stone-400 text-sm md:text-base max-w-xl">Will you step into the world as a seasoned hero, or forge your own from nothing?</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 w-full">
          <ModeCard
            icon="fa-bolt"
            badge="Recommended"
            title="Quick Start"
            subtitle="Ready in seconds"
            description="Pick from ten pre-made level-1 heroes — each with stats, skills, and gear already chosen. Then select your starting ground and begin."
            accent="amber"
            onClick={onQuickStart}
          />
          <ModeCard
            icon="fa-feather-pointed"
            badge="Full control"
            title="Custom Character"
            subtitle="Build from scratch"
            description="Walk through every choice yourself: race, class, ability scores, skills, feats, spells, and equipment. For players who know what they want."
            accent="stone"
            onClick={onCustom}
          />
        </div>
      </div>
    </div>
  );
};

export default StartModeScreen;
