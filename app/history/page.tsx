"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Eye, History as HistoryIcon, RotateCcw } from "lucide-react";
import ItemDetailModal from "@/components/ItemDetailModal";
import { SOURCE_TYPE_LABEL } from "@/lib/format";
import type { CrItemRow } from "@/lib/types";

interface SearchLog {
  id: string;
  query: string;
  mode: string | null;
  result_count: number;
  top_similarity: number | null;
  synthesis: string | null;
  created_by: string | null;
  created_at: string;
  cr_items: { id: string; detail: string; module: string | null; source_type: string } | null;
}

interface ChangeLog {
  id: string;
  item_id: string | null;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
}

const ACTION_LABEL: Record<string, string> = {
  insert: "เพิ่มรายการ (manual)",
  update: "แก้ไข (manual)",
  delete: "ลบ (manual)",
  import_insert: "เพิ่มรายการ (import)",
  import_update: "อัพเดท (import)",
};

const MODE_LABEL = SOURCE_TYPE_LABEL;

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function SkeletonCards() {
  return (
    <div className="mt-6 space-y-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm shadow-zinc-200/60">
          <div className="flex items-start justify-between gap-4">
            <div className="skeleton h-3.5 w-2/3 rounded" />
            <div className="skeleton h-3 w-20 rounded" />
          </div>
          <div className="skeleton mt-3 h-3 w-1/3 rounded" />
        </div>
      ))}
    </div>
  );
}

