import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/dal";
import { getSupabaseClient } from "@/lib/supabase";

// Nomination list for the CR-vs-STD review with พี่ยอด (Product) / พี่แชมป์
// (Dev) — any logged-in user can add/remove, the actual STD decision happens
// offline via the exported Excel, not tracked back into this table.
export async function GET() {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("std_candidates")
    .select(
      "id, item_id, note, created_by, created_at, cr_items(id, item_no, module, source_type, detail, md_summary, cost, project, industry, import_batch_id, import_batches(filename))"
    )
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const candidates = (data ?? []).map((row) => {
    const { cr_items, ...rest } = row as typeof row & {
      cr_items:
        | (Record<string, unknown> & { import_batches: { filename: string } | null })
        | null;
    };
    if (!cr_items) return { ...rest, item: null };
    const { import_batches, ...item } = cr_items;
    return { ...rest, item: { ...item, source_filename: import_batches?.filename ?? null } };
  });

  return NextResponse.json({ candidates });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const { item_id, note } = (await request.json()) as { item_id?: string; note?: string };
  if (!item_id) return NextResponse.json({ error: "item_id is required" }, { status: 400 });

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("std_candidates")
    .upsert(
      { item_id, note: note?.trim() || null, created_by: auth.session.username },
      { onConflict: "item_id" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get("item_id");
  if (!itemId) return NextResponse.json({ error: "item_id is required" }, { status: 400 });

  const supabase = getSupabaseClient();
  const { error } = await supabase.from("std_candidates").delete().eq("item_id", itemId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
