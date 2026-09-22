"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, Info, XCircle } from "lucide-react";

type ToastType = "success" | "error" | "info";
interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

const ToastContext = createContext<((message: string, type?: ToastType) => void) | null>(null);

// Small transient popup instead of an inline color banner that sits in the
// page forever until the next action clears it — used for one-off
// confirmations (saved, deleted, copied) where nothing about the message
// needs to stay on screen.
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

let idCounter = 0;

const TOAST_STYLE: Record<ToastType, string> = {
  success: "bg-zinc-900 text-white",
  error: "bg-red-600 text-white",
  info: "bg-zinc-700 text-white",
};

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "success") => {
    const id = ++idCounter;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast-enter pointer-events-auto flex w-full max-w-sm items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg sm:w-auto ${TOAST_STYLE[t.type]}`}
          >
            {t.type === "success" && <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />}
            {t.type === "error" && <XCircle size={16} className="shrink-0" />}
            {t.type === "info" && <Info size={16} className="shrink-0" />}
            <span className="min-w-0">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
