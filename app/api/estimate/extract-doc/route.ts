import { NextResponse } from "next/server";
import { extractRequirementsFromDocument } from "@/lib/claude";
import { requireAuth } from "@/lib/dal";
import { extractDocInput } from "@/lib/docParse";

// Create Quotation's document-upload flow (feedback item 2.2) — any logged
// in user, not admin-only, since this is presale's own working tool, not a
// database mutation.
export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "missing file" }, { status: 400 });
  }
  const filename = "name" in file && file.name ? file.name : "upload";

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const doc = await extractDocInput(buffer, filename);
    const requirements = await extractRequirementsFromDocument(doc);
    if (requirements.length === 0) {
      return NextResponse.json({ error: "AI ไม่พบ requirement ที่แยกออกมาได้จากเอกสารนี้" }, { status: 400 });
    }
    return NextResponse.json({ requirements });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
