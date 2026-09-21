import { Fragment } from "react";
import type { MdBreakdown } from "@/lib/types";

// Renders an MD breakdown as a small Fun/Dev × Level grid instead of a row
// of colored pills — per 2026-07-24 feedback, easier to scan when a case
// touches multiple roles at once. "Manager (PM)" and the legacy combined
// "Dev Senior/Mgr" figure don't fit the Fun/Dev axis, so they're listed
// underneath instead of forced into a column that would mostly be empty.
//
// Built as a CSS grid rather than a <table> — table column auto-sizing made
// single-column headers (e.g. just "Senior") hug their text instead of
// filling/centering in the cell; grid gives every cell explicit centering
// regardless of how many level columns are present.
const LEVELS = ["junior", "consultant", "senior", "manager"] as const;
type Level = (typeof LEVELS)[number];
const LEVEL_LABEL: Record<Level, string> = {
  junior: "Junior",
  consultant: "Consultant",
  senior: "Senior",
  manager: "Manager",
};
const CATEGORY_ROLE: Record<string, Partial<Record<Level, string>>> = {
  Fun: { junior: "fun_junior", consultant: "fun_consultant", senior: "fun_senior" },
  Dev: { junior: "dev_junior", consultant: "dev_consultant", senior: "dev_senior", manager: "dev_manager" },
};
// Matches the Fun/Dev color families already used for the pill views
// elsewhere (lib/format.ts MD_ROLE_COLOR) so this reads as the same system.
const CATEGORY_COLOR: Record<string, string> = { Fun: "text-sky-600", Dev: "text-violet-600" };

interface MdMatrixProps {
  breakdown: MdBreakdown | Partial<Record<string, number | null | undefined>> | null;
  className?: string;
}

export default function MdMatrix({ breakdown: breakdownProp, className }: MdMatrixProps) {
  // Cast once for bracket-notation access below — MdBreakdown has no index
  // signature, but every field this component reads is dynamic by role key.
  const breakdown = breakdownProp as Partial<Record<string, number | null | undefined>> | null;
  if (!breakdown) return <span className="text-zinc-400">-</span>;

  const usedLevels = LEVELS.filter((lvl) =>
    Object.values(CATEGORY_ROLE).some((roles) => roles[lvl] && breakdown[roles[lvl]!] != null)
  );
  const usedCategories = Object.keys(CATEGORY_ROLE).filter((cat) =>
    Object.values(CATEGORY_ROLE[cat]).some((role) => role && breakdown[role] != null)
  );
  const extras = [
    breakdown.manager != null && { label: "Manager (PM)", value: breakdown.manager },
    breakdown.dev_senior_mgr != null && { label: "Dev Senior/Mgr (เดิม)", value: breakdown.dev_senior_mgr },
  ].filter((e): e is { label: string; value: number } => Boolean(e));

  if (usedCategories.length === 0 && extras.length === 0) return <span className="text-zinc-400">-</span>;

  return (
    <div
      className={`inline-block overflow-hidden rounded-lg border border-zinc-100 bg-white shadow-sm shadow-zinc-100 ${className ?? ""}`}
    >
      {usedCategories.length > 0 && (
        <div
          className="grid text-xs"
          style={{ gridTemplateColumns: `auto repeat(${usedLevels.length}, minmax(2.75rem, 1fr))` }}
        >
          <div className="border-b border-zinc-100 bg-zinc-50/80" />
          {usedLevels.map((lvl) => (
            <div
              key={lvl}
              className="flex items-center justify-center border-b border-zinc-100 bg-zinc-50/80 px-2.5 py-1 text-center font-medium whitespace-nowrap text-zinc-400"
            >
              {LEVEL_LABEL[lvl]}
            </div>
          ))}
          {usedCategories.map((cat, i) => (
            <Fragment key={cat}>
              <div
                className={`flex items-center px-2.5 py-1 font-semibold whitespace-nowrap ${CATEGORY_COLOR[cat] ?? "text-zinc-500"} ${i > 0 ? "border-t border-zinc-100" : ""}`}
              >
                {cat}
              </div>
              {usedLevels.map((lvl) => {
                const role = CATEGORY_ROLE[cat][lvl];
                const v = role ? breakdown[role] : null;
                return (
                  <div
                    key={lvl}
                    className={`flex items-center justify-center px-2.5 py-1 text-center font-medium text-zinc-700 ${i > 0 ? "border-t border-zinc-100" : ""}`}
                  >
                    {v ?? <span className="font-normal text-zinc-300">–</span>}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      )}
      {extras.length > 0 && (
        <p
          className={`px-2.5 py-1 text-[10px] text-zinc-400 ${usedCategories.length > 0 ? "border-t border-zinc-100 bg-zinc-50/80" : ""}`}
        >
          {extras.map((e) => `${e.label}: ${e.value} MD`).join(" · ")}
        </p>
      )}
    </div>
  );
}
