import { NextResponse } from "next/server";
import { parseWorkbook, embeddingText } from "@/lib/parseExcel";
import { embedDocuments } from "@/lib/embed";
import { getSupabaseClient } from "@/lib/supabase";

const EMBED_BATCH_SIZE = 50;

async function embedAll(texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    vectors.push(...(await embedDocuments(batch)));
  }
  return vectors;
}

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "missing file" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const items = await parseWorkbook(buffer);
  if (items.length === 0) {
    return NextResponse.json({ error: "no rows found in the workbook" }, { status: 400 });
  }

  const supabase = getSupabaseClient();

  // Look up existing rows by the (source_type, item_no) dedupe key so a
  // re-upload of the same file updates rows in place instead of duplicating.
  const { data: existing, error: fetchError } = await supabase
    .from("cr_items")
    .select("id, source_type, item_no")
    .not("item_no", "is", null);
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const existingIdByKey = new Map<string, string>();
  for (const row of existing ?? []) {
    existingIdByKey.set(`${row.source_type}:${row.item_no}`, row.id);
  }

  const embeddings = await embedAll(items.map(embeddingText));

  const insertRows: Record<string, unknown>[] = [];
  const updateRows: Record<string, unknown>[] = [];

  items.forEach((item, i) => {
    const row = { ...item, embedding: embeddings[i] };
    const key = item.item_no != null ? `${item.source_type}:${item.item_no}` : null;
    const existingId = key ? existingIdByKey.get(key) : undefined;
    if (existingId) {
      updateRows.push({ ...row, id: existingId });
    } else {
      insertRows.push(row);
    }
  });

  if (insertRows.length > 0) {
    const { error } = await supabase.from("cr_items").insert(insertRows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (updateRows.length > 0) {
    const { error } = await supabase.from("cr_items").upsert(updateRows, { onConflict: "id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    total: items.length,
    inserted: insertRows.length,
    updated: updateRows.length,
    by_source: {
      new_customer: items.filter((i) => i.source_type === "new_customer").length,
      existing_customer: items.filter((i) => i.source_type === "existing_customer").length,
    },
  });
}
