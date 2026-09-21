import { NextResponse } from "next/server";
import { requireAdmin, requireAuth } from "@/lib/dal";
import { CORE_ROLES, DEFAULT_RATES, type MdRates, type RateEntry } from "@/lib/mdRates";
import { getSupabaseClient } from "@/lib/supabase";

const HISTORY_LIMIT = 30;

type SupabaseClient = ReturnType<typeof getSupabaseClient>;

async function loadEntries(supabase: SupabaseClient): Promise<RateEntry[]> {
  const { data, error } = await supabase
    .from("md_rates")
    .select("role, label, rate, updated_by, updated_at")
    .order("role");
  if (error) throw new Error(error.message);
  const entries = (data ?? []).map((r) => ({ ...r, rate: Number(r.rate) })) as RateEntry[];
  // Core roles first (in breakdown order), reference-only rows after.
  return entries.sort((a, b) => {
    const ai = CORE_ROLES.indexOf(a.role as keyof MdRates);
    const bi = CORE_ROLES.indexOf(b.role as keyof MdRates);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.role.localeCompare(b.role);
  });
}

function toRates(entries: RateEntry[]): MdRates {
  const rates: MdRates = { ...DEFAULT_RATES };
  for (const e of entries) {
    if (e.role in rates) rates[e.role as keyof MdRates] = e.rate;
  }
  return rates;
}

async function fullResponse(supabase: SupabaseClient) {
  const entries = await loadEntries(supabase);
  const { data: history } = await supabase
    .from("md_rate_changes")
    .select("id, role, action, before, after, created_by, created_at")
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  return { rates: toRates(entries), entries, history: history ?? [] };
}

export async function GET() {
  const auth = await requireAuth();
  if (auth.response) return auth.response;
  try {
    return NextResponse.json(await fullResponse(getSupabaseClient()));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// Upsert one master-data row (add a new role or edit label/rate) + audit log.
export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const body = (await request.json()) as { role?: string; label?: string; rate?: number };
  const role = (body.role ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const rate = Number(body.rate);
  if (!role || !Number.isFinite(rate) || rate < 0) {
    return NextResponse.json({ error: "role and a non-negative rate are required" }, { status: 400 });
  }

  const supabase = getSupabaseClient();
  const { data: existing } = await supabase
    .from("md_rates")
    .select("role, label, rate")
    .eq("role", role)
    .maybeSingle();

  const label = body.label?.trim() || existing?.label || role;
  const { error } = await supabase.from("md_rates").upsert({
    role,
    label,
    rate,
    updated_by: auth.session.username,
    updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("md_rate_changes").insert({
    role,
    action: existing ? "update" : "insert",
    before: existing ? { label: existing.label, rate: Number(existing.rate) } : null,
    after: { label, rate },
    created_by: auth.session.username,
  });

  return NextResponse.json(await fullResponse(supabase));
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const { searchParams } = new URL(request.url);
  const role = searchParams.get("role") ?? "";
  if (!role) return NextResponse.json({ error: "role is required" }, { status: 400 });
  if ((CORE_ROLES as string[]).includes(role)) {
    return NextResponse.json(
      { error: "role นี้ใช้คำนวณ cost ของ MD breakdown อยู่ ลบไม่ได้ (แก้ไขอัตราได้)" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseClient();
  const { data: existing } = await supabase
    .from("md_rates")
    .select("role, label, rate")
    .eq("role", role)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "role not found" }, { status: 404 });

  const { error } = await supabase.from("md_rates").delete().eq("role", role);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("md_rate_changes").insert({
    role,
    action: "delete",
    before: { label: existing.label, rate: Number(existing.rate) },
    after: null,
    created_by: auth.session.username,
  });

  return NextResponse.json(await fullResponse(supabase));
}
