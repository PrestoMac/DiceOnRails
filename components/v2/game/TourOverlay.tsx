import React, { useEffect, useMemo, useRef, useState } from 'react';
import { cx } from '../primitives/cx';
import { Z } from '../primitives/layers';
import Button from '../primitives/Button';

interface TourOverlayProps {
  active: boolean;
  combatActive?: boolean;
  multiplayer?: boolean;
  onDismiss: (dontShowAgain: boolean) => void;
}

interface TourStep {
  /** CSS selector of the element to highlight. */
  selector: string;
  title: string;
  body: string;
  /** Side of the highlighted element where the coachmark appears. */
  side: 'top' | 'bottom' | 'left' | 'right';
}

const BASE_STEPS: TourStep[] = [
  {
    selector: '[data-tour="chat-input"]',
    title: 'The Chat',
    body: 'Describe what you do, say, or attempt in plain English — the GM understands natural language. Press Enter (or Act Now) to take your turn.',
    side: 'top',
  },
  {
    selector: '[data-tour="character-sheet"]',
    title: 'Your Hero',
    body: 'Your character lives here — stats, HP, AC, spells, inventory, conditions. Click spell and item names to inspect them.',
    side: 'right',
  },
  {
    selector: '[data-tour="quick-actions"]',
    title: 'Quick Actions',
    body: 'One-tap shortcuts for weapons, spells, class features, and rests. They only pre-fill your input — you still confirm with Enter.',
    side: 'top',
  },
  {
    selector: '[data-tour="journal"]',
    title: 'Journal',
    body: 'Quests and lore discovered during play are tracked here. A dot on the tab means something new was added.',
    side: 'right',
  },
];

const MULTIPLAYER_STEP: TourStep = {
  selector: '[data-tour="process-batch"]',
  title: 'Take the Turn',
  body: 'In multiplayer, your messages sit in the chat as pending until any player presses "Take the Turn", batching everyone\'s actions into one GM response. You can remove your own pending messages any time before that.',
  side: 'top',
};

const COMBAT_STEP: TourStep = {
  selector: '[data-tour="combat-tracker"]',
  title: 'Combat Tracker',
  body: 'Shows initiative order, HP bars, and the current turn. Expand a combatant to see their initiative math, AC, and conditions.',
  side: 'bottom',
};

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 8;

