import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/dal";
import { getSupabaseClient } from "@/lib/supabase";

// Everything the item-detail modal needs in ONE round-trip. The modal used to
// fire five separate requests (counterpart, history, rates, related files,
// the whole STD-candidate list) — each its own serverless invocation plus its
// own re-read of the item — so opening it felt slow. Here the independent
// queries run in parallel inside a single invocation.
export async function GET(_request: Request, ctx: RouteContext<"/api/items/[id]/detail">) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const { id } = await ctx.params;
  const supabase = getSupabaseClient();

  const [itemRes, historyRes, nominatedRes, ratesRes, batchesRes] = await Promise.all([
    supabase.from("cr_items").select("source_type, item_no, project, import_batch_id").eq("id", id).single(),
    supabase
      .from("cr_item_changes")
      .select("id, action, before, after, created_by, created_at")
      .eq("item_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("std_candidates").select("id", { count: "exact", head: true }).eq("item_id", id),
    supabase.from("md_rates").select("role, label, rate, updated_by, updated_at").order("role"),
    supabase.from("import_batches").select("id, filename"),
  ]);

  if (itemRes.error) return NextResponse.json({ error: itemRes.error.message }, { status: 404 });
  const item = itemRes.data;

  // Counterpart depends on the item's source_type/item_no, so it is the one
  // query that has to wait for the first batch.
  let counterpart: Record<string, unknown> | null = null;
  if (item.item_no != null) {
    const otherSourceType = item.source_type === "new_customer" ? "existing_customer" : "new_customer";
    const { data } = await supabase
      .from("cr_items")
      .select(
        "id, source_type, item_no, module, detail, md_breakdown, md_summary, cost, project, industry, remark, import_batch_id, import_batches(filename)"
      )
      .eq("source_type", otherSourceType)
      .eq("item_no", item.item_no)
      .maybeSingle();
    if (data) {
      const { import_batches, ...rest } = data as typeof data & { import_batches: { filename: string } | null };
      counterpart = { ...rest, source_filename: import_batches?.filename ?? null };
    }
  }

  // Same project-name-in-filename matching as /api/items/[id]/related-files:
  // tokens under 3 chars match too loosely; a multi-word name also tries its
  // first word so "PRTR Internal" still finds "...PRTR Outsource..." files.
  let files: { id: string; filename: string }[] = [];
  if (item.project) {
    const tokens = item.project
      .split(",")
      .map((t: string) => t.trim().toLowerCase())
      .filter((t: string) => t.length >= 3);
    files = (batchesRes.data ?? []).filter((b) => {
      if (b.id === item.import_batch_id) return false;
      const name = b.filename.toLowerCase();
      return tokens.some((t: string) => {
        if (name.includes(t)) return true;
        const firstWord = t.split(/\s+/)[0];
        return firstWord.length >= 3 && name.includes(firstWord);
      });
    });
  }

  return NextResponse.json({
    counterpart,
    logs: historyRes.data ?? [],
    nominated: (nominatedRes.count ?? 0) > 0,
    rateEntries: (ratesRes.data ?? []).map((r) => ({ ...r, rate: Number(r.rate) })),
    files,
  });
}
