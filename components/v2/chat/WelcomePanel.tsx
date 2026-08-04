import React from 'react';
import { cx } from '../primitives/cx';

interface WelcomePanelProps {
  onPick: (text: string) => void;
}

/** Ported from the old WelcomeChips EXAMPLE_PROMPTS, re-accented into the Emberlight palette. */
const EXAMPLE_PROMPTS: Array<{ text: string; icon: string; accent: string }> = [
  { text: 'I search the room for traps', icon: 'fa-magnifying-glass', accent: 'text-ember-400' },
  { text: 'I attack the goblin with my longsword', icon: 'fa-khanda', accent: 'text-blood-400' },
  { text: "I'd like to persuade the guard", icon: 'fa-comments', accent: 'text-frost-400' },
  { text: 'Cast Healing Word on the wizard', icon: 'fa-hand-holding-medical', accent: 'text-verdant-400' },
  { text: 'I roll a Perception check', icon: 'fa-eye', accent: 'text-arcane-400' },
];

/** Empty-chat welcome panel with clickable example prompts. */
const WelcomePanel: React.FC<WelcomePanelProps> = ({ onPick }) => (
  <div className="relative flex flex-col items-center justify-center py-10 px-4 animate-fade-in">
    <i className="fas fa-dragon absolute text-[11rem] text-ember-500/5 pointer-events-none select-none" aria-hidden="true" />
    <div className="relative flex flex-col items-center w-full max-w-md">
      <h2 className="font-display text-2xl font-bold text-parchment tracking-wide text-center">
        The chronicles await your first move…
      </h2>
      <div className="flex items-center gap-2 my-4 select-none" aria-hidden="true">
        <span className="h-px w-10 bg-gradient-to-r from-transparent to-ember-500/50" />
        <i className="fas fa-gem text-[9px] text-ember-500/70" />
        <span className="h-px w-10 bg-gradient-to-l from-transparent to-ember-500/50" />
      </div>
      <p className="font-display text-[11px] uppercase font-semibold tracking-[0.2em] text-parchment-mute mb-3">
        Try one of these
      </p>
      <div className="flex flex-col gap-2 w-full">
        {EXAMPLE_PROMPTS.map((p) => (
          <button
            key={p.text}
            type="button"
            onClick={() => onPick(p.text)}
            className="group flex items-center gap-3 text-left px-4 py-3 rounded-xl bg-obsidian-900/70 border border-white/[0.06] hover:border-ember-500/40 hover:bg-obsidian-850 transition-all cursor-pointer"
          >
            <i
              className={cx('fas w-5 text-center text-sm transition-transform group-hover:scale-110', p.icon, p.accent)}
              aria-hidden="true"
            />
            <span className="flex-1 text-sm text-parchment-dim group-hover:text-parchment transition-colors">
              {p.text}
            </span>
            <i
              className="fas fa-arrow-right text-[10px] text-ember-500 opacity-0 group-hover:opacity-100 transition-all"
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
      <p className="text-[11px] text-parchment-faint italic mt-4">
        Click one to send it as your first action.
      </p>
    </div>
  </div>
);

export default WelcomePanel;
