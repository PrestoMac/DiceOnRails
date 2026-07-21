import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Preferred side of the trigger element where the tooltip should appear. */
export type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  /** Tooltip body. Plain strings render as pre-wrapped text; ReactNode is rendered as-is. */
  content: React.ReactNode;
  /** Preferred placement. Viewport clamping may flip it. */
  side?: TooltipSide;
  /** Optional max width in px for the tooltip card. */
  maxWidth?: number;
  /** Optional className applied to the inline wrapper around the trigger. */
  className?: string;
  /** Disable the tooltip entirely (e.g. when content is empty). */
  disabled?: boolean;
  /** Accessible label for the trigger wrapper. */
  ariaLabel?: string;
  children: React.ReactNode;
}

const LONG_PRESS_MS = 300;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Reusable portal tooltip with desktop hover + mobile long-press support.
 * Clamps to viewport edges and flips side if there isn't enough room.
 */
const Tooltip: React.FC<TooltipProps> = ({
  content,
  side = 'top',
  maxWidth = 288,
  className = '',
  disabled = false,
  ariaLabel,
  children,
}) => {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const longPressTimer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const effectiveDisabled = disabled || !content || (typeof content === 'string' && content.trim() === '');

  const computePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const tw = maxWidth;
    const th = 200; // approximate; the card sizes itself to content
    const padding = 12;

    let x: number;

    const place = (s: TooltipSide): { x: number; y: number; s: TooltipSide } => {
      switch (s) {
        case 'top':
          return { x: r.left + r.width / 2 - tw / 2, y: r.top - th - 8, s };
        case 'bottom':
          return { x: r.left + r.width / 2 - tw / 2, y: r.bottom + 8, s };
        case 'left':
          return { x: r.left - tw - 8, y: r.top + r.height / 2 - th / 2, s };
        case 'right':
          return { x: r.right + 8, y: r.top + r.height / 2 - th / 2, s };
      }
    };

    const flip: Record<TooltipSide, TooltipSide> = {
      top: 'bottom',
      bottom: 'top',
      left: 'right',
      right: 'left',
    };

    let attempt = place(side);
    if (attempt.y < padding) attempt = place(flip[side]);
    if (attempt.x < padding) {
      attempt = { ...attempt, x: padding };
    }

    x = clamp(attempt.x, padding, window.innerWidth - tw - padding);
    const y = clamp(attempt.y, padding, window.innerHeight - th - padding);

    // On narrow viewports, horizontally center under/over the trigger
    if (window.innerWidth <= 768) {
      x = clamp(Math.max(padding, Math.min(r.left, window.innerWidth - tw - padding)), padding, window.innerWidth - tw - padding);
    }

    setPos({ x, y });
  }, [maxWidth, side]);

  useEffect(() => {
    if (!open) return;
    computePosition();
    const handleResize = () => computePosition();
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
    };
  }, [open, computePosition]);

  const handleEnter = useCallback(() => {
    if (effectiveDisabled) return;
    setOpen(true);
  }, [effectiveDisabled]);

  const handleLeave = useCallback(() => {
    setOpen(false);
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchStart = useCallback(() => {
    if (effectiveDisabled) return;
    if (longPressTimer.current !== null) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(() => {
      setOpen(true);
    }, LONG_PRESS_MS);
  }, [effectiveDisabled]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  return (
    <>
      <span
        ref={triggerRef}
        className={`inline-flex items-center ${className}`}
        aria-label={ariaLabel}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onFocus={handleEnter}
        onBlur={handleLeave}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onClick={() => setOpen(prev => (window.innerWidth <= 768 ? !prev : prev))}
        style={{ cursor: effectiveDisabled ? undefined : 'help' }}
      >
        {children}
      </span>
      {open && !effectiveDisabled && createPortal(
        <div
          role="tooltip"
          className="fixed z-[9999] bg-stone-950/95 backdrop-blur-md border border-stone-800 rounded-xl p-3 shadow-[0_10px_35px_rgba(0,0,0,0.9)] pointer-events-none text-left animate-in fade-in duration-100"
          style={{ left: `${pos.x}px`, top: `${pos.y}px`, maxWidth: `${maxWidth}px` }}
        >
          {typeof content === 'string' ? (
            <p className="text-xs text-stone-300 leading-relaxed">{content}</p>
          ) : content}
        </div>,
        document.body
      )}
    </>
  );
};

export default Tooltip;
