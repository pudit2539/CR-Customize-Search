"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  type ChartEvent,
  type ActiveElement,
} from "chart.js";
import { Building2, Download, LayoutDashboard, List, Search, SlidersHorizontal, Users } from "lucide-react";
import Autocomplete from "@/components/Autocomplete";
import { allCategories } from "@/lib/moduleCategories";
import { SOURCE_TYPE_LABEL } from "@/lib/format";

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

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

const NEW_COLOR = "#2a78d6";
const EXISTING_COLOR = "#1baf7a";

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState("");
  const [category, setCategory] = useState("");
  const [project, setProject] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [filtering, setFiltering] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const isAdmin = role === "admin";

  const filterParams = {
    ...(sourceType && { source_type: sourceType }),
    ...(category && { category }),
    ...(project && { project }),
  };

  // Accepts a project override so picking an autocomplete suggestion can
  // filter immediately, instead of reading the not-yet-updated `project`
  // state closed over by this render's `load`.
  function load(overrides?: { project?: string }) {
    setError(null);
    setFiltering(true);
    const params = { ...filterParams, ...(overrides?.project && { project: overrides.project }) };
    fetch(`/api/dashboard?${new URLSearchParams(params).toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`โหลดแดชบอร์ดไม่สำเร็จ (${r.status})`);
        return r.json();
      })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "โหลดแดชบอร์ดไม่สำเร็จ"))
      .finally(() => setFiltering(false));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() clears the error flag for the fetch it starts, not derived/external state
    load();
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((session) => setRole(session?.role ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!data || !canvasRef.current) return;

    chartRef.current?.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: "bar",
      data: {
        labels: data.byCategory.map((c) => c.category),
        datasets: [
          {
            label: SOURCE_TYPE_LABEL.new_customer,
            data: data.byCategory.map((c) => c.new_customer),
            backgroundColor: NEW_COLOR,
            borderRadius: 4,
          },
          {
            label: SOURCE_TYPE_LABEL.existing_customer,
            data: data.byCategory.map((c) => c.existing_customer),
            backgroundColor: EXISTING_COLOR,
            borderRadius: 4,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true, grid: { color: "rgba(137,135,129,0.2)" } },
          y: { stacked: true, grid: { display: false } },
        },
        plugins: { legend: { display: false } },
        onClick: (_event: ChartEvent, elements: ActiveElement[]) => {
          if (elements.length === 0) return;
          const { datasetIndex, index } = elements[0];
          const barCategory = data.byCategory[index]?.category;
          const barSourceType = datasetIndex === 0 ? "new_customer" : "existing_customer";
          if (barCategory) {
            const params = new URLSearchParams({
              category: barCategory,
              source_type: barSourceType,
              ...(project && { project }),
            });
            router.push(`/items?${params.toString()}`);
          }
        },
      },
    });

    return () => chartRef.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, router]);

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
      <div className="animate-pulse px-4 py-6 sm:px-8 sm:py-8">
        <div className="h-7 w-40 rounded bg-zinc-200" />
        <div className="mt-6 h-16 rounded-2xl border border-zinc-100 bg-white shadow-sm shadow-zinc-200/60" />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm shadow-zinc-200/60">
              <div className="h-9 w-9 rounded-lg bg-zinc-100" />
              <div className="mt-3 h-3 w-20 rounded bg-zinc-100" />
              <div className="mt-2 h-6 w-14 rounded bg-zinc-200" />
            </div>
          ))}
        </div>
        <div className="mt-4 h-72 rounded-2xl border border-zinc-100 bg-white shadow-sm shadow-zinc-200/60" />
      </div>
    );
  }

  const filteredClients = clientSearch
    ? data.byClient.filter((c) => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
    : data.byClient;

  const kpis = [
    {
      label: "รายการทั้งหมด",
      value: data.totalItems,
      icon: List,
      card: "bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-200",
      iconTint: "bg-white/20 text-white",
      labelTint: "text-indigo-100",
    },
    {
      label: SOURCE_TYPE_LABEL.new_customer,
      value: data.bySourceType.new_customer,
      icon: Users,
      card: "bg-white text-zinc-900 border border-blue-100 shadow-sm shadow-zinc-200/60",
      iconTint: "bg-blue-50 text-blue-600",
      labelTint: "text-zinc-500",
    },
    {
      label: SOURCE_TYPE_LABEL.existing_customer,
      value: data.bySourceType.existing_customer,
      icon: Building2,
      card: "bg-white text-zinc-900 border border-emerald-100 shadow-sm shadow-zinc-200/60",
      iconTint: "bg-emerald-50 text-emerald-600",
      labelTint: "text-zinc-500",
    },
    {
      label: "ค้นหาสะสม",
      value: data.totalSearches,
      icon: Search,
      card: "bg-white text-zinc-900 border border-amber-100 shadow-sm shadow-zinc-200/60",
      iconTint: "bg-amber-50 text-amber-600",
      labelTint: "text-zinc-500",
    },
  ];

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
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

      <div className="mt-6 surface-card p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex flex-col gap-2 sm:flex-row">
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
          </div>
          <Autocomplete
            value={project}
            onChange={setProject}
            onSubmit={(v) => load({ project: v })}
            suggestionType="project"
            placeholder="ชื่อโปรเจกต์/ลูกค้า..."
            className="control w-full sm:w-48"
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
            <a
              href={`/items?${new URLSearchParams(filterParams).toString()}`}
              className="btn btn-secondary"
            >
              ดูรายการที่กรอง
            </a>
            {isAdmin && (
              <a
                href={`/api/export?${new URLSearchParams(filterParams).toString()}`}
                className="btn btn-secondary"
              >
                <Download size={15} />
                Export
              </a>
            )}
          </div>
        </div>
      </div>

      <div className={`transition-opacity duration-200 ${filtering ? "opacity-40" : "opacity-100"}`}>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className={`rounded-2xl p-4 transition-transform hover:-translate-y-0.5 ${k.card}`}>
            <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${k.iconTint}`}>
              <k.icon size={17} />
            </span>
            <p className={`mt-3 text-xs ${k.labelTint}`}>{k.label}</p>
            <p className="mt-1 text-2xl font-semibold">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm shadow-zinc-200/60">
        <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: NEW_COLOR }} />
            {SOURCE_TYPE_LABEL.new_customer}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: EXISTING_COLOR }} />
            {SOURCE_TYPE_LABEL.existing_customer}
          </span>
        </div>
        <div
          className="relative mt-4 w-full"
          style={{ height: Math.max(data.byCategory.length * 40 + 80, 240) }}
        >
          <canvas ref={canvasRef} role="img" aria-label="จำนวนรายการ CR/Customize แยกตามหมวดและประเภทลูกค้า" />
        </div>
        <p className="mt-2 text-xs text-zinc-400">คลิกแถบเพื่อดูรายการในหมวดนั้น</p>
      </div>

      <div className="mt-4 surface-card p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">รายละเอียดตามลูกค้า/โปรเจกต์</h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              ทั้งหมด {data.byClient.length} เจ้า — คลิกชื่อเพื่อดูรายการของลูกค้านั้น
            </p>
          </div>
          <div className="relative w-full sm:w-56">
            <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-400" />
            <input
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              placeholder="ค้นหาชื่อลูกค้า..."
              className="control w-full pl-8"
            />
          </div>
        </div>

        <div className="mt-4 sm:max-h-96 sm:overflow-y-auto">
          <table className="table-responsive w-full text-left text-sm">
            <thead className="sticky top-0 bg-white text-xs text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-medium">ลูกค้า/โปรเจกต์</th>
                <th className="px-3 py-2 text-right font-medium">รวมรายการ</th>
                <th className="px-3 py-2 text-right font-medium">{SOURCE_TYPE_LABEL.new_customer}</th>
                <th className="px-3 py-2 text-right font-medium">{SOURCE_TYPE_LABEL.existing_customer}</th>
                <th className="px-3 py-2 text-right font-medium">รวม MD</th>
                <th className="px-3 py-2 text-right font-medium">รวม Cost</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((c) => (
                <tr key={c.name} className="border-t border-zinc-100 hover:bg-zinc-50/60">
                  <td data-label="ลูกค้า/โปรเจกต์" className="px-3 py-2">
                    <button
                      onClick={() => router.push(`/items?project=${encodeURIComponent(c.name)}`)}
                      className="text-left text-zinc-800 hover:text-zinc-900 hover:underline"
                    >
                      {c.name}
                    </button>
                  </td>
                  <td data-label="รวมรายการ" className="px-3 py-2 text-right font-medium text-zinc-900">{c.total}</td>
                  <td data-label={SOURCE_TYPE_LABEL.new_customer} className="px-3 py-2 text-right text-blue-700">{c.new_customer || "-"}</td>
                  <td data-label={SOURCE_TYPE_LABEL.existing_customer} className="px-3 py-2 text-right text-emerald-700">{c.existing_customer || "-"}</td>
                  <td data-label="รวม MD" className="px-3 py-2 text-right text-zinc-600">{c.totalMd || "-"}</td>
                  <td data-label="รวม Cost" className="px-3 py-2 text-right text-zinc-600">
                    {c.totalCost ? c.totalCost.toLocaleString() : "-"}
                  </td>
                </tr>
              ))}
              {filteredClients.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-zinc-400">
                    ไม่พบลูกค้าที่ตรงกับคำค้นหา
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  );
}
