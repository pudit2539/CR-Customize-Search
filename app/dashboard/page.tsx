"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Download,
  LayoutDashboard,
  List,
  Search,
  SlidersHorizontal,
  TrendingUp,
  Users,
} from "lucide-react";
import AnimatedNumber from "@/components/AnimatedNumber";
import Autocomplete from "@/components/Autocomplete";
import { allCategories } from "@/lib/moduleCategories";
import { fetchCached, peekCache } from "@/lib/dataCache";
import { SOURCE_TYPE_LABEL } from "@/lib/format";

interface CategoryCount {
  category: string;
  new_customer: number;
  existing_customer: number;
}

interface ClientCount {
  name: string;
  total: number;
  new_customer: number;
  existing_customer: number;
  totalMd: number;
  totalCost: number;
}

interface DashboardData {
  totalItems: number;
  bySourceType: { new_customer: number; existing_customer: number };
  byCategory: CategoryCount[];
  byClient: ClientCount[];
  totalSearches: number;
}

// Semantic (not brand) colors: new vs existing customer keep the same hues
// everywhere they appear — chart segments, badges, table figures.
const NEW_COLOR = "#2a78d6";
const EXISTING_COLOR = "#1baf7a";
const DEFAULT_URL = "/api/dashboard?";

function pct(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export default function DashboardPage() {
  const router = useRouter();
  // Seeded from the last visit's data so switching back to this page paints
  // instantly; the mount effect below refreshes it in the background.
  const [data, setData] = useState<DashboardData | null>(() => peekCache<DashboardData>(DEFAULT_URL));
  const [role, setRole] = useState<string | null>(() => peekCache<{ role?: string }>("/api/auth/me")?.role ?? null);
  const [sourceType, setSourceType] = useState("");
  const [category, setCategory] = useState("");
  const [project, setProject] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [filtering, setFiltering] = useState(false);
  const isAdmin = role === "admin";

  const filterParams = {
    ...(sourceType && { source_type: sourceType }),
    ...(category && { category }),
    ...(project && { project }),
  };

  // Accepts a project override so picking an autocomplete suggestion can
  // filter immediately, instead of reading the not-yet-updated `project`
  // state closed over by this render's `load`. `silent` skips the dimming
  // spinner for the background refresh on mount.
  function load(overrides?: { project?: string }, silent = false) {
    setError(null);
    if (!silent) setFiltering(true);
    const params = { ...filterParams, ...(overrides?.project && { project: overrides.project }) };
    fetchCached<DashboardData>(`/api/dashboard?${new URLSearchParams(params).toString()}`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? `โหลดแดชบอร์ดไม่สำเร็จ (${err.message})` : "โหลดแดชบอร์ดไม่สำเร็จ"))
      .finally(() => setFiltering(false));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() clears the error flag for the fetch it starts, not derived/external state
    load(undefined, true);
    fetchCached<{ role?: string }>("/api/auth/me")
      .then((session) => setRole(session?.role ?? null))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredClients = useMemo(() => {
    if (!data) return [];
    return clientSearch
      ? data.byClient.filter((c) => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
      : data.byClient;
  }, [data, clientSearch]);

  if (error && !data) {
    return (
      <div className="px-4 py-6 sm:px-8 sm:py-8">
        <h1 className="text-xl font-semibold text-zinc-900 sm:text-2xl">แดชบอร์ด</h1>
        <div className="mt-6 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          {error}{" "}
          <button onClick={() => load()} className="ml-2 font-medium underline">
            ลองใหม่
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
        <div className="skeleton h-7 w-40 rounded" />
        <div className="skeleton mt-6 h-16 rounded-2xl" />
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="surface-card p-4">
              <div className="skeleton h-9 w-9 rounded-lg" />
              <div className="skeleton mt-3 h-3 w-20 rounded" />
              <div className="skeleton mt-2 h-6 w-14 rounded" />
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="skeleton h-72 rounded-2xl" />
          <div className="skeleton h-72 rounded-2xl lg:col-span-2" />
        </div>
      </div>
    );
  }

  const total = data.totalItems;
  const { new_customer: newCount, existing_customer: existingCount } = data.bySourceType;
  const categories = [...data.byCategory]
    .map((c) => ({ ...c, total: c.new_customer + c.existing_customer }))
    .sort((a, b) => b.total - a.total);
  const maxCategory = Math.max(...categories.map((c) => c.total), 1);
  const maxClient = Math.max(...data.byClient.map((c) => c.total), 1);

  // Donut geometry: r = 15.9155 makes the circumference exactly 100, so
  // stroke-dasharray values are plain percentages.
  const newShare = total > 0 ? (newCount / total) * 100 : 0;
  const existingShare = total > 0 ? (existingCount / total) * 100 : 0;

  function goToCategory(cat: string, st: "new_customer" | "existing_customer") {
    const params = new URLSearchParams({ category: cat, source_type: st, ...(project && { project }) });
    router.push(`/items?${params.toString()}`);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
      <div className="page-header">
        <span className="icon-badge h-11 w-11 shrink-0">
          <LayoutDashboard size={20} />
        </span>
        <div>
          <h1>แดชบอร์ด</h1>
          <p>ภาพรวมรายการ CR/Customize ทั้งหมด แยกตามประเภท หมวด และลูกค้า</p>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Filter toolbar */}
      <div className="surface-card mt-6 p-3 sm:p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <select value={sourceType} onChange={(e) => setSourceType(e.target.value)} className="control">
            <option value="">ทุกประเภท</option>
            <option value="new_customer">{SOURCE_TYPE_LABEL.new_customer}</option>
            <option value="existing_customer">{SOURCE_TYPE_LABEL.existing_customer}</option>
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="control">
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
            className="control w-full sm:w-52"
          />
          <button onClick={() => load()} disabled={filtering} className="btn btn-primary w-full sm:w-auto">
            {filtering ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              <SlidersHorizontal size={14} />
            )}
            {filtering ? "กำลังกรอง..." : "กรองข้อมูล"}
          </button>
          <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row">
            <a href={`/items?${new URLSearchParams(filterParams).toString()}`} className="btn btn-secondary">
              <List size={15} />
              ดูรายการที่กรอง
            </a>
            {isAdmin && (
              <a href={`/api/export?${new URLSearchParams(filterParams).toString()}`} className="btn btn-secondary">
                <Download size={15} />
                Export
              </a>
            )}
          </div>
        </div>
      </div>

      <div className={`transition-opacity duration-200 ${filtering ? "opacity-40" : "opacity-100"}`}>
        {/* KPI row */}
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div
            className="fade-up relative overflow-hidden rounded-[var(--radius-card)] p-4 text-white shadow-lg shadow-red-200/60"
            style={{ background: "var(--brand-gradient)" }}
          >
            <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-white/10" />
            <div className="pointer-events-none absolute -right-2 -bottom-12 h-28 w-28 rounded-full bg-white/5" />
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
              <List size={17} />
            </span>
            <p className="mt-3 text-xs font-medium tracking-wide text-red-100 uppercase">รายการทั้งหมด</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
              <AnimatedNumber value={total} />
            </p>
            <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-white/20">
              <div className="bar-grow-x bg-white/90" style={{ width: `${newShare}%` }} />
            </div>
            <p className="mt-1.5 text-[11px] text-red-100">
              {SOURCE_TYPE_LABEL.new_customer} {pct(newCount, total)}% · {SOURCE_TYPE_LABEL.existing_customer}{" "}
              {pct(existingCount, total)}%
            </p>
          </div>

          {[
            {
              label: SOURCE_TYPE_LABEL.new_customer,
              value: newCount,
              icon: Users,
              color: NEW_COLOR,
              tint: "bg-blue-50 text-blue-600",
              share: pct(newCount, total),
            },
            {
              label: SOURCE_TYPE_LABEL.existing_customer,
              value: existingCount,
              icon: Building2,
              color: EXISTING_COLOR,
              tint: "bg-emerald-50 text-emerald-600",
              share: pct(existingCount, total),
            },
            {
              label: "ค้นหาสะสม",
              value: data.totalSearches,
              icon: Search,
              color: "#d97706",
              tint: "bg-amber-50 text-amber-600",
              share: null as number | null,
            },
          ].map((k, i) => (
            <div
              key={k.label}
              style={{ animationDelay: `${(i + 1) * 60}ms` }}
              className="stat-tile fade-up relative overflow-hidden transition-transform hover:-translate-y-0.5"
            >
              <span className="absolute inset-y-0 left-0 w-1" style={{ background: k.color }} />
              <div className="flex items-start justify-between">
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${k.tint}`}>
                  <k.icon size={17} />
                </span>
                {k.share != null && <span className="badge badge-neutral">{k.share}%</span>}
              </div>
              <p className="field-label mt-3">{k.label}</p>
              <p className="stat-value">
                <AnimatedNumber value={k.value} />
              </p>
            </div>
          ))}
        </div>

        {/* Split donut + category breakdown */}
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <section className="surface-card fade-up p-5" style={{ animationDelay: "120ms" }}>
            <h2 className="section-title">
              <TrendingUp size={13} />
              สัดส่วนตามประเภทลูกค้า
            </h2>
            <div className="relative mx-auto mt-5 h-44 w-44">
              <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#eef0f5" strokeWidth="3.4" />
                <circle
                  cx="18"
                  cy="18"
                  r="15.9155"
                  fill="none"
                  stroke={NEW_COLOR}
                  strokeWidth="3.4"
                  strokeDasharray={`${newShare} ${100 - newShare}`}
                  strokeDashoffset="0"
                  style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.22,1,0.36,1)" }}
                />
                <circle
                  cx="18"
                  cy="18"
                  r="15.9155"
                  fill="none"
                  stroke={EXISTING_COLOR}
                  strokeWidth="3.4"
                  strokeDasharray={`${existingShare} ${100 - existingShare}`}
                  strokeDashoffset={`${-newShare}`}
                  style={{
                    transition:
                      "stroke-dasharray 0.8s cubic-bezier(0.22,1,0.36,1), stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1)",
                  }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">
                  <AnimatedNumber value={total} />
                </span>
                <span className="field-label mt-0.5">รายการ</span>
              </div>
            </div>
            <ul className="mt-5 space-y-2 text-sm">
              {[
                { label: SOURCE_TYPE_LABEL.new_customer, value: newCount, color: NEW_COLOR },
                { label: SOURCE_TYPE_LABEL.existing_customer, value: existingCount, color: EXISTING_COLOR },
              ].map((r) => (
                <li key={r.label} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="flex items-center gap-2 text-slate-600">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
                    {r.label}
                  </span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {r.value.toLocaleString()}
                    <span className="ml-1.5 text-xs font-medium text-slate-400">{pct(r.value, total)}%</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="surface-card fade-up p-5 lg:col-span-2" style={{ animationDelay: "180ms" }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="section-title">
                <LayoutDashboard size={13} />
                รายการตามหมวด
              </h2>
              <div className="flex gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: NEW_COLOR }} />
                  {SOURCE_TYPE_LABEL.new_customer}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: EXISTING_COLOR }} />
                  {SOURCE_TYPE_LABEL.existing_customer}
                </span>
              </div>
            </div>
            <ul className="mt-4 space-y-2.5">
              {categories.map((c, i) => (
                <li key={c.category} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 truncate text-slate-600 sm:w-36" title={c.category}>
                    {c.category}
                  </span>
                  <div className="flex h-7 flex-1 overflow-hidden rounded-lg bg-slate-100">
                    <div className="flex h-full min-w-0" style={{ width: `${(c.total / maxCategory) * 100}%` }}>
                      {c.new_customer > 0 && (
                        <button
                          onClick={() => goToCategory(c.category, "new_customer")}
                          title={`${SOURCE_TYPE_LABEL.new_customer}: ${c.new_customer}`}
                          className="bar-grow-x flex h-full items-center justify-center text-[11px] font-semibold text-white transition-[filter] hover:brightness-110"
                          style={{
                            width: `${(c.new_customer / c.total) * 100}%`,
                            background: NEW_COLOR,
                            animationDelay: `${i * 40}ms`,
                          }}
                        >
                          {c.new_customer / maxCategory > 0.06 ? c.new_customer : ""}
                        </button>
                      )}
                      {c.existing_customer > 0 && (
                        <button
                          onClick={() => goToCategory(c.category, "existing_customer")}
                          title={`${SOURCE_TYPE_LABEL.existing_customer}: ${c.existing_customer}`}
                          className="bar-grow-x flex h-full items-center justify-center text-[11px] font-semibold text-white transition-[filter] hover:brightness-110"
                          style={{
                            width: `${(c.existing_customer / c.total) * 100}%`,
                            background: EXISTING_COLOR,
                            animationDelay: `${i * 40 + 60}ms`,
                          }}
                        >
                          {c.existing_customer / maxCategory > 0.06 ? c.existing_customer : ""}
                        </button>
                      )}
                    </div>
                  </div>
                  <span className="w-10 shrink-0 text-right font-semibold text-slate-900 tabular-nums">{c.total}</span>
                </li>
              ))}
              {categories.length === 0 && <li className="py-8 text-center text-sm text-slate-400">ไม่มีข้อมูล</li>}
            </ul>
            <p className="mt-3 text-xs text-slate-400">คลิกแถบสีเพื่อดูรายการในหมวดและประเภทนั้น</p>
          </section>
        </div>

        {/* Clients */}
        <section className="surface-card fade-up mt-4 overflow-hidden" style={{ animationDelay: "240ms" }}>
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div>
              <h2 className="section-title">
                <Building2 size={13} />
                รายละเอียดตามลูกค้า/โปรเจกต์
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                ทั้งหมด {data.byClient.length} เจ้า — คลิกชื่อเพื่อดูรายการของลูกค้านั้น
              </p>
            </div>
            <div className="relative w-full sm:w-60">
              <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
              <input
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder="ค้นหาชื่อลูกค้า..."
                className="control w-full pl-8"
              />
            </div>
          </div>

          <div className="border-t border-[var(--hairline)] sm:max-h-[28rem] sm:overflow-y-auto">
            <table className="table-responsive data-table w-full text-left text-sm">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="px-5 py-3">ลูกค้า/โปรเจกต์</th>
                  <th className="px-3 py-3">รายการ</th>
                  <th className="px-3 py-3 text-right">{SOURCE_TYPE_LABEL.new_customer}</th>
                  <th className="px-3 py-3 text-right">{SOURCE_TYPE_LABEL.existing_customer}</th>
                  <th className="px-3 py-3 text-right">รวม MD</th>
                  <th className="px-5 py-3 text-right">รวม Cost</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((c) => (
                  <tr key={c.name}>
                    <td data-label="ลูกค้า/โปรเจกต์" className="px-5 py-3">
                      <button
                        onClick={() => router.push(`/items?project=${encodeURIComponent(c.name)}`)}
                        className="text-left font-medium text-slate-800 hover:text-[var(--brand)] hover:underline"
                      >
                        {c.name}
                      </button>
                    </td>
                    <td data-label="รายการ" className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <span className="w-8 font-semibold text-slate-900 tabular-nums">{c.total}</span>
                        <div className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-slate-100 sm:flex">
                          <div className="flex h-full" style={{ width: `${(c.total / maxClient) * 100}%` }}>
                            <div style={{ width: `${(c.new_customer / c.total) * 100}%`, background: NEW_COLOR }} />
                            <div
                              style={{ width: `${(c.existing_customer / c.total) * 100}%`, background: EXISTING_COLOR }}
                            />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td data-label={SOURCE_TYPE_LABEL.new_customer} className="num px-3 py-3 text-blue-700">
                      {c.new_customer || "-"}
                    </td>
                    <td data-label={SOURCE_TYPE_LABEL.existing_customer} className="num px-3 py-3 text-emerald-700">
                      {c.existing_customer || "-"}
                    </td>
                    <td data-label="รวม MD" className="num px-3 py-3 text-slate-600">
                      {c.totalMd || "-"}
                    </td>
                    <td data-label="รวม Cost" className="num px-5 py-3 font-medium text-slate-800">
                      {c.totalCost ? c.totalCost.toLocaleString() : "-"}
                    </td>
                  </tr>
                ))}
                {filteredClients.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                      ไม่พบลูกค้าที่ตรงกับคำค้นหา
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
