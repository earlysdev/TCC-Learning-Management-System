import { useState, useCallback } from 'react';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => {
      // Prevent duplicate consecutive identical toasts and cap stack at 4
      const filtered = prev.filter((t) => t.message !== message);
      const next = [...filtered, { id, message, type }];
      return next.slice(-4);
    });

    setTimeout(() => {
      dismissToast(id);
    }, 3600);
  }, [dismissToast]);

  return { toasts, showToast, dismissToast };
}
