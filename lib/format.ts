import type { MdBreakdown } from "./types";

const MD_ROLE_LABEL: Record<string, string> = {
  fun_junior: "Fun Junior",
  fun_consultant: "Fun Consultant",
  fun_senior: "Fun Senior",
  dev_consultant: "Dev Consultant",
  dev_senior_mgr: "Dev Senior & Mgr",
  manager: "Manager",
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
