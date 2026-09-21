import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dal";
import { embedQuery } from "@/lib/embed";
import { getSupabaseClient } from "@/lib/supabase";
import type { CrItemMatch } from "@/lib/types";

// Above this similarity a new item is likely a duplicate of an existing one —
// the add form warns before saving.
const DUPLICATE_THRESHOLD = 0.85;
const MATCH_COUNT = 3;

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const { detail } = (await request.json()) as { detail?: string };
  if (!detail || !detail.trim()) {
    return NextResponse.json({ error: "detail is required" }, { status: 400 });
  }

  const supabase = getSupabaseClient();
  const embedding = await embedQuery(detail);

  const { data, error } = await supabase.rpc("match_cr_items", {
    query_embedding: embedding,
    match_count: MATCH_COUNT,
    filter_source_type: null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const duplicates = ((data ?? []) as CrItemMatch[]).filter(
    (m) => m.similarity >= DUPLICATE_THRESHOLD
  );
  return NextResponse.json({ duplicates });
}
