import React, { useState } from 'react';

const FeatureCard: React.FC<{ icon: string; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div className="flex flex-col items-center p-4 md:p-6 bg-stone-900/40 backdrop-blur-sm border border-stone-800 rounded-xl hover:bg-stone-900/60 transition-colors group">
    <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-amber-900/20 flex items-center justify-center mb-3 md:mb-4 border border-amber-700/30 group-hover:scale-110 transition-transform duration-500">
      <i className={`fas ${icon} text-xl md:text-2xl text-amber-500`}></i>
    </div>
    <h3 className="fantasy-font text-lg md:text-xl text-stone-200 mb-1 md:mb-2">{title}</h3>
    <p className="text-xs md:text-sm text-stone-400 leading-relaxed">{children}</p>
  </div>
);

const SplashScreen: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [isVisible, setIsVisible] = useState(true);

  const handleEnter = () => {
    setIsVisible(false);
    setTimeout(onComplete, 500);
  };

  return (
    <div className={`fixed inset-0 z-[100] bg-stone-950 transition-opacity duration-1000 ${isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      <div className="absolute inset-0">
        <img src="/splash-bg.png" alt="Dungeon Entrance" className="w-full h-full object-cover opacity-60 animate-fadeIn" />
        <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/80 to-transparent"></div>
        <div className="absolute inset-0 bg-radial-gradient from-transparent to-stone-950/90"></div>
      </div>
      <div className="relative h-full w-full flex flex-col items-center justify-center p-4 md:p-6 text-center z-10 animate-slideUp overflow-y-auto custom-scrollbar">
        <div className="min-h-min flex flex-col items-center justify-center pt-20 pb-8 md:py-8">
          <h1 className="fantasy-font text-5xl md:text-8xl font-bold text-amber-600 tracking-tight mb-2 drop-shadow-lg leading-tight">Dice<span className="text-stone-100">OnRails</span></h1>
          <p className="text-stone-400 text-sm md:text-xl uppercase tracking-widest font-bold mb-8 md:mb-12 max-w-2xl px-4">The Infinite AI-Powered RPG Adventure</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 max-w-6xl w-full mb-8 md:mb-16 px-2 md:px-4 shrink-0">
            <FeatureCard icon="fa-brain" title="AI Game Master">Powered by advanced AI to generate unique stories, quests, and NPCs in real-time, responding to your every choice.</FeatureCard>
            <FeatureCard icon="fa-image" title="Visual Immersion">Dynamic atmosphere generation brings every location to life with stunning, context-aware visuals.</FeatureCard>
            <FeatureCard icon="fa-scroll" title="Persistent Legend">Save your progress securely to the cloud or play anonymously. Your epic saga is yours to keep.</FeatureCard>
          </div>
          <button onClick={handleEnter} className="group relative px-8 md:px-12 py-3 md:py-4 bg-amber-700 hover:bg-amber-600 text-white font-bold text-lg md:text-xl rounded-lg overflow-hidden transition-all hover:scale-105 shadow-[0_0_30px_rgba(180,83,9,0.3)] hover:shadow-[0_0_50px_rgba(180,83,9,0.6)] shrink-0">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-shimmer"></div>
            <span className="relative flex items-center gap-3">Enter the Realm <i className="fas fa-dungeon"></i></span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;
