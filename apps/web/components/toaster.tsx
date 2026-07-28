// apps/web/components/toaster.tsx
//
// Minimal toast system with Undo (Asana-style). Zero dependencies.
// Actions that mutate quietly (complete, drag-to-status) confirm themselves
// with a small toast; destructive-ish ones offer a 6-second Undo.
// Failures surface here too, instead of reverting silently.

"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

export interface ToastOptions {
  /** Called when the user clicks Undo. Presence of this shows the button. */
  undo?: () => void;
  /** "ok" (default) | "error" */
  tone?: "ok" | "error";
  /** ms before auto-dismiss (default 6000) */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
  message: string;
  leaving?: boolean;
}

const ToastCtx = createContext<(message: string, opts?: ToastOptions) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToasterProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    // fade out, then remove
    setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 180);
  }, []);

  const toast = useCallback(
    (message: string, opts?: ToastOptions) => {
      const id = nextId.current++;
      setToasts((ts) => [...ts.slice(-2), { id, message, ...opts }]);
      const ms = opts?.duration ?? 6000;
      setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toast-viewport" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone === "error" ? "toast-error" : ""} ${t.leaving ? "toast-leave" : ""}`}>
            <span className="toast-msg">{t.message}</span>
            {t.undo ? (
              <button
                type="button"
                className="toast-undo"
                onClick={() => {
                  t.undo?.();
                  dismiss(t.id);
                }}
              >
                Undo
              </button>
            ) : null}
            <button type="button" className="toast-x" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