export default function HistoryPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"search" | "changes">("search");
  const [searchLogs, setSearchLogs] = useState<SearchLog[]>([]);
  const [changeLogs, setChangeLogs] = useState<ChangeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<CrItemRow | null>(null);
  const [itemLoadingId, setItemLoadingId] = useState<string | null>(null);
  const [itemError, setItemError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for the fetch this effect starts, not derived/external state
    setLoading(true);
    setLoadError(null);
    fetch(`/api/history?type=${tab}`)
      .then((r) => {
        if (!r.ok) throw new Error(`โหลดประวัติไม่สำเร็จ (${r.status})`);
        return r.json();
      })
      .then((json) => {
        if (tab === "search") setSearchLogs(json.logs ?? []);
        else setChangeLogs(json.logs ?? []);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "โหลดประวัติไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, [tab]);

  // Opens the full detail modal for an item referenced from a log entry —
  // deleted items 404 and get a small inline notice instead.
  async function openItem(itemId: string | null, loadKey: string) {
    if (!itemId) {
      setItemError(loadKey);
      return;
    }
    setItemLoadingId(loadKey);
    setItemError(null);
    try {
      const res = await fetch(`/api/items/${itemId}`);
      if (!res.ok) {
        setItemError(loadKey);
        return;
      }
      const json = await res.json();
      setDetailItem(json.item);
    } finally {
      setItemLoadingId(null);
    }
  }

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      <div className="page-header">
        <span className="icon-badge h-11 w-11 shrink-0">
          <HistoryIcon size={20} />
        </span>
        <div>
          <h1>ประวัติการใช้งาน</h1>
          <p>ประวัติการค้นหาและการแก้ไขข้อมูลทั้งหมดในระบบ</p>
        </div>
      </div>

      <div className="mt-4 inline-flex rounded-full border border-zinc-200 bg-white p-1">
        {(["search", "changes"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t ? "bg-[var(--brand)] text-white" : "text-zinc-500 hover:text-zinc-900"
            }`}
          >
            {t === "search" ? "ประวัติการค้นหา" : "ประวัติการแก้ไขข้อมูล"}
          </button>
        ))}
      </div>

      {loadError && (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{loadError}</div>
      )}

      {loading && <SkeletonCards />}

      {!loading && tab === "search" && (
        <div className="mt-6 space-y-3">
          {searchLogs.length === 0 && <p className="text-sm text-zinc-500">ยังไม่มีประวัติการค้นหา</p>}
          {searchLogs.map((log) => (
            <div key={log.id} className="rounded-2xl border border-zinc-100 bg-white p-4 text-sm shadow-sm shadow-zinc-200/60">
              <div className="flex items-start justify-between gap-4">
                <p className="font-medium text-zinc-800">{log.query}</p>
                <span className="whitespace-nowrap text-xs text-zinc-400">
                  {formatDateTime(log.created_at)}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {log.created_by ?? "-"} · {log.mode ? MODE_LABEL[log.mode] ?? log.mode : "ทั้งหมด"} ·
                เจอ {log.result_count} รายการ
                {log.top_similarity != null && ` · ใกล้เคียงสุด ${(log.top_similarity * 100).toFixed(0)}%`}
              </p>
              {log.cr_items && (
                <button
                  onClick={() => openItem(log.cr_items!.id, log.id)}
                  className="mt-2 block w-full rounded-lg bg-zinc-50 p-2 text-left text-xs text-zinc-600 hover:bg-zinc-100"
                  title="ดูรายละเอียดรายการนี้"
                >
                  ผลลัพธ์ที่ใกล้เคียงที่สุด: [{log.cr_items.module ?? "-"}] {log.cr_items.detail}
                  {itemLoadingId === log.id && <span className="ml-2 text-zinc-400">กำลังเปิด...</span>}
                </button>
              )}
              {itemError === log.id && (
                <p className="mt-1 text-xs text-red-500">เปิดรายการไม่ได้ (อาจถูกลบไปแล้ว)</p>
              )}
              <div className="mt-2 flex items-center gap-3">
                {log.synthesis && (
                  <button
                    onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900"
                  >
                    {expandedId === log.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    {expandedId === log.id ? "ซ่อนสรุปผล AI" : "ดูสรุปผล AI"}
                  </button>
                )}
                <button
                  onClick={() => router.push(`/?q=${encodeURIComponent(log.query)}`)}
                  className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900"
                >
                  <RotateCcw size={12} />
                  ค้นหาอีกครั้ง
                </button>
              </div>
              {expandedId === log.id && log.synthesis && (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 whitespace-pre-wrap text-zinc-700">
                  {log.synthesis}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && tab === "changes" && (
        <div className="mt-6 surface-card p-3 sm:overflow-x-auto sm:p-0">
          <table className="table-responsive w-full text-left text-sm">
            <thead className="text-xs text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">เวลา</th>
                <th className="px-4 py-3 font-medium">โดย</th>
                <th className="px-4 py-3 font-medium">การเปลี่ยนแปลง</th>
                <th className="px-4 py-3 font-medium">Module</th>
                <th className="px-4 py-3 font-medium">Detail</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {changeLogs.map((log) => {
                const row = log.after ?? log.before;
                const deleted = log.action === "delete";
                return (
                  <tr key={log.id} className="border-t border-zinc-100 align-top hover:bg-zinc-50/60">
                    <td data-label="เวลา" className="px-4 py-3 whitespace-nowrap text-zinc-500">
                      {formatDateTime(log.created_at)}
                    </td>
                    <td data-label="โดย" className="px-4 py-3 whitespace-nowrap text-zinc-500">
                      {log.created_by ?? "-"}
                    </td>
                    <td data-label="การเปลี่ยนแปลง" className="px-4 py-3 whitespace-nowrap">
                      {ACTION_LABEL[log.action] ?? log.action}
                    </td>
                    <td data-label="Module" className="px-4 py-3 whitespace-nowrap">{(row?.module as string) ?? "-"}</td>
                    <td data-label="Detail" className="max-w-lg px-4 py-3">
                      <p className="line-clamp-2 whitespace-pre-wrap">{(row?.detail as string) ?? "-"}</p>
                      {itemError === log.id && (
                        <p className="mt-1 text-xs text-red-500">เปิดรายการไม่ได้ (อาจถูกลบไปแล้ว)</p>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {!deleted && (
                        <button
                          onClick={() => openItem(log.item_id, log.id)}
                          title="ดูรายละเอียด"
                          className="btn-icon"
                        >
                          {itemLoadingId === log.id ? (
                            <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
                          ) : (
                            <Eye size={14} />
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {changeLogs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
                    ยังไม่มีประวัติการแก้ไขข้อมูล
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {detailItem && <ItemDetailModal item={detailItem} onClose={() => setDetailItem(null)} />}
    </div>
  );
}
