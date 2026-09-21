"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export default function Modal({ title, onClose, children }: ModalProps) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-100 bg-white p-6 shadow-2xl shadow-zinc-900/20"
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-100 pb-4">
          <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            aria-label="ปิด"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
