import React from 'react';

export interface WelcomeChipsProps {
  /** Called when the user clicks an example prompt. */
  onPick: (text: string) => void;
}

const EXAMPLE_PROMPTS = [
  { text: 'I search the room for traps', icon: 'fa-magnifying-glass', accent: 'text-amber-500' },
  { text: 'I attack the goblin with my longsword', icon: 'fa-khanda', accent: 'text-red-500' },
  { text: "I'd like to persuade the guard", icon: 'fa-comments', accent: 'text-blue-400' },
  { text: 'Cast Healing Word on the wizard', icon: 'fa-hand-holding-medical', accent: 'text-emerald-500' },
  { text: 'I roll a Perception check', icon: 'fa-eye', accent: 'text-purple-400' },
];

/** Replaces the empty chat state with clickable example prompts on first session. */
const WelcomeChips: React.FC<WelcomeChipsProps> = ({ onPick }) => (
  <div className="flex flex-col items-center justify-center text-stone-600 space-y-4 py-6">
    <i className="fas fa-dragon text-6xl opacity-20"></i>
    <p className="fantasy-font italic text-lg tracking-wide text-stone-400">The chronicles await your first move...</p>
    <p className="text-[10px] uppercase font-bold tracking-widest text-stone-600">Try one of these:</p>
    <div className="flex flex-col gap-2 w-full max-w-md">
      {EXAMPLE_PROMPTS.map(p => (
        <button
          key={p.text}
          onClick={() => onPick(p.text)}
          className="flex items-center gap-3 text-left px-4 py-2.5 bg-stone-900/60 hover:bg-amber-950/30 border border-stone-800 hover:border-amber-700/50 rounded-lg transition-all group"
        >
          <i className={`fas ${p.icon} ${p.accent} text-sm group-hover:scale-110 transition-transform`}></i>
          <span className="text-sm text-stone-300 group-hover:text-amber-400 transition-colors flex-1">{p.text}</span>
          <i className="fas fa-arrow-right text-stone-700 group-hover:text-amber-500 text-[10px] opacity-0 group-hover:opacity-100 transition-all"></i>
        </button>
      ))}
    </div>
    <p className="text-[9px] text-stone-700 italic mt-2">Tip: clicking fills the input — press Enter to send.</p>
  </div>
);

export default WelcomeChips;
