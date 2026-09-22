"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Eye, List, Pencil, Plus, Search, SlidersHorizontal } from "lucide-react";
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
  const [error, setError] = useState<string | null>(null);
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
    setError(null);
    const params = new URLSearchParams();
    const effectiveKeyword = overrides?.keyword ?? keyword;
    const effectiveProject = overrides?.project ?? project;
    if (effectiveKeyword) params.set("keyword", effectiveKeyword);
    if (sourceType) params.set("source_type", sourceType);
    if (effectiveProject) params.set("project", effectiveProject);
    try {
      const res = await fetch(`/api/items?${params.toString()}`);
      if (!res.ok) throw new Error(`โหลดรายการไม่สำเร็จ (${res.status})`);
      const json = await res.json();
      setItems(json.items ?? []);
    } catch (err) {
      setItems([]);
      setError(err instanceof Error ? err.message : "โหลดรายการไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets the loading flag for the fetch it starts, not derived/external state
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
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="page-header">
          <span className="icon-badge h-11 w-11 shrink-0">
            <List size={20} />
          </span>
          <div>
            <h1>รายการ CR/Customize ทั้งหมด</h1>
            <p>ดูและจัดการรายการ CR/Customize ทั้งหมดที่เคยทำ</p>
          </div>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <a
              href={`/api/export?${new URLSearchParams({
                ...(sourceType && { source_type: sourceType }),
                ...(category && { category }),
                ...(project && { project }),
              }).toString()}`}
              className="btn btn-secondary flex-1 sm:flex-none"
            >
              <Download size={15} />
              Export
            </a>
            <button onClick={() => setShowAddForm(true)} className="btn btn-primary flex-1 sm:flex-none">
              <Plus size={15} />
              เพิ่มรายการใหม่
            </button>
          </div>
        )}
      </div>

      <div className="mt-6 surface-card">
        <div className="flex flex-col gap-2 border-b border-zinc-100 p-4 sm:flex-row sm:flex-wrap sm:items-center">
          <span className="mr-1 text-sm font-semibold text-zinc-900">
            รายการ <span className="font-normal text-zinc-400">ทั้งหมด {visibleItems.length}</span>
          </span>
          <div className="relative w-full sm:w-56">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 z-10 text-zinc-400" />
            <Autocomplete
              value={keyword}
              onChange={setKeyword}
              onSubmit={(v) => load({ keyword: v })}
              suggestionType="query"
              placeholder="ค้นหาคำในรายละเอียด..."
              className="control w-full pl-8"
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              className="control"
            >
              <option value="">ทุกประเภท</option>
              <option value="new_customer">{SOURCE_TYPE_LABEL.new_customer}</option>
              <option value="existing_customer">{SOURCE_TYPE_LABEL.existing_customer}</option>
            </select>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="control"
            >
              <option value="">ทุกหมวด</option>
              {allCategories().map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <Autocomplete
            value={project}
            onChange={setProject}
            onSubmit={(v) => load({ project: v })}
            suggestionType="project"
            placeholder="ชื่อโปรเจกต์/ลูกค้า..."
            className="control w-full sm:w-48"
          />
          <button onClick={() => load()} className="btn btn-primary w-full sm:w-auto">
            <SlidersHorizontal size={14} />
            ค้นหา
          </button>
        </div>

        {error && (
          <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

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
        ) : visibleItems.length === 0 ? (
          <p className="p-6 text-center text-sm text-zinc-400">ไม่พบรายการ</p>
        ) : (
          <div className="p-3 sm:overflow-x-auto sm:p-0">
            <table className="table-responsive w-full text-left text-sm">
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
                  <tr key={item.id} className="border-t border-zinc-100 align-top hover:bg-zinc-50/60 sm:border-t">
                    <td data-label="รายการ" className="max-w-md px-4 py-3">
                      <div className="flex items-start gap-3">
                        <span
                          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${moduleColor(item.module)}`}
                        >
                          {(item.module ?? "-").slice(0, 2)}
                        </span>
                        <div className="min-w-0 text-left">
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
                    <td data-label="ประเภท" className="px-4 py-3 whitespace-nowrap">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${MODE_BADGE[item.source_type]}`}>
                        {MODE_LABEL[item.source_type]}
                      </span>
                    </td>
                    <td data-label="หมวด" className="px-4 py-3 whitespace-nowrap text-zinc-500">{categoryOf(item.module)}</td>
                    <td data-label="MD" className="px-3 py-3">
                      <MdMatrix breakdown={item.md_breakdown} />
                    </td>
                    <td data-label="รวม MD" className="px-3 py-3 text-right whitespace-nowrap font-medium text-zinc-900">
                      {item.md_summary ?? "-"}
                    </td>
                    <td data-label="Project" className="max-w-xs px-4 py-3 truncate text-zinc-500">{item.project ?? "-"}</td>
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
                            className="rounded-lg bg-[var(--brand)] p-2 text-white hover:bg-[var(--brand-dark)]"
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
