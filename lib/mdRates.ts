import type { MdBreakdown } from "./types";

// Excludes the legacy dev_senior_mgr field — that role has no active rate
// going forward, it only exists for reading pre-split historical data.
export type CoreRole = Exclude<keyof MdBreakdown, "dev_senior_mgr">;
export type MdRates = Record<CoreRole, number>;

// Fallback if the rates fetch ever fails — kept in sync with the 2026 rate
// card (Project Resource Plan, Cost Rate block). The live values come from
// the md_rates master table, editable in /settings. Dev Senior and Dev
// Manager used to be one blended "dev_senior_mgr" rate — split into Senior
// (same tier as Fun Senior) and Manager-Product per the 2026-07-24 feedback.
export const DEFAULT_RATES: MdRates = {
  fun_junior: 2550,
  fun_consultant: 5050,
  fun_senior: 6300,
  dev_consultant: 5050,
  dev_senior: 6300,
  dev_manager: 9450,
  manager: 8400,
};

// These six keys drive cost suggestions (md_breakdown columns) — they can be
// edited in the master table but never deleted. Extra rows are reference-only.
export const CORE_ROLES = Object.keys(DEFAULT_RATES) as (keyof MdRates)[];

export interface RateEntry {
  role: string;
  label: string | null;
  rate: number;
  updated_by: string | null;
  updated_at: string | null;
}

export interface CostBreakdownLine {
  role: string;
  md: number;
  rate: number;
  amount: number;
}

// Builds a role->rate lookup from every md_rates row (core + legacy +
// reference-only), not just the CORE_ROLES subset — so a pre-split item
// still carrying a legacy `dev_senior_mgr` figure can be priced from its own
// (still-present, just relabeled) rate row instead of being silently
// dropped from cost calculations.
export function ratesMapFromEntries(entries: RateEntry[]): Record<string, number> {
  return Object.fromEntries(entries.map((e) => [e.role, e.rate]));
}

// Every role actually present on this breakdown that has a known rate — not
// just CORE_ROLES, so legacy/reference roles still price correctly as long
// as `rates` (typically from ratesMapFromEntries) knows their rate.
export function computeCostBreakdown(
  breakdownArg: MdBreakdown | Partial<Record<string, number | string | null>> | null,
  rates: Partial<Record<string, number>>
): { lines: CostBreakdownLine[]; total: number } {
  const breakdown = breakdownArg as Partial<Record<string, number | string | null>> | null;
  if (!breakdown) return { lines: [], total: 0 };

  const lines: CostBreakdownLine[] = [];
  for (const role of Object.keys(breakdown)) {
    const raw = breakdown[role];
    const md = raw == null || raw === "" ? 0 : Number(raw);
    const rate = rates[role];
    if (!md || rate == null) continue;
    lines.push({ role, md, rate, amount: md * rate });
  }

  const total = lines.reduce((sum, l) => sum + l.amount, 0);
  return { lines, total };
}

// Total MD across every role present on the breakdown — excludes Manager by
// convention (PM time is project overhead, not itself a delivered manday),
// matching the Summary column in lib/parseExcel.ts and ItemForm's live
// total. Sums whatever roles are actually on the object (not a fixed
// CORE_ROLES list) so a legacy `dev_senior_mgr` figure still counts instead
// of silently vanishing from the total.
export function computeMdTotal(
  breakdownArg: MdBreakdown | Partial<Record<string, number | string | null>> | null
): number {
  const breakdown = breakdownArg as Partial<Record<string, number | string | null>> | null;
  if (!breakdown) return 0;
  return Object.entries(breakdown)
    .filter(([role]) => role !== "manager")
    .reduce((sum, [, v]) => sum + (Number(v) || 0), 0);
}