function getRect(selector: string): Rect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/** Spotlight onboarding tour: dark mask with a clip-path hole around the current target. Missing targets are skipped silently. */
const TourOverlay: React.FC<TourOverlayProps> = ({ active, combatActive = false, multiplayer = false, onDismiss }) => {
  const steps = useMemo(() => {
    const list = [...BASE_STEPS];
    if (multiplayer) list.push(MULTIPLAYER_STEP);
    if (combatActive) list.push(COMBAT_STEP);
    return list;
  }, [multiplayer, combatActive]);

  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const stepCount = steps.length;

  useEffect(() => {
    if (active) setIdx(0);
  }, [active]);

  // Resolve the current step's rect; skip missing elements silently to the next step.
  useEffect(() => {
    if (!active) return;
    const step = steps[idx];
    if (!step) return;

    const r = getRect(step.selector);
    setRect(r);
    if (!r) {
      // Element not present in the current UI — advance without showing a centered card.
      const t = window.setTimeout(() => setIdx((i) => i + 1), 60);
      return () => window.clearTimeout(t);
    }

    // Debounced rect recompute (layout can settle a tick late; also tracks resize/scroll).
    const recompute = () => setRect(getRect(step.selector));
    let frame = 0;
    const debounced = () => {
      if (frame) window.clearTimeout(frame);
      frame = window.setTimeout(recompute, 80);
    };
    const initial = window.setTimeout(recompute, 120);
    window.addEventListener('resize', debounced);
    window.addEventListener('scroll', debounced, true);
    return () => {
      window.clearTimeout(initial);
      window.clearTimeout(frame);
      window.removeEventListener('resize', debounced);
      window.removeEventListener('scroll', debounced, true);
    };
  }, [active, idx, steps]);

  // Finished walking every step — dismiss.
  const finishedRef = useRef(false);
  useEffect(() => {
    if (!active) return;
    if (idx >= stepCount && !finishedRef.current) {
      finishedRef.current = true;
      onDismiss(dontShowAgain);
    }
  }, [active, idx, stepCount, onDismiss, dontShowAgain]);
  useEffect(() => {
    if (active) finishedRef.current = false;
  }, [active]);

  if (!active) return null;
  const step = steps[idx];
  if (!step) return null;
  if (!rect) return null; // being skipped — nothing to paint this frame

  const isLast = idx === steps.length - 1;
  const isFirst = idx === 0;

  const cardStyle: React.CSSProperties = (() => {
    const cardWidth = 320;
    const cardHeight = 210;
    switch (step.side) {
      case 'top':
        return {
          top: Math.max(PADDING, rect.top - cardHeight - PADDING),
          left: Math.max(PADDING, Math.min(rect.left, window.innerWidth - cardWidth - PADDING)),
        };
      case 'bottom':
        return {
          top: Math.min(window.innerHeight - cardHeight - PADDING, rect.top + rect.height + PADDING),
          left: Math.max(PADDING, Math.min(rect.left, window.innerWidth - cardWidth - PADDING)),
        };
      case 'left':
        return {
          top: Math.max(PADDING, Math.min(rect.top, window.innerHeight - cardHeight - PADDING)),
          left: Math.max(PADDING, rect.left - cardWidth - PADDING),
        };
      case 'right':
        return {
          top: Math.max(PADDING, Math.min(rect.top, window.innerHeight - cardHeight - PADDING)),
          left: Math.min(window.innerWidth - cardWidth - PADDING, rect.left + rect.width + PADDING),
        };
    }
  })();

  const maskClip = {
    clipPath: `polygon(0% 0%, 0% 100%, ${rect.left - PADDING}px 100%, ${rect.left - PADDING}px ${rect.top - PADDING}px, ${rect.left + rect.width + PADDING}px ${rect.top - PADDING}px, ${rect.left + rect.width + PADDING}px ${rect.top + rect.height + PADDING}px, ${rect.left - PADDING}px ${rect.top + rect.height + PADDING}px, ${rect.left - PADDING}px 100%, 100% 100%, 100% 0%)`,
  };

  const dismiss = () => onDismiss(dontShowAgain);

  return (
    <div className={cx('fixed inset-0 pointer-events-none', Z.tour)}>
      <div
        className="absolute inset-0 bg-obsidian-950/85 pointer-events-auto"
        style={maskClip}
        onClick={dismiss}
      />
      <div
        className="absolute pointer-events-none rounded-lg border-2 border-ember-500/80 shadow-[0_0_18px_rgba(238,155,46,0.35)] transition-all duration-200"
        style={{
          top: rect.top - PADDING,
          left: rect.left - PADDING,
          width: rect.width + PADDING * 2,
          height: rect.height + PADDING * 2,
        }}
      />
      <div
        className="absolute pointer-events-auto w-80 bg-obsidian-900 border border-ember-500/40 rounded-xl p-5 shadow-[0_18px_55px_rgba(0,0,0,0.7)] animate-zoom-in"
        style={cardStyle}
      >
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-display text-base font-bold text-ember-400 uppercase tracking-wider">{step.title}</h3>
          <span className="text-[10px] font-mono text-parchment-faint">
            {idx + 1} / {steps.length}
          </span>
        </div>
        <p className="text-xs text-parchment-dim leading-relaxed mb-4">{step.body}</p>
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-1.5 text-[10px] text-parchment-mute cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="accent-ember-500"
            />
            Don't show again
          </label>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <Button variant="ghost" size="sm" onClick={() => setIdx((i) => i - 1)}>
                Back
              </Button>
            )}
            <Button size="sm" onClick={() => (isLast ? dismiss() : setIdx((i) => i + 1))}>
              {isLast ? 'Finish' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
      <Button
        variant="subtle"
        size="sm"
        icon="fa-xmark"
        onClick={dismiss}
        className="absolute top-4 right-4 pointer-events-auto"
      >
        Skip Tour
      </Button>
    </div>
  );
};

export default TourOverlay;
