"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertCircle, Lightbulb, RotateCcw, Search, TrendingUp } from "lucide-react";

interface TopQuery {
  query: string;
  count: number;
  avg_similarity: number | null;
  last_at: string;
}

interface WeakSearch {
  query: string;
  top_similarity: number | null;
  created_at: string;
}

interface InsightsData {
  totalSearches: number;
  searchesLast7Days: number;
  avgTopSimilarity: number | null;
  weakSearchCount: number;
  topQueries: TopQuery[];
  weakSearches: WeakSearch[];
  perDay: { day: string; count: number }[];
  topModules: { module: string; count: number }[];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", { dateStyle: "short" });
}

export default function InsightsPage() {
  const router = useRouter();
  const [data, setData] = useState<InsightsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/insights")
      .then((r) => {
        if (!r.ok) throw new Error(`โหลด insights ไม่สำเร็จ (${r.status})`);
        return r.json();
      })
      .then((json) => {
        if (json.error) setError(json.error);
        else setData(json);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) {
    return (
      <div className="px-4 py-6 sm:px-8 sm:py-8">
        <h1 className="text-xl font-semibold text-zinc-900 sm:text-2xl">Insights</h1>
        <p className="mt-4 text-sm text-red-600">เกิดข้อผิดพลาด: {error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="animate-pulse px-4 py-6 sm:px-8 sm:py-8">
        <div className="h-7 w-40 rounded bg-zinc-200" />
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm shadow-zinc-200/60">
              <div className="h-9 w-9 rounded-lg bg-zinc-100" />
              <div className="mt-3 h-3 w-20 rounded bg-zinc-100" />
              <div className="mt-2 h-6 w-14 rounded bg-zinc-200" />
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="h-72 rounded-2xl border border-zinc-100 bg-white shadow-sm shadow-zinc-200/60" />
          <div className="h-72 rounded-2xl border border-zinc-100 bg-white shadow-sm shadow-zinc-200/60" />
        </div>
      </div>
    );
  }

  const maxPerDay = Math.max(...data.perDay.map((d) => d.count), 1);
  const maxModule = Math.max(...data.topModules.map((m) => m.count), 1);

  const kpis = [
    { label: "ค้นหาสะสม", value: data.totalSearches, icon: Search, tint: "bg-zinc-100 text-zinc-700" },
    {
      label: "ค้นหา 7 วันล่าสุด",
      value: data.searchesLast7Days,
      icon: Activity,
      tint: "bg-blue-50 text-blue-700",
    },
    {
      label: "ความใกล้เคียงเฉลี่ย",
      value: data.avgTopSimilarity != null ? `${(data.avgTopSimilarity * 100).toFixed(0)}%` : "-",
      icon: TrendingUp,
      tint: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "ค้นแล้วตอบได้ไม่ดี",
      value: data.weakSearchCount,
      icon: AlertCircle,
      tint: "bg-amber-50 text-amber-700",
    },
  ];

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      <div className="page-header">
        <span className="icon-badge h-11 w-11 shrink-0">
          <Lightbulb size={20} />
        </span>
        <div>
          <h1>Insights</h1>
          <p>วิเคราะห์จากประวัติการค้นหา — requirement ไหนถูกถามบ่อย และคลังข้อมูลยังมีช่องว่างตรงไหน</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm shadow-zinc-200/60">
            <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${k.tint}`}>
              <k.icon size={17} />
            </span>
            <p className="mt-3 text-xs text-zinc-500">{k.label}</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm shadow-zinc-200/60">
          <h2 className="text-sm font-semibold text-zinc-900">
            คำค้นยอดนิยม
            <span className="ml-2 text-xs font-normal text-zinc-400">
              ถูกค้นซ้ำบ่อย = ตัวเก็ง STD feature ถัดไป
            </span>
          </h2>
          <ul className="mt-3 space-y-2">
            {data.topQueries.length === 0 && (
              <li className="text-sm text-zinc-400">ยังไม่มีข้อมูลการค้นหา</li>
            )}
            {data.topQueries.map((q) => (
              <li
                key={q.query}
                className="flex items-start justify-between gap-3 rounded-lg bg-zinc-50 p-2.5 text-sm"
              >
                <div className="min-w-0">
                  <p className="line-clamp-2 text-zinc-800">{q.query}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {q.count} ครั้ง
                    {q.avg_similarity != null &&
                      ` · ใกล้เคียงเฉลี่ย ${(q.avg_similarity * 100).toFixed(0)}%`}{" "}
                    · ล่าสุด {formatDate(q.last_at)}
                  </p>
                </div>
                <button
                  onClick={() => router.push(`/?q=${encodeURIComponent(q.query)}`)}
                  title="ค้นหาอีกครั้ง"
                  className="shrink-0 rounded-lg border border-zinc-200 bg-white p-1.5 text-zinc-500 hover:bg-zinc-100"
                >
                  <RotateCcw size={13} />
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm shadow-zinc-200/60">
          <h2 className="text-sm font-semibold text-zinc-900">
            ช่องว่างข้อมูล
            <span className="ml-2 text-xs font-normal text-zinc-400">
              ค้นแล้วไม่เจอ / ใกล้เคียงต่ำกว่า 50% — ควรเติมข้อมูลส่วนนี้
            </span>
          </h2>
          <ul className="mt-3 space-y-2">
            {data.weakSearches.length === 0 && (
              <li className="text-sm text-zinc-400">ไม่มี — ทุกการค้นหาได้ผลลัพธ์ที่ใกล้เคียงพอ</li>
            )}
            {data.weakSearches.map((w) => (
              <li
                key={w.query}
                className="flex items-start justify-between gap-3 rounded-lg border border-amber-100 bg-amber-50 p-2.5 text-sm"
              >
                <div className="min-w-0">
                  <p className="line-clamp-2 text-zinc-800">{w.query}</p>
                  <p className="mt-0.5 text-xs text-amber-600">
                    {w.top_similarity != null
                      ? `ใกล้เคียงสุดแค่ ${(w.top_similarity * 100).toFixed(0)}%`
                      : "ไม่พบผลลัพธ์"}{" "}
                    · {formatDate(w.created_at)}
                  </p>
                </div>
                <button
                  onClick={() => router.push(`/?q=${encodeURIComponent(w.query)}`)}
                  title="ค้นหาอีกครั้ง"
                  className="shrink-0 rounded-lg border border-amber-200 bg-white p-1.5 text-amber-600 hover:bg-amber-100"
                >
                  <RotateCcw size={13} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm shadow-zinc-200/60">
          <h2 className="text-sm font-semibold text-zinc-900">การค้นหา 14 วันล่าสุด</h2>
          <div className="mt-4 flex h-32 items-end gap-1">
            {data.perDay.map((d) => (
              <div key={d.day} className="group relative flex-1">
                <div
                  className="w-full rounded-t bg-zinc-800 transition-colors group-hover:bg-zinc-600"
                  style={{ height: `${Math.max((d.count / maxPerDay) * 120, d.count > 0 ? 6 : 2)}px` }}
                />
                <span className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 rounded bg-[var(--brand)] px-1.5 py-0.5 text-[10px] whitespace-nowrap text-white opacity-0 group-hover:opacity-100">
                  {formatDate(d.day)}: {d.count}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
            <span>{formatDate(data.perDay[0].day)}</span>
            <span>{formatDate(data.perDay[data.perDay.length - 1].day)}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm shadow-zinc-200/60">
          <h2 className="text-sm font-semibold text-zinc-900">
            โมดูลที่โดน Customize บ่อยที่สุด
          </h2>
          <ul className="mt-4 space-y-2.5">
            {data.topModules.map((m) => (
              <li key={m.module} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 truncate text-zinc-600" title={m.module}>
                  {m.module}
                </span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-zinc-100">
                  <div
                    className="h-full rounded bg-blue-500"
                    style={{ width: `${(m.count / maxModule) * 100}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-xs text-zinc-500">{m.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
