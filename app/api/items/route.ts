import { NextResponse } from "next/server";
import { logChanges } from "@/lib/changeLog";
import { requireAdmin, requireAuth } from "@/lib/dal";
import { embedDocuments } from "@/lib/embed";
import { allKnownModules, modulesInCategory } from "@/lib/moduleCategories";
import { embeddingText } from "@/lib/parseExcel";
import { getSupabaseClient } from "@/lib/supabase";
import type { CrItemRow } from "@/lib/types";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const { searchParams } = new URL(request.url);
  const supabase = getSupabaseClient();

  // Server-side pagination: the list page asks for one page at a time
  // (10/20/50 rows), so the response stays small however large cr_items grows.
  const pageSize = Math.min(Math.max(Number(searchParams.get("page_size")) || 10, 1), 100);
  const page = Math.max(Number(searchParams.get("page")) || 1, 1);
  const from = (page - 1) * pageSize;

  let query = supabase
    .from("cr_items")
    .select(
      "id, source_type, item_no, module, detail, md_breakdown, md_summary, cost, project, industry, check_note, priority, remark, timeline_followup, presale_note, import_batch_id, created_at, updated_at, import_batches(filename)",
      { count: "exact" }
    )
    // id as a tiebreaker keeps page boundaries stable (both sheets share item_no values).
    .order("item_no", { ascending: true })
    .order("id", { ascending: true })
    .range(from, from + pageSize - 1);

  // Category is derived from module (lib/moduleCategories.ts), so translate
  // it into a module filter the database can apply before paging.
  const category = searchParams.get("category");
  if (category) {
    const mods = modulesInCategory(category);
    if (mods) {
      query = query.in("module", mods);
    } else {
      const quoted = allKnownModules().map((m) => `"${m.replace(/"/g, '""')}"`).join(",");
      query = query.or(`module.is.null,module.not.in.(${quoted})`);
    }
  }

  const sourceType = searchParams.get("source_type");
  if (sourceType) query = query.eq("source_type", sourceType);
  const moduleCode = searchParams.get("module");
  if (moduleCode) query = query.eq("module", moduleCode);
  const industry = searchParams.get("industry");
  if (industry) query = query.ilike("industry", `%${industry}%`);
  const project = searchParams.get("project");
  if (project) query = query.ilike("project", `%${project}%`);
  const keyword = searchParams.get("keyword");
  if (keyword) query = query.ilike("detail", `%${keyword}%`);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Flatten the embedded import_batches(filename) join into a plain field —
  // the UI just wants "was this imported from a file, and what's its name."
  const items = (data ?? []).map((row) => {
    const { import_batches, ...rest } = row as typeof row & {
      import_batches: { filename: string } | null;
    };
    return { ...rest, source_filename: import_batches?.filename ?? null };
  });
  return NextResponse.json({ items, total: count ?? items.length, page, pageSize });
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
