import { requireAuth } from "@/lib/dal";
import { getSupabaseClient } from "@/lib/supabase";

export async function GET(_request: Request, ctx: RouteContext<"/api/import-batches/[id]/download">) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const { id } = await ctx.params;
  const supabase = getSupabaseClient();

  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .select("filename, storage_path")
    .eq("id", id)
    .single();
  if (batchError) return Response.json({ error: batchError.message }, { status: 404 });

  const { data: file, error: downloadError } = await supabase.storage
    .from("import-files")
    .download(batch.storage_path);
  if (downloadError || !file) {
    return Response.json({ error: downloadError?.message ?? "file not found" }, { status: 404 });
  }

  const buffer = await file.arrayBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${batch.filename}"`,
    },
  });
}
