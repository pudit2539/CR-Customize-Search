import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/dal";
import { getSupabaseClient } from "@/lib/supabase";

// Records "this match was actually correct" confirmations — see rerank.ts
// for how the accumulated count feeds back into ranking.
export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const { item_id, query } = (await request.json()) as { item_id?: string; query?: string };
  if (!item_id) return NextResponse.json({ error: "item_id is required" }, { status: 400 });

  const supabase = getSupabaseClient();
  const { error } = await supabase.from("match_feedback").insert({
    item_id,
    query: query?.trim() || null,
    created_by: auth.session.username,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
