import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/dal";
import { embedQuery } from "@/lib/embed";
import { rerankByRecency } from "@/lib/rerank";
import { getSupabaseClient } from "@/lib/supabase";
import type { CrItemMatch, SourceType } from "@/lib/types";

const MATCH_COUNT = 10;
// Pull a larger candidate pool than we show so the recency tie-break in
// rerankByRecency has near-duplicate matches to actually choose between —
// with only 10 raw candidates, ties beyond the cutoff are invisible to it.
const RAW_MATCH_COUNT = 25;

// Returns matches only — the AI synthesis takes 10s+ so the client fetches it
// separately from /api/search/synthesize after rendering these results.
export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const { query, mode } = (await request.json()) as { query?: string; mode?: SourceType | null };
  if (!query || !query.trim()) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const supabase = getSupabaseClient();
  const queryEmbedding = await embedQuery(query);

  // mode narrows results to the sheet matching what the user is estimating
  // for (new customer vs. existing customer); null searches both sides.
  const { data, error } = await supabase.rpc("match_cr_items", {
    query_embedding: queryEmbedding,
    match_count: RAW_MATCH_COUNT,
    filter_source_type: mode ?? null,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const candidates = (data ?? []) as CrItemMatch[];
  const matches = await rerankByRecency(supabase, candidates, MATCH_COUNT);

  // Best-effort logging — a failed insert here shouldn't break the search
  // response the user is waiting on. synthesis fills in later via the
  // synthesize route using log_id.
  let logId: string | null = null;
  try {
    const { data: log } = await supabase
      .from("search_logs")
      .insert({
        query,
        mode: mode ?? null,
        result_count: matches.length,
        top_match_id: matches[0]?.id ?? null,
        top_similarity: matches[0]?.similarity ?? null,
        synthesis: null,
        created_by: auth.session.username,
      })
      .select("id")
      .single();
    logId = log?.id ?? null;
  } catch {
    // ignore
  }

  return NextResponse.json({ matches, log_id: logId });
}
