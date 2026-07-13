import { NextResponse } from "next/server";
import { embedQuery } from "@/lib/embed";
import { synthesizeMatches } from "@/lib/claude";
import { getSupabaseClient } from "@/lib/supabase";
import type { CrItemMatch, SourceType } from "@/lib/types";

const MATCH_COUNT = 10;

export async function POST(request: Request) {
  const { query, mode } = (await request.json()) as { query?: string; mode?: SourceType };
  if (!query || !query.trim()) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const supabase = getSupabaseClient();
  const queryEmbedding = await embedQuery(query);

  // mode narrows results to the sheet matching what the user is estimating
  // for (new customer vs. existing customer) — without this, near-identical
  // rows from both sheets show up side by side and look like duplicates.
  const { data, error } = await supabase.rpc("match_cr_items", {
    query_embedding: queryEmbedding,
    match_count: MATCH_COUNT,
    filter_source_type: mode ?? null,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const matches = (data ?? []) as CrItemMatch[];
  const synthesis = await synthesizeMatches(query, matches);

  // Best-effort logging — a failed insert here shouldn't break the search
  // response the user is waiting on.
  try {
    await supabase.from("search_logs").insert({
      query,
      mode: mode ?? null,
      result_count: matches.length,
      top_match_id: matches[0]?.id ?? null,
      top_similarity: matches[0]?.similarity ?? null,
      synthesis,
    });
  } catch {
    // ignore
  }

  return NextResponse.json({ matches, synthesis });
}
