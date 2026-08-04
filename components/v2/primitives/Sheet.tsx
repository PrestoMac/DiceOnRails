import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';
import { Z } from './layers';
import IconButton from './IconButton';

/** Mobile bottom sheet: slides up, backdrop dismiss, drag-handle affordance. */
interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  icon?: string;
  children: React.ReactNode;
  /** 'auto' sizes to content up to 85dvh; 'full' is always 85dvh. */
  size?: 'auto' | 'full';
}

const Sheet: React.FC<SheetProps> = ({ open, onClose, title, icon, children, size = 'auto' }) => {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className={cx('fixed inset-0 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in', Z.sheet)}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cx(
          'w-full bg-obsidian-900 border-t border-x border-white/10 rounded-t-2xl shadow-[0_-10px_50px_rgba(0,0,0,0.7)] animate-slide-up flex flex-col',
          size === 'full' ? 'h-[85dvh]' : 'max-h-[85dvh]',
        )}
      >
        <div className="pt-2 pb-1 flex justify-center">
          <span className="w-10 h-1 rounded-full bg-white/15" aria-hidden="true" />
        </div>
        {title && (
          <header className="flex items-center gap-3 px-5 pb-3 border-b border-white/[0.06]">
            {icon && (
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-ember-500/10 border border-ember-500/25 text-ember-400 text-xs">
                <i className={cx('fas', icon)} aria-hidden="true" />
              </span>
            )}
            <h2 className="flex-1 font-display text-base font-bold text-parchment tracking-wider truncate">{title}</h2>
            <IconButton icon="fa-xmark" tip="Close" onClick={onClose} size="sm" />
          </header>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto v2-scrollbar px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
};

export default Sheet;
