import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/dal";
import { getSupabaseClient } from "@/lib/supabase";

const DEFAULT_PAGE_SIZE = 10;

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") === "changes" ? "changes" : "search";
  const supabase = getSupabaseClient();

  // Server-side paging so deep history stays reachable (it used to stop at the
  // latest 50) while each response stays small.
  const pageSize = Math.min(Math.max(Number(searchParams.get("page_size")) || DEFAULT_PAGE_SIZE, 1), 100);
  const page = Math.max(Number(searchParams.get("page")) || 1, 1);
  const from = (page - 1) * pageSize;

  if (type === "search") {
    const { data, error, count } = await supabase
      .from("search_logs")
      .select(
        "id, query, mode, result_count, top_similarity, synthesis, created_by, created_at, cr_items:top_match_id(id, detail, module, source_type)",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ logs: data ?? [], total: count ?? 0 });
  }

  const { data, error, count } = await supabase
    .from("cr_item_changes")
    .select("id, item_id, action, before, after, created_by, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ logs: data ?? [], total: count ?? 0 });
}
