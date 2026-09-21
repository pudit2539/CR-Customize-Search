import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/dal";
import { getSupabaseClient } from "@/lib/supabase";

const LIMIT = 8;
const LOG_SCAN_LIMIT = 1000;

// Lightweight suggestion source for the Autocomplete component: past search
// queries (ranked by how often people asked them — same idea as a browser
// address-bar history dropdown) or distinct client/project names already in
// the data. Both are cheap full scans at current row counts; revisit with a
// dedicated index/materialized list if either table grows much larger.
export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") === "project" ? "project" : "query";
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const supabase = getSupabaseClient();

  if (type === "project") {
    const { data, error } = await supabase.from("cr_items").select("project").not("project", "is", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const names = new Set<string>();
    for (const row of data ?? []) {
      for (const raw of (row.project as string).split(",")) {
        const name = raw.trim();
        if (name) names.add(name);
      }
    }
    let list = [...names];
    if (q) list = list.filter((n) => n.toLowerCase().includes(q));
    list.sort((a, b) => a.localeCompare(b));
    return NextResponse.json({ suggestions: list.slice(0, LIMIT) });
  }

  const { data, error } = await supabase
    .from("search_logs")
    .select("query")
    .order("created_at", { ascending: false })
    .limit(LOG_SCAN_LIMIT);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const counts = new Map<string, { query: string; count: number }>();
  for (const row of data ?? []) {
    const key = row.query.trim().toLowerCase();
    if (!key) continue;
    const entry = counts.get(key) ?? { query: row.query.trim(), count: 0 };
    entry.count++;
    counts.set(key, entry);
  }
  let list = [...counts.values()];
  if (q) list = list.filter((e) => e.query.toLowerCase().includes(q));
  list.sort((a, b) => b.count - a.count);
  return NextResponse.json({ suggestions: list.slice(0, LIMIT).map((e) => e.query) });
}
