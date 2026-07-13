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

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

interface CategoryCount {
  category: string;
  new_customer: number;
  existing_customer: number;
}

interface DashboardData {
  totalItems: number;
  bySourceType: { new_customer: number; existing_customer: number };
  byCategory: CategoryCount[];
  totalSearches: number;
}

const NEW_COLOR = "#2a78d6";
const EXISTING_COLOR = "#1baf7a";

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData);
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
            label: "ลูกค้าใหม่",
            data: data.byCategory.map((c) => c.new_customer),
            backgroundColor: NEW_COLOR,
            borderRadius: 4,
          },
          {
            label: "ลูกค้าเดิม",
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
          const category = data.byCategory[index]?.category;
          const sourceType = datasetIndex === 0 ? "new_customer" : "existing_customer";
          if (category) {
            router.push(
              `/items?category=${encodeURIComponent(category)}&source_type=${sourceType}`
            );
          }
        },
      },
    });

    return () => chartRef.current?.destroy();
  }, [data, router]);

  if (!data) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-sm text-zinc-500">กำลังโหลด...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg bg-white border border-zinc-200 p-4">
          <p className="text-xs text-zinc-500">รายการทั้งหมด</p>
          <p className="mt-1 text-2xl font-semibold">{data.totalItems}</p>
        </div>
        <div className="rounded-lg bg-white border border-zinc-200 p-4">
          <p className="text-xs text-zinc-500">ลูกค้าใหม่ (Presale)</p>
          <p className="mt-1 text-2xl font-semibold">{data.bySourceType.new_customer}</p>
        </div>
        <div className="rounded-lg bg-white border border-zinc-200 p-4">
          <p className="text-xs text-zinc-500">ลูกค้าเดิม (PM)</p>
          <p className="mt-1 text-2xl font-semibold">{data.bySourceType.existing_customer}</p>
        </div>
        <div className="rounded-lg bg-white border border-zinc-200 p-4">
          <p className="text-xs text-zinc-500">ค้นหาสะสม</p>
          <p className="mt-1 text-2xl font-semibold">{data.totalSearches}</p>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: NEW_COLOR }} />
          ลูกค้าใหม่ (Presale)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: EXISTING_COLOR }} />
          ลูกค้าเดิม (PM)
        </span>
      </div>
      <div
        className="relative mt-2 w-full"
        style={{ height: Math.max(data.byCategory.length * 40 + 80, 240) }}
      >
        <canvas ref={canvasRef} role="img" aria-label="จำนวนรายการ CR/Customize แยกตามหมวดและประเภทลูกค้า" />
      </div>
      <p className="mt-2 text-xs text-zinc-400">คลิกแถบเพื่อดูรายการในหมวดนั้น</p>
    </div>
  );
}
