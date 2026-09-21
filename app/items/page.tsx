"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Eye, Pencil, Plus, Search, SlidersHorizontal } from "lucide-react";
import Autocomplete from "@/components/Autocomplete";
import ItemDetailModal from "@/components/ItemDetailModal";
import ItemFormModal from "@/components/ItemFormModal";
import MdMatrix from "@/components/MdMatrix";
import { allCategories, categoryOf } from "@/lib/moduleCategories";
import { SOURCE_TYPE_LABEL } from "@/lib/format";
import type { CrItemRow } from "@/lib/types";

const MODE_LABEL = SOURCE_TYPE_LABEL;

const MODE_BADGE: Record<string, string> = {
  new_customer: "bg-blue-50 text-blue-700 ring-1 ring-blue-100",
  existing_customer: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
};

const MODULE_COLORS = [
  "bg-violet-100 text-violet-700",
  "bg-sky-100 text-sky-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-teal-100 text-teal-700",
];

function moduleColor(module: string | null) {
  if (!module) return "bg-zinc-100 text-zinc-500";
  const idx = module.charCodeAt(0) % MODULE_COLORS.length;
  return MODULE_COLORS[idx];
}

export default function ItemsPage() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<CrItemRow[]>([]);
  const [keyword, setKeyword] = useState("");
  // Pre-applied when arriving from a dashboard bar click
  // (/items?category=...&source_type=...).
  const [sourceType, setSourceType] = useState(searchParams.get("source_type") ?? "");
  const [category, setCategory] = useState(searchParams.get("category") ?? "");
  const [project, setProject] = useState(searchParams.get("project") ?? "");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<CrItemRow>>({});
  const [role, setRole] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<CrItemRow | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const isAdmin = role === "admin";

  // Category groups Module codes (TM, BN, ...) into business-level buckets —
  // there aren't enough distinct categories to justify a server-side filter,
  // so this narrows the already-fetched list client-side.
  const visibleItems = useMemo(
    () => (category ? items.filter((i) => categoryOf(i.module) === category) : items),
    [items, category]
  );

  // Accepts overrides so picking an autocomplete suggestion can search with
  // that value immediately — setKeyword/setProject wouldn't be visible here
  // yet since state updates land on the next render.
  async function load(overrides?: { keyword?: string; project?: string }) {
    setLoading(true);
    const params = new URLSearchParams();
    const effectiveKeyword = overrides?.keyword ?? keyword;
    const effectiveProject = overrides?.project ?? project;
    if (effectiveKeyword) params.set("keyword", effectiveKeyword);
    if (sourceType) params.set("source_type", sourceType);
    if (effectiveProject) params.set("project", effectiveProject);
    const res = await fetch(`/api/items?${params.toString()}`);
    const json = await res.json();
    setItems(json.items ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((session) => setRole(session?.role ?? null));
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

  async function removeFromModal(id: string) {
    await fetch(`/api/items/${id}`, { method: "DELETE" });
    setDetailItem(null);
    load();
  }

  return (
    <div className="px-8 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-zinc-900">รายการ CR/Customize ทั้งหมด</h1>
        {isAdmin && (
          <div className="flex gap-2">
            <a
              href={`/api/export?${new URLSearchParams({
                ...(sourceType && { source_type: sourceType }),
                ...(category && { category }),
                ...(project && { project }),
              }).toString()}`}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              <Download size={15} />
              Export
            </a>
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <Plus size={15} />
              เพิ่มรายการใหม่
            </button>
          </div>
        )}
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-100 bg-white shadow-sm shadow-zinc-200/60">
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 p-4">
          <span className="mr-1 text-sm font-semibold text-zinc-900">
            รายการ <span className="font-normal text-zinc-400">ทั้งหมด {visibleItems.length}</span>
          </span>
          <div className="relative w-56">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 z-10 text-zinc-400" />
            <Autocomplete
              value={keyword}
              onChange={setKeyword}
              onSubmit={(v) => load({ keyword: v })}
              suggestionType="query"
              placeholder="ค้นหาคำในรายละเอียด..."
              className="w-56 rounded-lg border border-zinc-200 bg-white py-2 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
            />
          </div>
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600"
          >
            <option value="">ทุกประเภท</option>
            <option value="new_customer">{SOURCE_TYPE_LABEL.new_customer}</option>
            <option value="existing_customer">{SOURCE_TYPE_LABEL.existing_customer}</option>
          </select>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600"
          >
            <option value="">ทุกหมวด</option>
            {allCategories().map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <Autocomplete
            value={project}
            onChange={setProject}
            onSubmit={(v) => load({ project: v })}
            suggestionType="project"
            placeholder="ชื่อโปรเจกต์/ลูกค้า..."
            className="w-48 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
          />
          <button
            onClick={() => load()}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <SlidersHorizontal size={14} />
            ค้นหา
          </button>
        </div>

        {loading ? (
          <div className="animate-pulse p-4">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 border-t border-zinc-100 py-3 first:border-t-0">
                <div className="h-9 w-9 shrink-0 rounded-lg bg-zinc-100" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-2/3 rounded bg-zinc-200" />
                  <div className="h-3 w-1/4 rounded bg-zinc-100" />
                </div>
                <div className="h-5 w-16 rounded-full bg-zinc-100" />
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-medium">รายการ</th>
                  <th className="px-4 py-3 font-medium">ประเภท</th>
                  <th className="px-4 py-3 font-medium">หมวด</th>
                  <th className="px-3 py-3 font-medium whitespace-nowrap">MD</th>
                  <th className="px-3 py-3 text-right font-medium whitespace-nowrap">รวม MD</th>
                  <th className="px-4 py-3 font-medium">Project</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => (
                  <tr key={item.id} className="border-t border-zinc-100 align-top hover:bg-zinc-50/60">
                    <td className="max-w-md px-4 py-3">
                      <div className="flex items-start gap-3">
                        <span
                          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${moduleColor(item.module)}`}
                        >
                          {(item.module ?? "-").slice(0, 2)}
                        </span>
                        <div className="min-w-0">
                          {editingId === item.id ? (
                            <textarea
                              value={draft.detail ?? ""}
                              onChange={(e) => setDraft({ ...draft, detail: e.target.value })}
                              rows={3}
                              className="w-full rounded border border-zinc-300 p-1 text-sm"
                            />
                          ) : (
                            <p className="line-clamp-2 font-medium text-zinc-900">{item.detail}</p>
                          )}
                          <p className="mt-0.5 text-xs text-zinc-400">No.{item.item_no ?? "-"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${MODE_BADGE[item.source_type]}`}>
                        {MODE_LABEL[item.source_type]}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-zinc-500">{categoryOf(item.module)}</td>
                    <td className="px-3 py-3">
                      <MdMatrix breakdown={item.md_breakdown} />
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap font-medium text-zinc-900">
                      {item.md_summary ?? "-"}
                    </td>
                    <td className="max-w-xs px-4 py-3 truncate text-zinc-500">{item.project ?? "-"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
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
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setDetailItem(item)}
                            title="ดูรายละเอียด"
                            className="rounded-lg bg-indigo-600 p-2 text-white hover:bg-indigo-700"
                          >
                            <Eye size={14} />
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => startEdit(item)}
                              title="แก้ไข"
                              className="rounded-lg border border-zinc-200 p-2 text-zinc-500 hover:bg-zinc-50"
                            >
                              <Pencil size={14} />
                            </button>
                          )}
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

      {detailItem && (
        <ItemDetailModal
          item={detailItem}
          onClose={() => setDetailItem(null)}
          canDelete={isAdmin}
          onDelete={() => removeFromModal(detailItem.id)}
        />
      )}

      {showAddForm && (
        <ItemFormModal
          onClose={() => setShowAddForm(false)}
          onSaved={() => {
            setShowAddForm(false);
            load();
          }}
        />
      )}
    </div>
  );
}
