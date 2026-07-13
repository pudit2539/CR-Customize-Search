import { NextResponse } from "next/server";
import { logChanges } from "@/lib/changeLog";
import { requireAdmin } from "@/lib/dal";
import { embedDocuments } from "@/lib/embed";
import { embeddingText } from "@/lib/parseExcel";
import { getSupabaseClient } from "@/lib/supabase";
import type { CrItemRow } from "@/lib/types";

export async function PUT(request: Request, ctx: RouteContext<"/api/items/[id]">) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const { id } = await ctx.params;
  const body = (await request.json()) as Partial<CrItemRow>;

  const supabase = getSupabaseClient();
  const updates: Record<string, unknown> = { ...body, updated_at: new Date().toISOString() };

  const { data: before } = await supabase.from("cr_items").select("*").eq("id", id).single();

  // Only re-embed when the searchable text actually changed — avoids an
  // unnecessary Voyage call on every metadata-only edit (e.g. fixing a typo
  // in Remark).
  if (body.detail || body.module !== undefined) {
    const module = body.module !== undefined ? body.module : before?.module ?? null;
    const detail = body.detail ?? before?.detail;
    if (detail) {
      const [embedding] = await embedDocuments([embeddingText({ module, detail })]);
      updates.embedding = embedding;
    }
  }

  const { data, error } = await supabase
    .from("cr_items")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logChanges(supabase, [{ itemId: id, action: "update", before, after: data }], auth.session.username);
  return NextResponse.json({ item: data });
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/items/[id]">) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const { id } = await ctx.params;
  const supabase = getSupabaseClient();
  const { data: before } = await supabase.from("cr_items").select("*").eq("id", id).single();
  const { error } = await supabase.from("cr_items").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logChanges(supabase, [{ itemId: id, action: "delete", before }], auth.session.username);
  return NextResponse.json({ ok: true });
}
