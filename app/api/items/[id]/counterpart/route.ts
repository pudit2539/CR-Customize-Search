import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/dal";
import { getSupabaseClient } from "@/lib/supabase";

// The "other sheet's" version of the same item — same item_no, opposite
// source_type. Lets the detail modal show e.g. the existing-customer MD/cost
// next to the new-customer one, instead of the two silently disagreeing.
export async function GET(_request: Request, ctx: RouteContext<"/api/items/[id]/counterpart">) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const { id } = await ctx.params;
  const supabase = getSupabaseClient();

  const { data: item, error: itemError } = await supabase
    .from("cr_items")
    .select("source_type, item_no")
    .eq("id", id)
    .single();
  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 404 });

  if (item.item_no == null) {
    return NextResponse.json({ counterpart: null });
  }

  const otherSourceType = item.source_type === "new_customer" ? "existing_customer" : "new_customer";
  const { data: counterpart, error } = await supabase
    .from("cr_items")
    .select(
      "id, source_type, item_no, module, detail, md_breakdown, md_summary, cost, project, industry, remark"
    )
    .eq("source_type", otherSourceType)
    .eq("item_no", item.item_no)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ counterpart: counterpart ?? null });
}
