import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/dal";
import { embedQueries } from "@/lib/embed";
import { matchAndRerank } from "@/lib/rerank";
import { getSupabaseClient } from "@/lib/supabase";
import type { SourceType } from "@/lib/types";

const MAX_REQUIREMENTS = 30;
const MATCHES_PER_REQUIREMENT = 3;
const RAW_MATCHES_PER_REQUIREMENT = 15;

// Quick Estimator: takes a batch of requirement lines (pasted from a customer
// email / RFP), searches each one against the knowledge base, and returns the
// top matches per line so the client can build an MD/cost summary table.
export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const { requirements, mode } = (await request.json()) as {
    requirements?: string[];
    mode?: SourceType | null;
  };

  const cleaned = (requirements ?? []).map((r) => r.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    return NextResponse.json({ error: "requirements is required" }, { status: 400 });
  }
  if (cleaned.length > MAX_REQUIREMENTS) {
    return NextResponse.json(
      { error: `รองรับสูงสุด ${MAX_REQUIREMENTS} รายการต่อครั้ง` },
      { status: 400 }
    );
  }

  const supabase = getSupabaseClient();
  const embeddings = await embedQueries(cleaned);

  const results = await Promise.all(
    embeddings.map(async (embedding, i) => {
      const matches = await matchAndRerank(supabase, embedding, {
        rawCount: RAW_MATCHES_PER_REQUIREMENT,
        finalCount: MATCHES_PER_REQUIREMENT,
        sourceType: mode,
      });
      return { requirement: cleaned[i], matches };
    })
  ).catch((e: Error) => e);

  if (results instanceof Error) {
    return NextResponse.json({ error: results.message }, { status: 500 });
  }

  return NextResponse.json({ results });
}
