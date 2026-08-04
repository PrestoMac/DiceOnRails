import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';
import { Z } from './layers';

export type ToastKind = 'info' | 'success' | 'error' | 'warning';

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastContextValue {
  toast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToastV2(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToastV2 must be used within ToastProviderV2');
  return ctx;
}

/** Context revealed for the native-dialog interception hook (mounted by AppShellV2). */
export const ToastContextForInterception = ToastContext;

const KIND_STYLE: Record<ToastKind, { ring: string; icon: string; iconColor: string }> = {
  info: { ring: 'border-frost-500/40', icon: 'fa-circle-info', iconColor: 'text-frost-400' },
  success: { ring: 'border-verdant-500/40', icon: 'fa-circle-check', iconColor: 'text-verdant-400' },
  error: { ring: 'border-blood-500/50', icon: 'fa-circle-exclamation', iconColor: 'text-blood-400' },
  warning: { ring: 'border-ember-500/50', icon: 'fa-triangle-exclamation', iconColor: 'text-ember-400' },
};

/** Toast host + hook. Mounted once by AppShellV2; replaces every native alert(). */
export const ToastProviderV2: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      idRef.current += 1;
      const id = idRef.current;
      setItems((prev) => [...prev.slice(-3), { id, message, kind }]);
      setTimeout(() => dismiss(id), 4200);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {createPortal(
        <div
          className={cx(
            'fixed top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none w-full max-w-md px-4',
            Z.toast,
          )}
          aria-live="polite"
        >
          {items.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => dismiss(t.id)}
              className={cx(
                'pointer-events-auto w-full flex items-start gap-2.5 px-4 py-3 rounded-xl bg-obsidian-850/95 backdrop-blur border shadow-[0_10px_35px_rgba(0,0,0,0.6)] text-left animate-slide-up cursor-pointer',
                KIND_STYLE[t.kind].ring,
              )}
            >
              <i className={cx('fas mt-0.5', KIND_STYLE[t.kind].icon, KIND_STYLE[t.kind].iconColor)} aria-hidden="true" />
              <span className="text-sm text-parchment leading-snug">{t.message}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
};
