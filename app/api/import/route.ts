import { NextResponse } from "next/server";
import { logChanges } from "@/lib/changeLog";
import { parseWorkbook, embeddingText } from "@/lib/parseExcel";
import { embedDocuments } from "@/lib/embed";
import { getSupabaseClient } from "@/lib/supabase";

const EMBED_BATCH_SIZE = 50;

// Drop the raw vector before writing a change-log snapshot — nobody reviewing
// history needs 512 floats, and it would bloat the log fast at 200+ rows/import.
function withoutEmbedding<T extends Record<string, unknown>>(row: T) {
  const { embedding: _embedding, ...rest } = row;
  return rest;
}

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
  // Full rows (not just the key) so updates can log a real before-snapshot.
  const { data: existing, error: fetchError } = await supabase
    .from("cr_items")
    .select("*")
    .not("item_no", "is", null);
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const existingByKey = new Map<string, Record<string, unknown>>();
  for (const row of existing ?? []) {
    existingByKey.set(`${row.source_type}:${row.item_no}`, row);
  }

  const embeddings = await embedAll(items.map(embeddingText));

  const insertRows: Record<string, unknown>[] = [];
  const updateRows: Record<string, unknown>[] = [];
  const beforeById = new Map<string, Record<string, unknown>>();

  items.forEach((item, i) => {
    const row = { ...item, embedding: embeddings[i] };
    const key = item.item_no != null ? `${item.source_type}:${item.item_no}` : null;
    const existingRow = key ? existingByKey.get(key) : undefined;
    if (existingRow) {
      updateRows.push({ ...row, id: existingRow.id });
      beforeById.set(existingRow.id as string, existingRow);
    } else {
      insertRows.push(row);
    }
  });

  if (insertRows.length > 0) {
    const { data, error } = await supabase.from("cr_items").insert(insertRows).select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logChanges(
      supabase,
      (data ?? []).map((row) => ({
        itemId: row.id,
        action: "import_insert",
        after: withoutEmbedding(row),
      }))
    );
  }
  if (updateRows.length > 0) {
    const { data, error } = await supabase
      .from("cr_items")
      .upsert(updateRows, { onConflict: "id" })
      .select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logChanges(
      supabase,
      (data ?? []).map((row) => {
        const before = beforeById.get(row.id);
        return {
          itemId: row.id,
          action: "import_update" as const,
          before: before ? withoutEmbedding(before) : null,
          after: withoutEmbedding(row),
        };
      })
    );
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
