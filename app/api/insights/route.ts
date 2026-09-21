import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/dal";
import { getSupabaseClient } from "@/lib/supabase";

const LOG_SCAN_LIMIT = 2000;
// Below this top-similarity a search effectively failed — the knowledge base
// has a gap for that topic.
const WEAK_SIMILARITY = 0.5;

interface LogRow {
  query: string;
  result_count: number;
  top_similarity: number | null;
  created_at: string;
}

export async function GET() {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const supabase = getSupabaseClient();

  const [logsRes, modulesRes] = await Promise.all([
    supabase
      .from("search_logs")
      .select("query, result_count, top_similarity, created_at")
      .order("created_at", { ascending: false })
      .limit(LOG_SCAN_LIMIT),
    supabase.from("cr_items").select("module"),
  ]);
  if (logsRes.error) return NextResponse.json({ error: logsRes.error.message }, { status: 500 });
  if (modulesRes.error)
    return NextResponse.json({ error: modulesRes.error.message }, { status: 500 });

  const logs = (logsRes.data ?? []) as LogRow[];

  // Top queries — repeated searches for the same requirement are the strongest
  // signal of what should become a standard feature next.
  const byQuery = new Map<
    string,
    { query: string; count: number; similaritySum: number; similarityCount: number; lastAt: string }
  >();
  for (const log of logs) {
    const key = log.query.trim().toLowerCase();
    const entry = byQuery.get(key) ?? {
      query: log.query.trim(),
      count: 0,
      similaritySum: 0,
      similarityCount: 0,
      lastAt: log.created_at,
    };
    entry.count++;
    if (log.top_similarity != null) {
      entry.similaritySum += log.top_similarity;
      entry.similarityCount++;
    }
    if (log.created_at > entry.lastAt) entry.lastAt = log.created_at;
    byQuery.set(key, entry);
  }
  const topQueries = [...byQuery.values()]
    .sort((a, b) => b.count - a.count || (a.lastAt < b.lastAt ? 1 : -1))
    .slice(0, 10)
    .map((e) => ({
      query: e.query,
      count: e.count,
      avg_similarity: e.similarityCount > 0 ? e.similaritySum / e.similarityCount : null,
      last_at: e.lastAt,
    }));

  // Weak searches — no results, or best hit too dissimilar to be useful.
  const weakSeen = new Set<string>();
  const weakSearches: {
    query: string;
    top_similarity: number | null;
    created_at: string;
  }[] = [];
  for (const log of logs) {
    const weak = log.result_count === 0 || (log.top_similarity ?? 0) < WEAK_SIMILARITY;
    if (!weak) continue;
    const key = log.query.trim().toLowerCase();
    if (weakSeen.has(key)) continue;
    weakSeen.add(key);
    weakSearches.push({
      query: log.query.trim(),
      top_similarity: log.top_similarity,
      created_at: log.created_at,
    });
    if (weakSearches.length >= 10) break;
  }

  // Searches per day over the last 14 days (logs are already date-desc).
  const dayCounts = new Map<string, number>();
  const now = Date.now();
  for (const log of logs) {
    const ageDays = (now - new Date(log.created_at).getTime()) / 86_400_000;
    if (ageDays > 14) break;
    const day = log.created_at.slice(0, 10);
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
  }
  const perDay: { day: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const day = new Date(now - i * 86_400_000).toISOString().slice(0, 10);
    perDay.push({ day, count: dayCounts.get(day) ?? 0 });
  }

  // Modules customized most often — where the standard product falls short.
  // Rows without a module (mostly PM imports) would dominate the chart as one
  // giant "unknown" bar — skip them; the chart is about known modules.
  const moduleCounts = new Map<string, number>();
  for (const row of modulesRes.data ?? []) {
    const module = (row.module as string | null)?.trim();
    if (!module) continue;
    moduleCounts.set(module, (moduleCounts.get(module) ?? 0) + 1);
  }
  const topModules = [...moduleCounts.entries()]
    .map(([module, count]) => ({ module, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const withSimilarity = logs.filter((l) => l.top_similarity != null);
  const searchesLast7Days = logs.filter(
    (l) => now - new Date(l.created_at).getTime() <= 7 * 86_400_000
  ).length;

  return NextResponse.json({
    totalSearches: logs.length,
    searchesLast7Days,
    avgTopSimilarity:
      withSimilarity.length > 0
        ? withSimilarity.reduce((s, l) => s + (l.top_similarity ?? 0), 0) / withSimilarity.length
        : null,
    weakSearchCount: logs.filter(
      (l) => l.result_count === 0 || (l.top_similarity ?? 0) < WEAK_SIMILARITY
    ).length,
    topQueries,
    weakSearches,
    perDay,
    topModules,
  });
}
