import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';
import { Z } from './layers';
import IconButton from './IconButton';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  icon?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** When false, clicking the backdrop / pressing Escape does nothing. */
  dismissable?: boolean;
  /** Extra classes for the panel. */
  className?: string;
  /** Extra classes for the scrollable body region. */
  bodyClassName?: string;
}

const SIZES: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-xl',
  xl: 'max-w-3xl',
  full: 'max-w-5xl',
};

/** The single modal primitive for the Emberlight V2 UI (portal + esc + backdrop + scroll lock). */
const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  size = 'md',
  dismissable = true,
  className,
  bodyClassName,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, dismissable, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className={cx(
        'fixed inset-0 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in',
        Z.modal,
      )}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (dismissable && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={cx(
          'relative w-full bg-obsidian-900 border border-white/10 rounded-2xl shadow-[0_20px_70px_rgba(0,0,0,0.7)] animate-zoom-in flex flex-col max-h-[90dvh]',
          SIZES[size],
          className,
        )}
      >
        {(title || icon) && (
          <header className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-white/[0.06]">
            {icon && (
              <span className="mt-0.5 inline-flex items-center justify-center w-9 h-9 rounded-lg bg-ember-500/10 border border-ember-500/25 text-ember-400">
                <i className={cx('fas', icon)} aria-hidden="true" />
              </span>
            )}
            <div className="flex-1 min-w-0">
              {title && (
                <h2 className="font-display text-lg font-bold text-parchment tracking-wider truncate">
                  {title}
                </h2>
              )}
              {subtitle && <p className="text-xs text-parchment-mute mt-0.5">{subtitle}</p>}
            </div>
            {dismissable && <IconButton icon="fa-xmark" tip="Close" onClick={onClose} size="sm" />}
          </header>
        )}
        <div className={cx('flex-1 min-h-0 overflow-y-auto v2-scrollbar px-6 py-4', bodyClassName)}>
          {children}
        </div>
        {footer && <footer className="px-6 py-4 border-t border-white/[0.06]">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
};

export default Modal;
