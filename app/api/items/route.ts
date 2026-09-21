import { NextResponse } from "next/server";
import { logChanges } from "@/lib/changeLog";
import { requireAdmin, requireAuth } from "@/lib/dal";
import { embedDocuments } from "@/lib/embed";
import { embeddingText } from "@/lib/parseExcel";
import { getSupabaseClient } from "@/lib/supabase";
import type { CrItemRow } from "@/lib/types";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const { searchParams } = new URL(request.url);
  const supabase = getSupabaseClient();

  // Capped rather than paginated — the UI has no pager yet, so a hard limit
  // just prevents an unbounded full-table fetch if cr_items keeps growing.
  const ITEMS_CAP = 2000;

  let query = supabase
    .from("cr_items")
    .select(
      "id, source_type, item_no, module, detail, md_breakdown, md_summary, cost, project, industry, check_note, priority, remark, timeline_followup, presale_note, import_batch_id, created_at, updated_at, import_batches(filename)"
    )
    .order("item_no", { ascending: true })
    .limit(ITEMS_CAP);

  const sourceType = searchParams.get("source_type");
  if (sourceType) query = query.eq("source_type", sourceType);
  const module = searchParams.get("module");
  if (module) query = query.eq("module", module);
  const industry = searchParams.get("industry");
  if (industry) query = query.ilike("industry", `%${industry}%`);
  const project = searchParams.get("project");
  if (project) query = query.ilike("project", `%${project}%`);
  const keyword = searchParams.get("keyword");
  if (keyword) query = query.ilike("detail", `%${keyword}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Flatten the embedded import_batches(filename) join into a plain field —
  // the UI just wants "was this imported from a file, and what's its name."
  const items = (data ?? []).map((row) => {
    const { import_batches, ...rest } = row as typeof row & {
      import_batches: { filename: string } | null;
    };
    return { ...rest, source_filename: import_batches?.filename ?? null };
  });
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const body = (await request.json()) as Partial<CrItemRow>;
  if (!body.detail || !body.source_type) {
    return NextResponse.json({ error: "detail and source_type are required" }, { status: 400 });
  }

  const supabase = getSupabaseClient();
  const [embedding] = await embedDocuments([
    embeddingText({ module: body.module ?? null, detail: body.detail }),
  ]);

  const { data, error } = await supabase
    .from("cr_items")
    .insert({ ...body, embedding })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logChanges(supabase, [{ itemId: data.id, action: "insert", after: data }], auth.session.username);
  return NextResponse.json({ item: data });
}
