import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/dal";
import { getSupabaseClient } from "@/lib/supabase";

// Files in storage that likely belong to one of this item's projects — e.g. a
// row from the compiled master sheet tagged "OPTINOVA" also surfaces
// "Optinova Estimate Mandays.xlsx". Matched by project-name-in-filename since
// there's no explicit link between master-sheet rows and per-customer files.
export async function GET(_request: Request, ctx: RouteContext<"/api/items/[id]/related-files">) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const { id } = await ctx.params;
  const supabase = getSupabaseClient();

  const { data: item, error: itemError } = await supabase
    .from("cr_items")
    .select("project, import_batch_id")
    .eq("id", id)
    .single();
  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 404 });

  if (!item.project) return NextResponse.json({ files: [] });

  const { data: batches, error } = await supabase
    .from("import_batches")
    .select("id, filename");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Tokens under 3 chars (e.g. "CG") match too loosely to trust; a
  // multi-word name also tries its first word so "PRTR Internal" still finds
  // the "...PRTR Outsource..." files.
  const tokens = item.project
    .split(",")
    .map((t: string) => t.trim().toLowerCase())
    .filter((t: string) => t.length >= 3);

  const files = (batches ?? []).filter((b) => {
    if (b.id === item.import_batch_id) return false;
    const name = b.filename.toLowerCase();
    return tokens.some((t: string) => {
      if (name.includes(t)) return true;
      const firstWord = t.split(/\s+/)[0];
      return firstWord.length >= 3 && name.includes(firstWord);
    });
  });

  return NextResponse.json({ files });
}
