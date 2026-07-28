import React, { useEffect, useState } from 'react';

export interface OnboardingTourProps {
  active: boolean;
  /** Whether combat is currently active — controls if the combat tracker step shows. */
  combatActive?: boolean;
  /** Whether 2+ party members are present — controls if the multiplayer "Take the Turn" step shows. */
  multiplayer?: boolean;
  /** Called when the user dismisses or completes the tour. */
  onDismiss: () => void;
}

interface TourStep {
  /** CSS selector for the element to highlight. */
  selector: string;
  /** Title shown above the body. */
  title: string;
  /** Body text describing what the element does. */
  body: string;
  /** Side of the highlighted element where the coachmark appears. */
  side: 'top' | 'bottom' | 'left' | 'right';
}

const BASE_STEPS: TourStep[] = [
  {
    selector: 'input[placeholder*="adventurer"], input[placeholder*="What do you do"], input[type="text"]',
    title: 'Chat Input',
    body: 'Type your actions here in plain English. The GM understands natural language — describe what your character does, says, or attempts.',
    side: 'top',
  },
  {
    selector: '[data-tour="character-sheet"], aside',
    title: 'Character Sheet',
    body: 'Your character lives here — stats, HP, AC, spells, inventory, conditions. Click anything with a dotted underline to learn more.',
    side: 'right',
  },
  {
    selector: '[data-tour="quick-actions"]',
    title: 'Quick Actions',
    body: 'One-tap shortcuts for your spells, weapons, class features, and rests. Click to pre-fill the input — you still press Enter to confirm.',
    side: 'top',
  },
  {
    selector: '[data-tour="journal"]',
    title: 'Journal',
    body: 'Quests and lore discovered during play are tracked here. A pulsing dot means a new active quest was added.',
    side: 'right',
  },
  {
    selector: '[data-tour="process-batch"]',
    title: 'Take the Turn',
    body: 'In multiplayer, your messages are held in the chat as pending until any player presses "Take the Turn". This batches everyone\'s actions into one GM response. Remove your own pending messages any time before that.',
    side: 'top',
  },
];

const COMBAT_STEP: TourStep = {
  selector: '[data-tour="combat-tracker"]',
  title: 'Combat Tracker',
  body: 'Shows initiative order, HP bars, and current turn. Expand a combatant to see their AC and conditions.',
  side: 'bottom',
};

interface Rect { top: number; left: number; width: number; height: number; }

const PADDING = 8;

function getRect(selector: string): Rect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/** Hand-rolled coachmark overlay with a viewport-sized mask and a hole for the highlighted element. */
const OnboardingTour: React.FC<OnboardingTourProps> = ({ active, combatActive, multiplayer, onDismiss }) => {
  const visibleSteps = multiplayer ? BASE_STEPS : BASE_STEPS.filter(s => s.selector !== '[data-tour="process-batch"]');
  const steps = combatActive ? [...visibleSteps, COMBAT_STEP] : visibleSteps;
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    if (!active) return;
    setIdx(0);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const step = steps[idx];
    if (!step) {
      onDismiss();
      return;
    }
    const update = () => setRect(getRect(step.selector));
    update();
    const t = window.setTimeout(update, 100);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [active, idx, steps, onDismiss]);

  if (!active) return null;
  const step = steps[idx];
  if (!step) return null;

  const isLast = idx === steps.length - 1;
  const isFirst = idx === 0;

  const cardStyle: React.CSSProperties = (() => {
    if (!rect) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    const cardWidth = 320;
    const cardHeight = 200;
    switch (step.side) {
      case 'top':
        return { top: Math.max(PADDING, rect.top - cardHeight - PADDING), left: Math.max(PADDING, Math.min(rect.left, window.innerWidth - cardWidth - PADDING)) };
      case 'bottom':
        return { top: Math.min(window.innerHeight - cardHeight - PADDING, rect.top + rect.height + PADDING), left: Math.max(PADDING, Math.min(rect.left, window.innerWidth - cardWidth - PADDING)) };
      case 'left':
        return { top: Math.max(PADDING, Math.min(rect.top, window.innerHeight - cardHeight - PADDING)), left: Math.max(PADDING, rect.left - cardWidth - PADDING) };
      case 'right':
        return { top: Math.max(PADDING, Math.min(rect.top, window.innerHeight - cardHeight - PADDING)), left: Math.min(window.innerWidth - cardWidth - PADDING, rect.left + rect.width + PADDING) };
    }
  })();

  const maskClip = rect
    ? {
        clipPath: `polygon(0% 0%, 0% 100%, ${rect.left - PADDING}px 100%, ${rect.left - PADDING}px ${rect.top - PADDING}px, ${rect.left + rect.width + PADDING}px ${rect.top - PADDING}px, ${rect.left + rect.width + PADDING}px ${rect.top + rect.height + PADDING}px, ${rect.left - PADDING}px ${rect.top + rect.height + PADDING}px, ${rect.left - PADDING}px 100%, 100% 100%, 100% 0%)`,
      }
    : {};

  return (
    <div className="fixed inset-0 z-[1000] pointer-events-none">
      <div className="absolute inset-0 bg-stone-950/80 pointer-events-auto" style={maskClip} onClick={onDismiss} />
      {rect && (
        <div
          className="absolute pointer-events-none border-2 border-amber-500 rounded-lg transition-all duration-200"
          style={{
            top: rect.top - PADDING,
            left: rect.left - PADDING,
            width: rect.width + PADDING * 2,
            height: rect.height + PADDING * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0)',
          }}
        />
      )}
      <div
        className="absolute pointer-events-auto bg-stone-900 border border-amber-700/50 rounded-xl p-5 shadow-2xl w-80 animate-in fade-in zoom-in-95 duration-200"
        style={cardStyle}
      >
        <div className="flex items-start justify-between mb-2">
          <h3 className="fantasy-font text-lg font-bold text-amber-500 uppercase tracking-wide">{step.title}</h3>
          <span className="text-[10px] font-mono text-stone-500">{idx + 1} / {steps.length}</span>
        </div>
        <p className="text-xs text-stone-300 leading-relaxed mb-4">{step.body}</p>
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-1.5 text-[10px] text-stone-400 cursor-pointer select-none">
            <input type="checkbox" checked={dontShowAgain} onChange={e => setDontShowAgain(e.target.checked)} className="accent-amber-500" />
            Don't show again
          </label>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button onClick={() => setIdx(i => i - 1)} className="px-3 py-1.5 text-[10px] uppercase font-bold tracking-wider text-stone-400 hover:text-stone-200 transition-colors">Back</button>
            )}
            <button onClick={() => {
              if (isLast) {
                if (dontShowAgain) onDismiss();
                else onDismiss();
              } else {
                setIdx(i => i + 1);
              }
            }} className="px-4 py-1.5 bg-amber-700 hover:bg-amber-600 text-white rounded-lg text-[10px] uppercase font-bold tracking-wider transition-all">
              {isLast ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
      <button
        onClick={onDismiss}
        className="absolute top-4 right-4 px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-lg text-[10px] uppercase font-bold tracking-wider pointer-events-auto transition-colors"
      >
        Skip Tour <i className="fas fa-times ml-1"></i>
      </button>
    </div>
  );
};

export default OnboardingTour;
