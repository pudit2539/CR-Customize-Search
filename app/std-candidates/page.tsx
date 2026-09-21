"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Eye, Star, Trash2 } from "lucide-react";
import ItemDetailModal from "@/components/ItemDetailModal";
import { SOURCE_TYPE_LABEL } from "@/lib/format";
import { allCategories, categoryOf } from "@/lib/moduleCategories";
import type { CrItemRow } from "@/lib/types";

const MODE_LABEL = SOURCE_TYPE_LABEL;

interface Candidate {
  id: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
  item: CrItemRow | null;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

export default function StdCandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<CrItemRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    fetch("/api/std-candidates")
      .then((r) => {
        if (!r.ok) throw new Error(`โหลดรายการไม่สำเร็จ (${r.status})`);
        return r.json();
      })
      .then((json) => setCandidates(json.candidates ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "โหลดรายการไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  // Grouped by product-area category (same buckets as /items) so the
  // product team can review one area at a time instead of one long flat
  // list mixing every module together.
  const groupedCategories = useMemo(() => {
    const groups = new Map<string, Candidate[]>();
    for (const c of candidates) {
      const category = categoryOf(c.item?.module ?? null);
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category)!.push(c);
    }
    return allCategories()
      .filter((cat) => groups.has(cat))
      .map((cat) => [cat, groups.get(cat)!] as [string, Candidate[]]);
  }, [candidates]);

  async function remove(itemId: string) {
    setRemovingId(itemId);
    try {
      await fetch(`/api/std-candidates?item_id=${itemId}`, { method: "DELETE" });
      load();
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      <h1 className="flex items-center gap-2 text-xl font-semibold text-zinc-900 sm:text-2xl">
        <Star size={22} className="fill-amber-500 text-amber-500" />
        รายการเสนอ STD Candidate
      </h1>
      <p className="mt-1 text-zinc-600">
        รวมรายการที่คัดไว้เพื่อคุยกับ <strong>พี่ยอด (Product/UI)</strong> และ{" "}
        <strong>พี่แชมป์ (Dev)</strong> ว่าควรตีเป็นฟีเจอร์มาตรฐาน (STD) หรือไม่ —
        เพิ่มรายการได้จากปุ่ม &quot;เสนอเป็น STD candidate&quot; ในหน้ารายละเอียดของแต่ละรายการ
      </p>
      <p className="mt-1 text-xs text-zinc-400">
        เกณฑ์คร่าวๆ: ต้องคิดเผื่อว่าลูกค้าเจ้าอื่นจะได้ใช้ด้วย เพราะเป็น platform กลาง
        เปลี่ยนแล้วกระทบทุกคน — ควรเป็นการปรับที่จำเป็นจริงๆ ไม่ใช่ custom เฉพาะเจ้าเดียว
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm text-zinc-500">ทั้งหมด {candidates.length} รายการ</span>
        <a href="/api/std-candidates/export" className="btn btn-primary">
          <Download size={15} />
          Export Excel เพื่อส่งพี่ยอด/พี่แชมป์
        </a>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="mt-4 animate-pulse space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 rounded-2xl border border-zinc-100 bg-white shadow-sm shadow-zinc-200/60" />
          ))}
        </div>
      ) : candidates.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-400">
          ยังไม่มีรายการที่เสนอ — เปิดรายละเอียดของ item ที่สนใจ แล้วกด &quot;เสนอเป็น STD
          candidate&quot;
        </p>
      ) : (
        <div className="mt-4 space-y-6">
          {groupedCategories.map(([category, group]) => (
            <div key={category}>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
                <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs text-indigo-700">
                  {category}
                </span>
                <span className="text-xs font-normal text-zinc-400">{group.length} รายการ</span>
              </h2>
              <div className="mt-2 space-y-3">
                {group.map((c) => (
                  <div key={c.id} className="rounded-2xl border border-zinc-100 bg-white p-4 text-sm shadow-sm shadow-zinc-200/60">
              {c.item ? (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                        {c.item.module ?? "-"}
                      </span>
                      <span className="ml-2 text-xs text-zinc-500">
                        {MODE_LABEL[c.item.source_type]} · No.{c.item.item_no ?? "-"}
                      </span>
                      <p className="mt-1.5 line-clamp-2 text-zinc-800">{c.item.detail}</p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        onClick={() => setDetailItem(c.item)}
                        title="ดูรายละเอียด"
                        className="rounded-lg border border-zinc-200 p-2 text-zinc-500 hover:bg-zinc-50"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={() => remove(c.item!.id)}
                        disabled={removingId === c.item.id}
                        title="เอาออกจากรายการ"
                        className="rounded-lg border border-zinc-200 p-2 text-zinc-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">
                    MD: {c.item.md_summary ?? "-"} · Cost:{" "}
                    {c.item.cost != null ? c.item.cost.toLocaleString() : "-"} · Project:{" "}
                    {c.item.project ?? "-"}
                  </p>
                  {c.note && (
                    <p className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-800">
                      เหตุผล: {c.note}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-zinc-400">
                    เสนอโดย {c.created_by ?? "-"} · {formatDateTime(c.created_at)}
                  </p>
                </>
              ) : (
                <p className="text-sm text-zinc-400">รายการนี้ถูกลบไปแล้ว</p>
              )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {detailItem && <ItemDetailModal item={detailItem} onClose={() => setDetailItem(null)} />}
    </div>
  );
}
