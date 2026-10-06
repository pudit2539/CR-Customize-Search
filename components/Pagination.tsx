"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

export const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  disabled?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

// 1 … 4 5 [6] 7 8 … 20 — always shows first/last plus a window around the
// current page, collapsing the gaps into ellipses.
function pageList(page: number, pageCount: number): (number | "gap-l" | "gap-r")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const pages: (number | "gap-l" | "gap-r")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pageCount - 1, page + 1);
  if (start > 2) pages.push("gap-l");
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < pageCount - 1) pages.push("gap-r");
  pages.push(pageCount);
  return pages;
}

export default function Pagination({
  page,
  pageSize,
  total,
  disabled,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const navBtn =
    "flex h-8 min-w-8 items-center justify-center rounded-lg border border-transparent px-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-35";

  return (
    <div className="flex flex-col items-center gap-3 border-t border-[var(--hairline)] bg-slate-50/60 px-4 py-3 sm:flex-row sm:justify-between">
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span className="tabular-nums">
          แสดง <span className="font-semibold text-slate-800">{from.toLocaleString()}–{to.toLocaleString()}</span> จาก{" "}
          <span className="font-semibold text-slate-800">{total.toLocaleString()}</span> รายการ
        </span>
        <label className="flex items-center gap-1.5">
          <span className="hidden sm:inline">ต่อหน้า</span>
          <select
            value={pageSize}
            disabled={disabled}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="control py-1 pr-7 pl-2 text-xs"
            aria-label="จำนวนแถวต่อหน้า"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} แถว
              </option>
            ))}
          </select>
        </label>
      </div>

      <nav className="flex items-center gap-0.5" aria-label="เปลี่ยนหน้า">
        <button className={navBtn} disabled={disabled || page <= 1} onClick={() => onPageChange(1)} aria-label="หน้าแรก">
          <ChevronsLeft size={15} />
        </button>
        <button
          className={navBtn}
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="หน้าก่อนหน้า"
        >
          <ChevronLeft size={15} />
        </button>
        {pageList(page, pageCount).map((p) =>
          typeof p === "string" ? (
            <span key={p} className="px-1 text-slate-400">
              …
            </span>
          ) : (
            <button
              key={p}
              disabled={disabled}
              onClick={() => onPageChange(p)}
              aria-current={p === page ? "page" : undefined}
              className={`${navBtn} tabular-nums ${
                p === page ? "!border-transparent !text-white shadow-sm shadow-red-300/50" : ""
              }`}
              style={p === page ? { background: "var(--brand-gradient)" } : undefined}
            >
              {p}
            </button>
          )
        )}
        <button
          className={navBtn}
          disabled={disabled || page >= pageCount}
          onClick={() => onPageChange(page + 1)}
          aria-label="หน้าถัดไป"
        >
          <ChevronRight size={15} />
        </button>
        <button
          className={navBtn}
          disabled={disabled || page >= pageCount}
          onClick={() => onPageChange(pageCount)}
          aria-label="หน้าสุดท้าย"
        >
          <ChevronsRight size={15} />
        </button>
      </nav>
    </div>
  );
}
