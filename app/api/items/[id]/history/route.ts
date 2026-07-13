import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/dal";
import { getSupabaseClient } from "@/lib/supabase";

export async function GET(_request: Request, ctx: RouteContext<"/api/items/[id]/history">) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const { id } = await ctx.params;
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("cr_item_changes")
    .select("id, action, before, after, created_by, created_at")
    .eq("item_id", id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ logs: data ?? [] });
}
