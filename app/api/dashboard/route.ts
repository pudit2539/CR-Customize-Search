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

export async function GET() {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const supabase = getSupabaseClient();

  const { data: items, error } = await supabase.from("cr_items").select("module, source_type");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const bySourceType = { new_customer: 0, existing_customer: 0 };
  const categoryTotals = new Map<string, CategoryCount>();

  for (const item of items ?? []) {
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

  const { count: totalSearches } = await supabase
    .from("search_logs")
    .select("id", { count: "exact", head: true });

  return NextResponse.json({
    totalItems: (items ?? []).length,
    bySourceType,
    byCategory,
    totalSearches: totalSearches ?? 0,
  });
}
