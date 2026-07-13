import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dal";
import { extractItems } from "@/lib/claude";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const { text } = (await request.json()) as { text?: string };
  if (!text || !text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const drafts = await extractItems(text);
  return NextResponse.json({ drafts });
}
