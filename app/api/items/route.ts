import { NextResponse } from "next/server";
import { embedDocuments } from "@/lib/embed";
import { embeddingText } from "@/lib/parseExcel";
import { getSupabaseClient } from "@/lib/supabase";
import type { CrItemRow } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const supabase = getSupabaseClient();

  let query = supabase
    .from("cr_items")
    .select(
      "id, source_type, item_no, module, detail, md_breakdown, md_summary, cost, project, industry, check_note, priority, remark, timeline_followup, presale_note, created_at, updated_at"
    )
    .order("item_no", { ascending: true });

  const sourceType = searchParams.get("source_type");
  if (sourceType) query = query.eq("source_type", sourceType);
  const module = searchParams.get("module");
  if (module) query = query.eq("module", module);
  const industry = searchParams.get("industry");
  if (industry) query = query.ilike("industry", `%${industry}%`);
  const keyword = searchParams.get("keyword");
  if (keyword) query = query.ilike("detail", `%${keyword}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
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
  return NextResponse.json({ item: data });
}
