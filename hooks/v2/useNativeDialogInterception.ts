import { useEffect, useRef } from 'react';
import type { ToastKind } from '../../components/v2/primitives/Toast';

/**
 * Routes legacy native dialogs into the Emberlight toast system while the V2 shell
 * is mounted. Legacy hook call sites (useCampaigns join/storage guards) call
 * `window.alert(...)` directly — they surface as branded toasts instead of native
 * browser dialogs, with zero edits to those hooks.
 *
 * `window.confirm` is NOT intercepted (it is synchronous and cannot be replaced by
 * an async dialog): every V2 component pre-confirms with ConfirmDialog before
 * calling code that used to confirm natively.
 */
export function useNativeDialogInterception(toast: (message: string, kind?: ToastKind) => void): void {
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    const originalAlert = window.alert.bind(window);
    window.alert = (message?: unknown) => {
      toastRef.current(String(message ?? ''), 'warning');
    };
    return () => {
      window.alert = originalAlert;
    };
  }, []);
}

export default useNativeDialogInterception;
