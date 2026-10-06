"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Columns3, Search as SearchIcon, Sparkles, X } from "lucide-react";
import Autocomplete from "@/components/Autocomplete";
import CompareModal from "@/components/CompareModal";
import ItemDetailModal from "@/components/ItemDetailModal";
import ResultCard from "@/components/ResultCard";
import SegmentedControl from "@/components/SegmentedControl";
import { SOURCE_TYPE_LABEL } from "@/lib/format";
import type { CrItemMatch } from "@/lib/types";

const MODE_LABEL = SOURCE_TYPE_LABEL;

const RESULTS_PAGE_SIZE = 5;
const MAX_COMPARE = 3;

const EXAMPLE_QUERIES = [
  "Overtime แยกตามกะการทำงาน",
  "Carry Forward วันลาพักร้อน",
  "Custom Approval Workflow ตามสายบังคับบัญชา",
  "Additional Bank มากกว่า 1 บัญชี",
  "Setup Role / Permission ตามบริษัท",
];

type SearchMode = "all" | "new_customer" | "existing_customer";

export default function Home() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<SearchMode>("all");
  // Prefilled from the sidebar's "Quick Actions" search box (/?q=...) — lazy
  // initializer so this only reads the URL once, on mount.
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [synthesis, setSynthesis] = useState<string | null>(null);
  const [synthesisLoading, setSynthesisLoading] = useState(false);
  const [matches, setMatches] = useState<CrItemMatch[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [detailItem, setDetailItem] = useState<CrItemMatch | null>(null);
  const [totalItems, setTotalItems] = useState<number | null>(null);
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  // The query actually behind the matches on screen — kept separate from
  // `query` (the live textarea value) so editing the box after a search
  // doesn't retroactively change what gets highlighted in the old results.
  const [lastQuery, setLastQuery] = useState("");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);

  // "This match is correct" feedback — see /api/match-feedback and
  // lib/rerank.ts. The practical stand-in for "learn from usage" (feedback
  // item 7.3): no fine-tuning pipeline exists, so confirmed matches just
  // accumulate a small future ranking boost instead.
  // useCallback keeps these referentially stable so the memoized ResultCards
  // don't re-render on unrelated state changes (e.g. typing in the textarea).
  const confirmMatch = useCallback(
    async (itemId: string) => {
      setConfirmedIds((prev) => new Set(prev).add(itemId));
      try {
        await fetch("/api/match-feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ item_id: itemId, query: lastQuery }),
        });
      } catch {
        // best-effort — the optimistic UI state already reflects the click
      }
    },
    [lastQuery]
  );

  const toggleCompare = useCallback((id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, id];
    });
  }, []);

  useEffect(() => {
    fetch("/api/dashboard?summary=1")
      .then((r) => r.json())
      .then((json) => setTotalItems(json.totalItems ?? null))
      .catch(() => {});
  }, []);

  async function handleSearch(q?: string) {
    const effectiveQuery = q ?? query;
    if (!effectiveQuery.trim()) return;
    setLoading(true);
    setError(null);
    setShowAll(false);
    setMatches([]);
    setSynthesis(null);
    setSynthesisLoading(false);
    setLastQuery(effectiveQuery);
    setCompareIds([]);
    try {
      // Phase 1: vector matches — fast, renders immediately. Phase 2: the AI
      // summary takes 10s+, so it streams in afterwards instead of blocking.
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: effectiveQuery, mode: mode === "all" ? null : mode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "search failed");
      setMatches(json.matches);
      setLoading(false);

      setSynthesisLoading(true);
      const synthRes = await fetch("/api/search/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: effectiveQuery, matches: json.matches, log_id: json.log_id }),
      });
      const synthJson = await synthRes.json();
      if (synthRes.ok) setSynthesis(synthJson.synthesis);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setSynthesisLoading(false);
    }
  }

  const visibleMatches = showAll ? matches : matches.slice(0, RESULTS_PAGE_SIZE);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10 xl:max-w-4xl 2xl:max-w-5xl">
      <div className="page-header">
        <span className="icon-badge h-11 w-11 shrink-0">
          <SearchIcon size={20} />
        </span>
        <div>
          <h1>ค้นหา CR/Customize ที่เคยทำแล้ว</h1>
          <p>
            พิมพ์ requirement ที่ได้รับมา ระบบจะค้นหาเคสเก่าที่ใกล้เคียงที่สุดให้
            {totalItems != null && (
              <span className="text-zinc-400"> · ค้นหาจากคลังข้อมูล {totalItems.toLocaleString()} รายการที่เคยทำแล้ว</span>
            )}
          </p>
        </div>
      </div>

      <div className="mt-7">
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { value: "all", label: "ทั้งหมด" },
            { value: "new_customer", label: MODE_LABEL.new_customer },
            { value: "existing_customer", label: MODE_LABEL.existing_customer },
          ]}
        />
      </div>

      <div className="mt-4 surface-card p-2">
        <Autocomplete
          multiline
          rows={5}
          value={query}
          onChange={setQuery}
          onSubmit={(q) => handleSearch(q)}
          suggestionType="query"
          placeholder="เช่น: ลูกค้าอยากให้ระบบคำนวณ overtime แยกตามกะการทำงาน... (กด Enter เพื่อค้นหา, Shift+Enter ขึ้นบรรทัดใหม่)"
          className="w-full resize-none rounded-[0.7rem] border-0 bg-transparent p-3 text-sm outline-none focus:ring-0"
        />
        <div className="flex justify-end border-t border-zinc-50 p-2 pt-3">
          <button onClick={() => handleSearch()} disabled={loading || !query.trim()} className="btn btn-primary">
            <SearchIcon size={14} />
            {loading ? "กำลังค้นหา..." : "ค้นหา"}
          </button>
        </div>
      </div>

      {!loading && matches.length === 0 && !synthesis && (
        <div className="mt-5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
            <Sparkles size={13} className="text-red-400" />
            ตัวอย่างที่ลองค้นหาได้
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {EXAMPLE_QUERIES.map((eq) => (
              <button
                key={eq}
                onClick={() => {
                  setQuery(eq);
                  handleSearch(eq);
                }}
                className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 shadow-sm shadow-zinc-200/40 transition-all hover:-translate-y-0.5 hover:border-red-200 hover:bg-red-50 hover:text-red-700 hover:shadow-md hover:shadow-red-100"
              >
                {eq}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-600">เกิดข้อผิดพลาด: {error}</p>}

      {loading && (
        <div className="mt-8 space-y-4">
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
            กำลังค้นหาและวิเคราะห์เคสที่ใกล้เคียง...
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="surface-card p-4">
              <div className="skeleton h-3 w-28 rounded" />
              <div className="skeleton mt-3 h-3 w-full rounded" />
              <div className="skeleton mt-2 h-3 w-2/3 rounded" />
              <div className="mt-4 flex gap-2">
                <div className="skeleton h-5 w-20 rounded-full" />
                <div className="skeleton h-5 w-16 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {synthesisLoading && !synthesis && (
        <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-sm text-amber-700">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-300 border-t-amber-600" />
            AI กำลังสรุปผลการเทียบเคียง...
          </div>
          <div className="mt-3 animate-pulse space-y-2">
            <div className="h-3 w-full rounded bg-amber-100" />
            <div className="h-3 w-5/6 rounded bg-amber-100" />
            <div className="h-3 w-2/3 rounded bg-amber-100" />
          </div>
        </div>
      )}

      {synthesis && (
        <div className="fade-up mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 whitespace-pre-wrap">
          {synthesis}
        </div>
      )}

      {matches.length > 0 && (
        <div className="mt-6 space-y-4">
          {visibleMatches.map((m, i) => (
            <ResultCard
              key={m.id}
              m={m}
              index={i}
              query={lastQuery}
              inCompare={compareIds.includes(m.id)}
              compareDisabled={!compareIds.includes(m.id) && compareIds.length >= MAX_COMPARE}
              maxCompare={MAX_COMPARE}
              confirmed={confirmedIds.has(m.id)}
              onDetail={setDetailItem}
              onToggleCompare={toggleCompare}
              onConfirm={confirmMatch}
            />
          ))}

          {!showAll && matches.length > RESULTS_PAGE_SIZE && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full rounded-lg border border-dashed border-zinc-300 bg-white py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
            >
              แสดงเพิ่ม ({matches.length - RESULTS_PAGE_SIZE} รายการ)
            </button>
          )}
        </div>
      )}

      {compareIds.length >= 2 && !showCompare && (
        <div className="slide-up fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 sm:inset-x-auto sm:right-4 sm:justify-end">
          <div className="flex items-center gap-3 rounded-full border border-zinc-100 bg-white py-2 pr-2 pl-4 shadow-lg shadow-zinc-300/40">
            <span className="text-xs font-medium text-zinc-600">เลือกไว้ {compareIds.length} เคส</span>
            <button onClick={() => setShowCompare(true)} className="btn btn-primary py-1.5">
              <Columns3 size={13} />
              เปรียบเทียบ
            </button>
            <button
              onClick={() => setCompareIds([])}
              title="ล้างรายการเปรียบเทียบ"
              className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-50 hover:text-zinc-700"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      {showCompare && (
        <CompareModal
          items={matches.filter((m) => compareIds.includes(m.id))}
          onClose={() => setShowCompare(false)}
          onRemove={(id) => {
            const next = compareIds.filter((x) => x !== id);
            setCompareIds(next);
            if (next.length === 0) setShowCompare(false);
          }}
        />
      )}

      {detailItem && <ItemDetailModal item={detailItem} onClose={() => setDetailItem(null)} />}
    </div>
  );
}
