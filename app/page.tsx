"use client";

import { useState } from "react";
import type { CrItemMatch } from "@/lib/types";

const MODE_LABEL: Record<string, string> = {
  new_customer: "ลูกค้าใหม่ (Presale)",
  existing_customer: "ลูกค้าเดิม (PM)",
};

export default function Home() {
  const [mode, setMode] = useState<"new_customer" | "existing_customer">("new_customer");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [synthesis, setSynthesis] = useState<string | null>(null);
  const [matches, setMatches] = useState<CrItemMatch[]>([]);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "search failed");
      setMatches(json.matches);
      setSynthesis(json.synthesis);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold">ค้นหา CR/Customize ที่เคยทำแล้ว</h1>
      <p className="mt-1 text-zinc-600">
        พิมพ์ requirement ที่ได้รับมา ระบบจะค้นหาเคสเก่าที่ใกล้เคียงที่สุดให้
      </p>

      <div className="mt-6 flex gap-2">
        {(["new_customer", "existing_customer"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              mode === m
                ? "bg-zinc-900 text-white"
                : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-100"
            }`}
          >
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="เช่น: ลูกค้าอยากให้ระบบคำนวณ overtime แยกตามกะการทำงาน..."
          rows={5}
          className="w-full resize-none rounded-lg border border-zinc-300 bg-white p-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
        />
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="mt-3 rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {loading ? "กำลังค้นหา..." : "ค้นหา"}
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">เกิดข้อผิดพลาด: {error}</p>}

      {synthesis && (
        <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 whitespace-pre-wrap">
          {synthesis}
        </div>
      )}

      {matches.length > 0 && (
        <div className="mt-6 space-y-4">
          {matches.map((m) => (
            <div key={m.id} className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                    {m.module ?? "-"}
                  </span>
                  <span className="ml-2 text-xs text-zinc-500">
                    {MODE_LABEL[m.source_type]} · No.{m.item_no ?? "-"}
                  </span>
                </div>
                <span className="whitespace-nowrap rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                  ใกล้เคียง {(m.similarity * 100).toFixed(0)}%
                </span>
              </div>
              <p className="mt-2 text-sm whitespace-pre-wrap text-zinc-800">{m.detail}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-600 sm:grid-cols-4">
                <div>
                  <span className="font-medium text-zinc-500">MD รวม:</span> {m.md_summary ?? "-"}
                </div>
                <div>
                  <span className="font-medium text-zinc-500">Cost:</span>{" "}
                  {m.cost != null ? m.cost.toLocaleString() : "-"}
                </div>
                <div>
                  <span className="font-medium text-zinc-500">Project:</span> {m.project ?? "-"}
                </div>
                <div>
                  <span className="font-medium text-zinc-500">Industry:</span> {m.industry ?? "-"}
                </div>
              </div>
              {m.remark && (
                <p className="mt-2 rounded bg-zinc-50 p-2 text-xs whitespace-pre-wrap text-zinc-600">
                  {m.remark}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
