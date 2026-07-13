import type { MdBreakdown } from "./types";

export type MdRates = Record<keyof MdBreakdown, number>;

// Mirrors the md_rates seed in supabase/schema.sql — used as a fallback so
// the UI still works (with the rates that were true until someone changes
// them in /settings) if the rates fetch ever fails.
export const DEFAULT_RATES: MdRates = {
  fun_junior: 2400,
  fun_consultant: 4800,
  fun_senior: 6000,
  dev_consultant: 4800,
  dev_senior_mgr: 7000,
  manager: 8000,
};

export interface CostBreakdownLine {
  role: keyof MdBreakdown;
  md: number;
  rate: number;
  amount: number;
}

// Only roles actually used on this breakdown — most items only touch 1-2
// roles, no point listing the other 4 at zero.
export function computeCostBreakdown(
  breakdown: Partial<Record<keyof MdBreakdown, number | string | null>> | null,
  rates: MdRates
): { lines: CostBreakdownLine[]; total: number } {
  if (!breakdown) return { lines: [], total: 0 };

  const lines: CostBreakdownLine[] = [];
  for (const role of Object.keys(rates) as (keyof MdBreakdown)[]) {
    const raw = breakdown[role];
    const md = raw == null || raw === "" ? 0 : Number(raw);
    if (!md) continue;
    const rate = rates[role];
    lines.push({ role, md, rate, amount: md * rate });
  }

  const total = lines.reduce((sum, l) => sum + l.amount, 0);
  return { lines, total };
}
