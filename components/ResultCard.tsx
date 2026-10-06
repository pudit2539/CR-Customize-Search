"use client";

import { memo } from "react";
import { CheckCircle2, Columns3 } from "lucide-react";
import HighlightText from "./HighlightText";
import MdMatrix from "./MdMatrix";
import { SOURCE_TYPE_LABEL } from "@/lib/format";
import { prefetchItemDetail } from "@/lib/itemDetailCache";
import type { CrItemMatch } from "@/lib/types";

const MODE_LABEL = SOURCE_TYPE_LABEL;

// Kept neutral (no per-name rainbow color) so a case touching many clients
// doesn't turn the result card into a wall of confetti — the project names
// themselves are the information, not their color.
function ProjectTags({ project }: { project: string | null }) {
  if (!project) return null;
  const names = project.split(",").map((p) => p.trim()).filter(Boolean);
  return (
    <span className="flex flex-wrap gap-1">
      {names.map((name) => (
        <span key={name} className="badge badge-neutral">
          {name}
        </span>
      ))}
    </span>
  );
}

interface ResultCardProps {
  m: CrItemMatch;
  index: number;
  query: string;
  inCompare: boolean;
  compareDisabled: boolean;
  maxCompare: number;
  confirmed: boolean;
  onDetail: (m: CrItemMatch) => void;
  onToggleCompare: (id: string) => void;
  onConfirm: (id: string) => void;
}

// Memoized so typing in the search box (which re-renders the page on every
// keystroke) doesn't re-render — and re-run the highlight regex for — every
// result card on screen.
function ResultCard({
  m,
  index,
  query,
  inCompare,
  compareDisabled,
  maxCompare,
  confirmed,
  onDetail,
  onToggleCompare,
  onConfirm,
}: ResultCardProps) {
  return (
    <div className="surface-card surface-card-hover fade-up p-4" style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span className="badge badge-neutral rounded-md">
            {m.module ?? "-"}
          </span>
          <span>
            {MODE_LABEL[m.source_type]} · No.{m.item_no ?? "-"}
          </span>
        </div>
        <span className="badge badge-success">
          ใกล้เคียง {(m.similarity * 100).toFixed(0)}%
        </span>
      </div>

      <p className="mt-2.5 text-sm leading-6 font-medium whitespace-pre-wrap text-zinc-900">
        <HighlightText text={m.detail} query={query} />
      </p>

      {/* One relaxed meta line instead of a label/value grid — MD,
          cost, and industry read as a single glance, not four boxes. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5">
          <MdMatrix breakdown={m.md_breakdown} />
          {m.md_summary != null && <span>รวม {m.md_summary} MD</span>}
        </span>
        <span className="flex items-center gap-1">
          Cost:
          {m.cost != null ? (
            <span className="font-medium text-zinc-700">{m.cost.toLocaleString()}</span>
          ) : (
            <span className="badge badge-warn">
              ไม่มีราคา STD
            </span>
          )}
        </span>
        {m.industry && (
          <span>
            Industry: <span className="text-zinc-700">{m.industry}</span>
          </span>
        )}
      </div>

      {m.project && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-zinc-400">Project:</span>
          <ProjectTags project={m.project} />
        </div>
      )}

      {m.remark && (
        <p className="mt-2.5 rounded-lg bg-zinc-50 p-2.5 text-xs whitespace-pre-wrap text-zinc-600">
          {m.remark}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-zinc-50 pt-2.5">
        <button
          onClick={() => onDetail(m)}
                  onMouseEnter={() => prefetchItemDetail(m.id)}
                  onFocus={() => prefetchItemDetail(m.id)}
          className="text-xs font-medium text-zinc-600 hover:text-red-700 hover:underline"
        >
          ดูรายละเอียด
        </button>
        <button
          onClick={() => onToggleCompare(m.id)}
          disabled={compareDisabled}
          title={
            compareDisabled
              ? `เปรียบเทียบได้สูงสุด ${maxCompare} เคส`
              : undefined
          }
          className={`flex items-center gap-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
            inCompare ? "text-red-700" : "text-zinc-500 hover:text-red-700"
          }`}
        >
          <Columns3 size={13} />
          {inCompare ? "เพิ่มในการเปรียบเทียบแล้ว" : "เปรียบเทียบ"}
        </button>
        {confirmed ? (
          <span className="flex items-center gap-1 text-xs text-emerald-600">
            <CheckCircle2 size={13} />
            ยืนยันแล้ว ขอบคุณครับ/ค่ะ
          </span>
        ) : (
          <button
            onClick={() => onConfirm(m.id)}
            title="ยืนยันว่าเคสนี้ตรงกับที่ค้นหาจริง — ช่วยให้ระบบจัดอันดับได้ดีขึ้นในครั้งถัดไป"
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-emerald-700"
          >
            <CheckCircle2 size={13} />
            ใช่ ตรงกับที่ต้องการ
          </button>
        )}
      </div>
    </div>
  );
}

export default memo(ResultCard);
