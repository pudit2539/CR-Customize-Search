import type { MdBreakdown } from "./types";

// PINNO runs two departments against this data: Presale (quoting brand-new
// clients) and Implement (change requests for clients already live) — the
// old "ลูกค้าใหม่/ลูกค้าเดิม" (new/existing customer) labels were ambiguous
// since either department can touch either kind of client.
export const SOURCE_TYPE_LABEL: Record<string, string> = {
  new_customer: "CR Presale",
  existing_customer: "CR Implement",
};

export const MD_ROLE_LABEL: Record<string, string> = {
  fun_junior: "Fun Junior",
  fun_consultant: "Fun Consultant",
  fun_senior: "Fun Senior",
  dev_consultant: "Dev Consultant",
  dev_senior: "Dev Senior",
  dev_manager: "Dev Manager",
  manager: "Manager",
  // Legacy display label only — pre-split rows still carry this key, never
  // written to by new items (see MdBreakdown.dev_senior_mgr in lib/types.ts).
  dev_senior_mgr: "Dev Senior/Mgr (เดิม)",
};

export const MD_ROLE_COLOR: Record<string, string> = {
  fun_junior: "bg-sky-100 text-sky-700",
  fun_consultant: "bg-cyan-100 text-cyan-700",
  fun_senior: "bg-blue-100 text-blue-700",
  dev_consultant: "bg-violet-100 text-violet-700",
  dev_senior: "bg-purple-100 text-purple-700",
  dev_manager: "bg-fuchsia-100 text-fuchsia-700",
  manager: "bg-pink-100 text-pink-700",
  dev_senior_mgr: "bg-zinc-100 text-zinc-500",
};

// e.g. "Fun Senior 1 MD, Dev Senior & Mgr 1 MD" — only roles that were
// actually used on that item, since most rows only touch 1-2 roles.
export function formatMdBreakdown(breakdown: MdBreakdown | null): string {
  if (!breakdown) return "-";
  const parts = Object.entries(breakdown)
    .filter(([, v]) => v != null)
    .map(([role, v]) => `${MD_ROLE_LABEL[role] ?? role} ${v} MD`);
  return parts.length ? parts.join(", ") : "-";
}

// Same data as formatMdBreakdown but as discrete entries, for rendering each
// role as its own colored pill instead of one comma-joined string. Accepts
// any partial role->value map (not just a full MdBreakdown) so ad-hoc
// breakdowns — e.g. a quotation's manual MD override — can reuse the same
// pill rendering as a real cr_items row.
export function mdBreakdownEntries(
  breakdown: MdBreakdown | Partial<Record<string, number | null | undefined>> | null
): { role: string; label: string; value: number; color: string }[] {
  if (!breakdown) return [];
  return Object.entries(breakdown)
    .filter(([, v]) => v != null)
    .map(([role, v]) => ({
      role,
      label: MD_ROLE_LABEL[role] ?? role,
      value: v as number,
      color: MD_ROLE_COLOR[role] ?? "bg-zinc-100 text-zinc-600",
    }));
}
