"use client";

import { useEffect, useState } from "react";

interface SearchLog {
  id: string;
  query: string;
  mode: string | null;
  result_count: number;
  top_similarity: number | null;
  synthesis: string | null;
  created_by: string | null;
  created_at: string;
  cr_items: { detail: string; module: string | null; source_type: string } | null;
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

const MODE_LABEL: Record<string, string> = {
  new_customer: "ลูกค้าใหม่",
  existing_customer: "ลูกค้าเดิม",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function HistoryPage() {
  const [tab, setTab] = useState<"search" | "changes">("search");
  const [searchLogs, setSearchLogs] = useState<SearchLog[]>([]);
  const [changeLogs, setChangeLogs] = useState<ChangeLog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/history?type=${tab}`)
      .then((r) => r.json())
      .then((json) => {
        if (tab === "search") setSearchLogs(json.logs ?? []);
        else setChangeLogs(json.logs ?? []);
      })
      .finally(() => setLoading(false));
  }, [tab]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-semibold">ประวัติการใช้งาน</h1>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setTab("search")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === "search"
              ? "bg-zinc-900 text-white"
              : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-100"
          }`}
        >
          ประวัติการค้นหา
        </button>
        <button
          onClick={() => setTab("changes")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === "changes"
              ? "bg-zinc-900 text-white"
              : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-100"
          }`}
        >
          ประวัติการแก้ไขข้อมูล
        </button>
      </div>

      {loading && <p className="mt-6 text-sm text-zinc-500">กำลังโหลด...</p>}

      {!loading && tab === "search" && (
        <div className="mt-6 space-y-3">
          {searchLogs.length === 0 && <p className="text-sm text-zinc-500">ยังไม่มีประวัติการค้นหา</p>}
          {searchLogs.map((log) => (
            <div key={log.id} className="rounded-lg border border-zinc-200 bg-white p-4 text-sm shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <p className="font-medium text-zinc-800">{log.query}</p>
                <span className="whitespace-nowrap text-xs text-zinc-400">
                  {formatDateTime(log.created_at)}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {log.created_by ?? "-"} · {log.mode ? MODE_LABEL[log.mode] ?? log.mode : "ทุกประเภท"} ·
                เจอ {log.result_count} รายการ
                {log.top_similarity != null && ` · ใกล้เคียงสุด ${(log.top_similarity * 100).toFixed(0)}%`}
              </p>
              {log.cr_items && (
                <p className="mt-2 rounded bg-zinc-50 p-2 text-xs text-zinc-600">
                  ผลลัพธ์ที่ใกล้เคียงที่สุด: [{log.cr_items.module ?? "-"}] {log.cr_items.detail}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && tab === "changes" && (
        <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
              <tr>
                <th className="px-3 py-2">เวลา</th>
                <th className="px-3 py-2">โดย</th>
                <th className="px-3 py-2">การเปลี่ยนแปลง</th>
                <th className="px-3 py-2">Module</th>
                <th className="px-3 py-2">Detail</th>
              </tr>
            </thead>
            <tbody>
              {changeLogs.map((log) => {
                const row = log.after ?? log.before;
                return (
                  <tr key={log.id} className="border-b border-zinc-100 align-top">
                    <td className="px-3 py-2 whitespace-nowrap text-zinc-500">
                      {formatDateTime(log.created_at)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-zinc-500">
                      {log.created_by ?? "-"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {ACTION_LABEL[log.action] ?? log.action}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{(row?.module as string) ?? "-"}</td>
                    <td className="max-w-lg px-3 py-2 whitespace-pre-wrap">
                      {(row?.detail as string) ?? "-"}
                    </td>
                  </tr>
                );
              })}
              {changeLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-zinc-500">
                    ยังไม่มีประวัติการแก้ไขข้อมูล
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
