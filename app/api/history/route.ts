import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";

const PAGE_SIZE = 50;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") === "changes" ? "changes" : "search";
  const supabase = getSupabaseClient();

  if (type === "search") {
    const { data, error } = await supabase
      .from("search_logs")
      .select(
        "id, query, mode, result_count, top_similarity, synthesis, created_at, cr_items:top_match_id(detail, module, source_type)"
      )
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ logs: data ?? [] });
  }

  const { data, error } = await supabase
    .from("cr_item_changes")
    .select("id, item_id, action, before, after, created_at")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ logs: data ?? [] });
}
