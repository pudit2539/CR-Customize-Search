import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/dal";
import { synthesizeMatches } from "@/lib/claude";
import { getSupabaseClient } from "@/lib/supabase";
import type { CrItemMatch } from "@/lib/types";

// Second phase of a search: the AI summary. Split from /api/search so the
// match list renders in ~2s instead of blocking 10s+ on Claude.
export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const { query, matches, log_id } = (await request.json()) as {
    query?: string;
    matches?: CrItemMatch[];
    log_id?: string | null;
  };
  if (!query || !Array.isArray(matches)) {
    return NextResponse.json({ error: "query and matches are required" }, { status: 400 });
  }

  const synthesis = await synthesizeMatches(query, matches);

  // Backfill the log row created by /api/search — best-effort, same as the
  // original insert.
  if (log_id) {
    try {
      const supabase = getSupabaseClient();
      await supabase.from("search_logs").update({ synthesis }).eq("id", log_id);
    } catch {
      // ignore
    }
  }

  return NextResponse.json({ synthesis });
}
