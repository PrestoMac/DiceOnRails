import React, { useEffect, useState } from 'react';
import Screen from '../primitives/Screen';
import Button from '../primitives/Button';

const SPLASH_KEY = 'dor_v2_splash';

const readSeen = (): boolean => {
  try {
    return sessionStorage.getItem(SPLASH_KEY) === '1';
  } catch {
    return false;
  }
};

/** Six drifting ember sparks — deterministic layout, staggered animation timing. */
const EMBER_PARTICLES: ReadonlyArray<{ left: string; bottom: string; delay: string; duration: string }> = [
  { left: '8%', bottom: '-4vh', delay: '0s', duration: '9s' },
  { left: '23%', bottom: '-6vh', delay: '2.5s', duration: '11s' },
  { left: '42%', bottom: '-3vh', delay: '5s', duration: '8s' },
  { left: '59%', bottom: '-5vh', delay: '1.2s', duration: '10s' },
  { left: '75%', bottom: '-4vh', delay: '6.8s', duration: '9.5s' },
  { left: '90%', bottom: '-6vh', delay: '3.7s', duration: '12s' },
];

const FEATURES: ReadonlyArray<{ icon: string; title: string; body: string }> = [
  {
    icon: 'fa-brain',
    title: 'AI Game Master',
    body: 'An advanced AI weaves unique stories, quests, and NPCs in real time, responding to your every choice.',
  },
  {
    icon: 'fa-image',
    title: 'Visual Immersion',
    body: 'Dynamic atmosphere generation brings every location to life with stunning, context-aware visuals.',
  },
  {
    icon: 'fa-scroll',
    title: 'Persistent Legend',
    body: 'Save your progress securely to the cloud or play anonymously. Your epic saga is yours to keep.',
  },
];

const FeatureCard: React.FC<{ icon: string; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div className="flex flex-col items-center text-center p-5 md:p-6 bg-obsidian-900/70 border border-white/[0.06] rounded-2xl transition-colors hover:border-arcane-500/30 group">
    <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-arcane-500/10 border border-arcane-500/30 flex items-center justify-center mb-3 md:mb-4 group-hover:scale-110 transition-transform duration-500">
      <i className={`fas ${icon} text-xl md:text-2xl text-arcane-300`} aria-hidden="true" />
    </div>
    <h3 className="font-display text-sm md:text-base font-bold uppercase tracking-wider text-parchment mb-1.5 md:mb-2">{title}</h3>
    <p className="text-xs md:text-sm text-parchment-mute leading-relaxed">{children}</p>
  </div>
);

/** V2 landing splash: wordmark, feature cards, drifting embers, slow-spinning d20 watermark, CTA. Skips itself once per session. */
const LandingScreen: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [skipped] = useState(readSeen);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(SPLASH_KEY, '1');
    } catch {
      /* storage unavailable — the splash simply shows again next load */
    }
    if (skipped) onComplete();
  }, [skipped, onComplete]);

  if (skipped) return null;

  const handleEnter = () => {
    if (fading) return;
    setFading(true);
    window.setTimeout(onComplete, 300);
  };

  return (
    <Screen dots center className={`transition-opacity duration-300 ${fading ? 'opacity-0' : 'opacity-100'}`}>
      {/* Slow-spinning d20 watermark */}
      <i
        className="fas fa-dice-d20 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[44vmin] text-ember-500/[0.06] animate-spin-slow pointer-events-none"
        aria-hidden="true"
      />
      {/* Drifting ember particles */}
      {EMBER_PARTICLES.map((p, i) => (
        <span
          key={i}
          className="absolute w-1 h-1 rounded-full bg-ember-400/80 blur-[2px] animate-ember-drift pointer-events-none"
          style={{ left: p.left, bottom: p.bottom, animationDelay: p.delay, animationDuration: p.duration }}
          aria-hidden="true"
        />
      ))}
      <div className="relative w-full max-h-[100dvh] overflow-y-auto v2-scrollbar flex flex-col items-center justify-center px-4 py-10 text-center">
        <h1 className="font-display text-5xl md:text-7xl font-bold tracking-tight leading-tight mb-3 drop-shadow-lg">
          <span className="text-ember-500">Dice</span>
          <span className="text-parchment"> On Rails</span>
        </h1>
        <p className="font-display text-parchment-mute text-xs md:text-base uppercase tracking-[0.3em] mb-8 md:mb-12">
          The Infinite AI-Powered RPG Adventure
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 max-w-5xl w-full mb-8 md:mb-12">
          {FEATURES.map((f) => (
            <FeatureCard key={f.title} icon={f.icon} title={f.title}>
              {f.body}
            </FeatureCard>
          ))}
        </div>
        <Button size="lg" icon="fa-dungeon" onClick={handleEnter} className="animate-ember-glow shrink-0">
          Enter the Realm
        </Button>
      </div>
    </Screen>
  );
};

export default LandingScreen;
