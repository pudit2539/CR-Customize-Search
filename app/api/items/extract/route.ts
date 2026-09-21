import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dal";
import { extractItems } from "@/lib/claude";
import { extractDocInput } from "@/lib/docParse";

// Two input shapes share this route: the original paste-text flow (JSON
// {text}) and the newer freeform Word/Excel/PDF upload flow (multipart
// {file}) — both end up as the same DocInput passed to extractItems, and
// both land in the exact same drafts-review-save UI on /import.
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "missing file" }, { status: 400 });
    }
    const filename = "name" in file && file.name ? file.name : "upload";
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const doc = await extractDocInput(buffer, filename);
      const drafts = await extractItems(doc);
      return NextResponse.json({ drafts });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
    }
  }

  const { text } = (await request.json()) as { text?: string };
  if (!text || !text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const drafts = await extractItems({ text });
  return NextResponse.json({ drafts });
}
