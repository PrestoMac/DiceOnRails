import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';
import { Z } from './layers';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  disabled?: boolean;
}

/**
 * Portal tooltip (hover + 350ms long-press on touch). Viewport-clamped.
 * Content can be any node; keep it short — this is a hint, not a dialog.
 */
const Tooltip: React.FC<TooltipProps> = ({ content, children, side = 'top', className, disabled = false }) => {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const pressTimer = useRef<number | null>(null);

  const show = () => {
    if (disabled) return;
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 8;
    let x = r.left + r.width / 2;
    let y = r.top - gap;
    if (side === 'bottom') y = r.bottom + gap;
    if (side === 'left') { x = r.left - gap; y = r.top + r.height / 2; }
    if (side === 'right') { x = r.right + gap; y = r.top + r.height / 2; }
    setPos({ x, y });
    setVisible(true);
  };
  const hide = () => setVisible(false);

  useEffect(() => {
    if (!visible || !tipRef.current) return;
    // Clamp inside viewport after first paint.
    const tip = tipRef.current.getBoundingClientRect();
    let dx = 0;
    let dy = 0;
    if (tip.left < 8) dx = 8 - tip.left;
    if (tip.right > window.innerWidth - 8) dx = window.innerWidth - 8 - tip.right;
    if (tip.top < 8) dy = 8 - tip.top;
    if (tip.bottom > window.innerHeight - 8) dy = window.innerHeight - 8 - tip.bottom;
    if (dx || dy) setPos((p) => ({ x: p.x + dx, y: p.y + dy }));
  }, [visible]);

  useEffect(() => () => {
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
  }, []);

  const translate: Record<string, string> = {
    top: '-translate-x-1/2 -translate-y-full',
    bottom: '-translate-x-1/2',
    left: '-translate-x-full -translate-y-1/2',
    right: '-translate-y-1/2',
  };

  return (
    <span
      ref={anchorRef}
      className={cx('inline-block', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onTouchStart={() => {
        if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
        pressTimer.current = window.setTimeout(show, 350);
      }}
      onTouchEnd={() => {
        if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
        pressTimer.current = null;
        window.setTimeout(hide, 1200);
      }}
    >
      {children}
      {visible &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            style={{ left: pos.x, top: pos.y }}
            className={cx(
              'fixed pointer-events-none max-w-72 px-3 py-2 rounded-lg bg-obsidian-850/95 backdrop-blur border border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.65)] text-xs text-parchment-dim leading-snug animate-fade-in',
              translate[side],
              Z.toast,
            )}
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  );
};

export default Tooltip;
