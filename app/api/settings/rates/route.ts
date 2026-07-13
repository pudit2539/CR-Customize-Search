import { NextResponse } from "next/server";
import { requireAdmin, requireAuth } from "@/lib/dal";
import { DEFAULT_RATES, type MdRates } from "@/lib/mdRates";
import { getSupabaseClient } from "@/lib/supabase";

const ROLES = Object.keys(DEFAULT_RATES) as (keyof MdRates)[];

export async function GET() {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("md_rates").select("role, rate");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rates: MdRates = { ...DEFAULT_RATES };
  for (const row of data ?? []) {
    if (row.role in rates) rates[row.role as keyof MdRates] = Number(row.rate);
  }
  return NextResponse.json({ rates });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const body = (await request.json()) as Partial<Record<keyof MdRates, number>>;
  const updates = ROLES.filter((role) => body[role] != null && Number.isFinite(Number(body[role])));
  if (updates.length === 0) {
    return NextResponse.json({ error: "no valid rate values provided" }, { status: 400 });
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.from("md_rates").upsert(
    updates.map((role) => ({ role, rate: Number(body[role]), updated_at: new Date().toISOString() }))
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = await supabase.from("md_rates").select("role, rate");
  const rates: MdRates = { ...DEFAULT_RATES };
  for (const row of data ?? []) {
    if (row.role in rates) rates[row.role as keyof MdRates] = Number(row.rate);
  }
  return NextResponse.json({ rates });
}
