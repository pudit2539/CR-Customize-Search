"use client";

import { useEffect, useState } from "react";
import type { CrItemRow } from "@/lib/types";

const MODE_LABEL: Record<string, string> = {
  new_customer: "ลูกค้าใหม่",
  existing_customer: "ลูกค้าเดิม",
};

export default function ItemsPage() {
  const [items, setItems] = useState<CrItemRow[]>([]);
  const [keyword, setKeyword] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<CrItemRow>>({});

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (keyword) params.set("keyword", keyword);
    if (sourceType) params.set("source_type", sourceType);
    const res = await fetch(`/api/items?${params.toString()}`);
    const json = await res.json();
    setItems(json.items ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startEdit(item: CrItemRow) {
    setEditingId(item.id);
    setDraft({ detail: item.detail, remark: item.remark ?? "" });
  }

  async function saveEdit() {
    if (!editingId) return;
    await fetch(`/api/items/${editingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    setEditingId(null);
    load();
  }

  async function remove(id: string) {
    if (!confirm("ลบรายการนี้?")) return;
    await fetch(`/api/items/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-semibold">รายการ CR/Customize ทั้งหมด</h1>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="ค้นหาคำในรายละเอียด..."
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm"
        />
        <select
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm"
        >
          <option value="">ทุกประเภท</option>
          <option value="new_customer">ลูกค้าใหม่</option>
          <option value="existing_customer">ลูกค้าเดิม</option>
        </select>
        <button
          onClick={load}
          className="rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white"
        >
          ค้นหา
        </button>
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-zinc-500">กำลังโหลด...</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
              <tr>
                <th className="px-3 py-2">No.</th>
                <th className="px-3 py-2">ประเภท</th>
                <th className="px-3 py-2">Module</th>
                <th className="px-3 py-2">Detail</th>
                <th className="px-3 py-2">MD</th>
                <th className="px-3 py-2">Project</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-zinc-100 align-top">
                  <td className="px-3 py-2 text-zinc-500">{item.item_no ?? "-"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-zinc-500">
                    {MODE_LABEL[item.source_type]}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{item.module ?? "-"}</td>
                  <td className="max-w-md px-3 py-2">
                    {editingId === item.id ? (
                      <textarea
                        value={draft.detail ?? ""}
                        onChange={(e) => setDraft({ ...draft, detail: e.target.value })}
                        rows={3}
                        className="w-full rounded border border-zinc-300 p-1 text-sm"
                      />
                    ) : (
                      <span className="whitespace-pre-wrap">{item.detail}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{item.md_summary ?? "-"}</td>
                  <td className="max-w-xs px-3 py-2">{item.project ?? "-"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {editingId === item.id ? (
                      <div className="flex gap-2">
                        <button onClick={saveEdit} className="text-emerald-600 hover:underline">
                          บันทึก
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-zinc-500 hover:underline"
                        >
                          ยกเลิก
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEdit(item)}
                          className="text-zinc-600 hover:underline"
                        >
                          แก้ไข
                        </button>
                        <button
                          onClick={() => remove(item.id)}
                          className="text-red-600 hover:underline"
                        >
                          ลบ
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
