import React from 'react';

/** SVG polygon coordinates and decorative inner elements for each standard die face (d4–d20). Note: the d6 entry uses an empty `points` string and renders its shape via an `<rect>` inside `inner` rather than a polygon. */
export const DIE_POLYGONS: Record<string, { points: string; inner?: React.ReactNode }> = {
  d4: {
    points: '50,15 90,85 10,85',
    inner: (
      <>
        <line x1="50" y1="15" x2="50" y2="60" stroke="#2e2a24" strokeWidth="1" />
        <line x1="10" y1="85" x2="50" y2="60" stroke="#2e2a24" strokeWidth="1" />
        <line x1="90" y1="85" x2="50" y2="60" stroke="#2e2a24" strokeWidth="1" />
      </>
    ),
  },
  d6: {
    points: '',
    inner: (
      <>
        <rect x="15" y="15" width="70" height="70" rx="8" fill="#1c1917" stroke="#d97706" strokeWidth="3.5" className="transition-colors duration-300" />
        <line x1="15" y1="15" x2="35" y2="35" stroke="#2e2a24" strokeWidth="1" />
        <line x1="85" y1="15" x2="65" y2="35" stroke="#2e2a24" strokeWidth="1" />
        <line x1="15" y1="85" x2="35" y2="65" stroke="#2e2a24" strokeWidth="1" />
        <line x1="85" y1="85" x2="65" y2="65" stroke="#2e2a24" strokeWidth="1" />
        <rect x="35" y="35" width="30" height="30" fill="none" stroke="#2e2a24" strokeWidth="1" />
      </>
    ),
  },
  d8: {
    points: '50,5 90,50 50,95 10,50',
    inner: (
      <>
        <line x1="50" y1="5" x2="50" y2="95" stroke="#2e2a24" strokeWidth="1" />
        <line x1="10" y1="50" x2="90" y2="50" stroke="#2e2a24" strokeWidth="1" />
        <polygon points="50,30 75,50 50,70 25,50" fill="none" stroke="#2e2a24" strokeWidth="1" />
      </>
    ),
  },
  d10: {
    points: '50,5 90,30 75,85 25,85 10,30',
    inner: (
      <>
        <line x1="50" y1="5" x2="50" y2="50" stroke="#2e2a24" strokeWidth="1" />
        <line x1="90" y1="30" x2="50" y2="50" stroke="#2e2a24" strokeWidth="1" />
        <line x1="10" y1="30" x2="50" y2="50" stroke="#2e2a24" strokeWidth="1" />
        <line x1="25" y1="85" x2="50" y2="50" stroke="#2e2a24" strokeWidth="1" />
        <line x1="75" y1="85" x2="50" y2="50" stroke="#2e2a24" strokeWidth="1" />
      </>
    ),
  },
  d12: {
    points: '50,5 88,32 74,78 26,78 12,32',
    inner: (
      <>
        <polygon points="50,22 72,40 64,66 36,66 28,40" fill="none" stroke="#2e2a24" strokeWidth="1" />
        <line x1="50" y1="5" x2="50" y2="22" stroke="#2e2a24" strokeWidth="1" />
        <line x1="88" y1="32" x2="72" y2="40" stroke="#2e2a24" strokeWidth="1" />
        <line x1="74" y1="78" x2="64" y2="66" stroke="#2e2a24" strokeWidth="1" />
        <line x1="26" y1="78" x2="36" y2="66" stroke="#2e2a24" strokeWidth="1" />
        <line x1="12" y1="32" x2="28" y2="40" stroke="#2e2a24" strokeWidth="1" />
      </>
    ),
  },
  d20: {
    points: '50,5 90,25 90,75 50,95 10,75 10,25',
    inner: (
      <>
        <polygon points="50,5 50,35 90,25" fill="none" stroke="#2e2a24" strokeWidth="1" />
        <polygon points="50,5 50,35 10,25" fill="none" stroke="#2e2a24" strokeWidth="1" />
        <polygon points="10,25 50,35 10,75" fill="none" stroke="#2e2a24" strokeWidth="1" />
        <polygon points="90,25 50,35 90,75" fill="none" stroke="#2e2a24" strokeWidth="1" />
        <polygon points="50,35 10,75 50,95" fill="none" stroke="#2e2a24" strokeWidth="1" />
        <polygon points="50,35 90,75 50,95" fill="none" stroke="#2e2a24" strokeWidth="1" />
      </>
    ),
  },
};

/** Parses a die face string (e.g. "d20") and returns the number of sides. Defaults to 20. */
export function getDieSides(face: string): number {
  const match = face.match(/d(\d+)/);
  return match ? parseInt(match[1]) : 20;
}

const makeAudio = () => {
  const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sine';
  return { ctx, osc, gain };
};

/** Plays a short audio tick sound (randomized sine tone) to simulate a die tumbling. */
export function playDiceTick() {
  try {
    const { ctx, osc, gain } = makeAudio();
    osc.frequency.setValueAtTime(180 + Math.random() * 120, ctx.currentTime);
    gain.gain.setValueAtTime(0.07, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    osc.start();
    osc.stop(ctx.currentTime + 0.06);
  } catch { /* AudioContext may not be available */ }
}

/** Plays an audio tone to indicate the roll outcome: ascending high tone for success (523→659 Hz), low sustained tone for failure (120 Hz, NOT a descending sweep), or ascending low tone when success is undefined (440→554 Hz). */
export function playDiceResult(success?: boolean) {
  try {
    const { ctx, osc, gain } = makeAudio();
    if (success === undefined) {
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(554.37, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.07, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } else if (success) {
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.07, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } else {
      osc.frequency.setValueAtTime(120, ctx.currentTime);
      gain.gain.setValueAtTime(0.07, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch { /* AudioContext may not be available */ }
}
