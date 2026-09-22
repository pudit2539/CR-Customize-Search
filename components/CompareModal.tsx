"use client";

import { useEffect } from "react";
import { Columns3, X } from "lucide-react";
import MdMatrix from "./MdMatrix";
import { SOURCE_TYPE_LABEL } from "@/lib/format";
import type { CrItemMatch } from "@/lib/types";

interface CompareModalProps {
  items: CrItemMatch[];
  onClose: () => void;
  onRemove: (id: string) => void;
}

// Side-by-side view for 2-3 search matches the user picked to weigh against
// each other — a wider, row-labeled layout rather than the generic Modal
// (which caps at max-w-2xl, too narrow to hold several full item columns
// at once).
export default function CompareModal({ items, onClose, onRemove }: CompareModalProps) {
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
        className="max-h-[85vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-zinc-100 bg-white p-6 shadow-2xl shadow-zinc-900/20"
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-100 pb-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
            <Columns3 size={18} className="text-zinc-400" />
            เปรียบเทียบเคส ({items.length})
          </h2>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            aria-label="ปิด"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] border-separate border-spacing-0 text-sm">
            <tbody>
              <Row label="รายการ">
                {items.map((it) => (
                  <td key={it.id} className="align-top p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                        {it.module ?? "-"}
                      </span>
                      <button
                        onClick={() => onRemove(it.id)}
                        title="เอาออกจากการเปรียบเทียบ"
                        className="shrink-0 rounded p-0.5 text-zinc-300 hover:bg-red-50 hover:text-red-600"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <p className="mt-1.5 line-clamp-4 text-xs leading-5 whitespace-pre-wrap text-zinc-800">
                      {it.detail}
                    </p>
                  </td>
                ))}
              </Row>
              <Row label="ประเภท">
                {items.map((it) => (
                  <td key={it.id} className="p-3 text-xs text-zinc-600">
                    {SOURCE_TYPE_LABEL[it.source_type]} · No.{it.item_no ?? "-"}
                  </td>
                ))}
              </Row>
              <Row label="ใกล้เคียง">
                {items.map((it) => (
                  <td key={it.id} className="p-3">
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-100">
                      {(it.similarity * 100).toFixed(0)}%
                    </span>
                  </td>
                ))}
              </Row>
              <Row label="MD">
                {items.map((it) => (
                  <td key={it.id} className="p-3">
                    <MdMatrix breakdown={it.md_breakdown} />
                    {it.md_summary != null && (
                      <p className="mt-1 text-xs text-zinc-400">รวม {it.md_summary} MD</p>
                    )}
                  </td>
                ))}
              </Row>
              <Row label="Cost">
                {items.map((it) => (
                  <td key={it.id} className="p-3 text-sm font-medium text-zinc-900">
                    {it.cost != null ? it.cost.toLocaleString() : <span className="text-zinc-400">-</span>}
                  </td>
                ))}
              </Row>
              <Row label="Project" last>
                {items.map((it) => (
                  <td key={it.id} className="p-3 text-xs text-zinc-600">
                    {it.project ?? "-"}
                  </td>
                ))}
              </Row>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Row({ label, last, children }: { label: string; last?: boolean; children: React.ReactNode }) {
  return (
    <tr className={last ? "" : "border-b border-zinc-100"}>
      <td className="sticky left-0 w-24 shrink-0 bg-white p-3 align-top text-xs font-semibold text-zinc-400">
        {label}
      </td>
      {children}
    </tr>
  );
}
