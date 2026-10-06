"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface ModalProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: "md" | "lg";
}

// Header stays pinned while the body scrolls (long item details), and the
// body scrolls inside the panel rather than the panel itself, so the rounded
// corners and shadow never get clipped by a scrollbar.
export default function Modal({ title, subtitle, onClose, children, size = "md" }: ModalProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`pop-in modal-panel flex max-h-[90vh] w-full flex-col overflow-hidden ${
          size === "lg" ? "max-w-3xl" : "max-w-xl"
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--hairline)] bg-white px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="-mr-1.5 shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="ปิด"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto bg-[var(--canvas)] px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
