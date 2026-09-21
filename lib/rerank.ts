import type { SupabaseClient } from "@supabase/supabase-js";
import type { CrItemMatch } from "./types";

// Max score bonus for an item updated today, decaying towards 0 as it ages.
// Small enough that a genuinely more relevant older match still outranks a
// recent-but-worse one — this only breaks near-ties, e.g. the same
// requirement re-quoted for several clients where the price likely changed.
const MAX_RECENCY_BONUS = 0.03;
const RECENCY_HALFLIFE_DAYS = 365;

// Secondary tie-break, per 2026-07-24 feedback: among otherwise-close
// matches, prefer the cheaper one — and an item with no recorded cost at all
// should float up further still, since that's a data gap the team should
// notice and fill in, not a result to quietly rank low. Both stay smaller
// than a genuine similarity gap so they only ever break near-ties.
const MAX_PRICE_BONUS = 0.02;
const MISSING_PRICE_BONUS = 0.025;

// Small nudge per confirmed-correct feedback (see /api/match-feedback),
// capped low so a handful of confirmations only breaks near-ties, not
// override genuine similarity differences.
const CONFIRM_BONUS_PER = 0.005;
const MAX_CONFIRM_BONUS = 0.02;

// Re-scores candidates by similarity + small recency/price bonuses, then
// returns the top `limit`. Needs each candidate's updated_at, which
// match_cr_items doesn't return (adding it there would mean another SQL
// migration) — so this does one follow-up query instead.
export async function rerankByRecency(
  supabase: SupabaseClient,
  candidates: CrItemMatch[],
  limit: number
): Promise<CrItemMatch[]> {
  if (candidates.length === 0) return candidates;

  const { data: dated } = await supabase
    .from("cr_items")
    .select("id, updated_at")
    .in(
      "id",
      candidates.map((c) => c.id)
    );
  const updatedAtById = new Map((dated ?? []).map((r) => [r.id, r.updated_at as string | null]));

  const { data: feedback } = await supabase
    .from("match_feedback")
    .select("item_id")
    .in(
      "item_id",
      candidates.map((c) => c.id)
    );
  const confirmCountById = new Map<string, number>();
  for (const f of feedback ?? []) {
    confirmCountById.set(f.item_id, (confirmCountById.get(f.item_id) ?? 0) + 1);
  }

  const knownCosts = candidates.map((c) => c.cost).filter((c): c is number => c != null);
  const maxCost = knownCosts.length > 0 ? Math.max(...knownCosts) : 0;

  const now = Date.now();
  const scored = candidates.map((c) => {
    const updatedAt = updatedAtById.get(c.id);
    const ageDays = updatedAt ? (now - new Date(updatedAt).getTime()) / 86_400_000 : Infinity;
    const recencyBonus = MAX_RECENCY_BONUS * RECENCY_HALFLIFE_DAYS / (RECENCY_HALFLIFE_DAYS + Math.max(ageDays, 0));
    const priceBonus =
      c.cost == null ? MISSING_PRICE_BONUS : maxCost > 0 ? MAX_PRICE_BONUS * (1 - c.cost / maxCost) : 0;
    const confirmBonus = Math.min(MAX_CONFIRM_BONUS, CONFIRM_BONUS_PER * (confirmCountById.get(c.id) ?? 0));
    return { item: c, score: c.similarity + recencyBonus + priceBonus + confirmBonus };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.item);
}
