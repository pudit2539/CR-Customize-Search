import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/dal";
import { categoryOf } from "@/lib/moduleCategories";
import { getSupabaseClient } from "@/lib/supabase";
import type { SourceType } from "@/lib/types";

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

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const { searchParams } = new URL(request.url);
  const sourceTypeFilter = searchParams.get("source_type");
  const categoryFilter = searchParams.get("category");
  const projectFilter = searchParams.get("project");

  const supabase = getSupabaseClient();

  let query = supabase
    .from("cr_items")
    .select("module, source_type, project, md_summary, cost");
  if (sourceTypeFilter) query = query.eq("source_type", sourceTypeFilter);
  if (projectFilter) query = query.ilike("project", `%${projectFilter}%`);

  const { data: rawItems, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Category is derived from module (lib/moduleCategories.ts), not a DB
  // column — filter this axis in JS after the DB-level filters above.
  const items = categoryFilter
    ? (rawItems ?? []).filter((i) => categoryOf(i.module) === categoryFilter)
    : rawItems ?? [];

  const bySourceType = { new_customer: 0, existing_customer: 0 };
  const categoryTotals = new Map<string, CategoryCount>();

  for (const item of items) {
    const sourceType = item.source_type as SourceType;
    bySourceType[sourceType]++;

    const category = categoryOf(item.module);
    const entry = categoryTotals.get(category) ?? {
      category,
      new_customer: 0,
      existing_customer: 0,
    };
    entry[sourceType]++;
    categoryTotals.set(category, entry);
  }

  const byCategory = [...categoryTotals.values()].sort(
    (a, b) => b.new_customer + b.existing_customer - (a.new_customer + a.existing_customer)
  );

  // Client detail: project is a free-text field and sometimes lists several
  // clients on one shared item (e.g. a master-file row copied for both a
  // presale estimate and its later PM renewal) — split on comma so each
  // client gets its own row instead of being buried under a combined label.
  const clientTotals = new Map<string, ClientCount>();
  for (const item of items) {
    if (!item.project) continue;
    const sourceType = item.source_type as SourceType;
    const names = item.project.split(",").map((p: string) => p.trim()).filter(Boolean);
    for (const name of names) {
      const entry = clientTotals.get(name) ?? {
        name,
        total: 0,
        new_customer: 0,
        existing_customer: 0,
        totalMd: 0,
        totalCost: 0,
      };
      entry.total++;
      entry[sourceType]++;
      entry.totalMd += item.md_summary ?? 0;
      entry.totalCost += item.cost ?? 0;
      clientTotals.set(name, entry);
    }
  }
  // Round away binary floating-point residue from summing decimal MDs
  // (e.g. repeated 0.25/0.5 additions landing on 308.59999999999997).
  const byClient = [...clientTotals.values()]
    .map((c) => ({
      ...c,
      totalMd: Math.round(c.totalMd * 100) / 100,
      totalCost: Math.round(c.totalCost * 100) / 100,
    }))
    .sort((a, b) => b.total - a.total);

  const { count: totalSearches } = await supabase
    .from("search_logs")
    .select("id", { count: "exact", head: true });

  return NextResponse.json({
    totalItems: items.length,
    bySourceType,
    byCategory,
    byClient,
    totalSearches: totalSearches ?? 0,
  });
}
