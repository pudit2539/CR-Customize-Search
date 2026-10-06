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
const CATEGORY_DOT: Record<string, string> = { Fun: "bg-sky-500", Dev: "bg-violet-500" };

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
      className={`inline-block max-w-full overflow-hidden rounded-lg border border-slate-200/80 bg-white text-left ${className ?? ""}`}
    >
      {usedCategories.length > 0 && (
        <div
          className="grid text-xs tabular-nums"
          style={{ gridTemplateColumns: `auto repeat(${usedLevels.length}, minmax(3rem, 1fr))` }}
        >
          <div className="bg-slate-50 px-2.5 py-1" />
          {usedLevels.map((lvl) => (
            <div
              key={lvl}
              className="bg-slate-50 px-2.5 py-1 text-center text-[10px] font-semibold tracking-wide whitespace-nowrap text-slate-400 uppercase"
            >
              {LEVEL_LABEL[lvl]}
            </div>
          ))}
          {usedCategories.map((cat) => (
            <Fragment key={cat}>
              <div className="flex items-center gap-1.5 border-t border-slate-100 px-2.5 py-1.5 font-semibold whitespace-nowrap text-slate-700">
                <span className={`h-1.5 w-1.5 rounded-full ${CATEGORY_DOT[cat] ?? "bg-slate-400"}`} />
                {cat}
              </div>
              {usedLevels.map((lvl) => {
                const role = CATEGORY_ROLE[cat][lvl];
                const v = role ? breakdown[role] : null;
                return (
                  <div
                    key={lvl}
                    className="border-t border-slate-100 px-2.5 py-1.5 text-center font-medium text-slate-800"
                  >
                    {v ?? <span className="font-normal text-slate-300">–</span>}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      )}
      {extras.map((e, i) => (
        <div
          key={e.label}
          className={`flex items-center justify-between gap-4 bg-slate-50/70 px-2.5 py-1.5 text-[11px] whitespace-nowrap tabular-nums ${
            usedCategories.length > 0 || i > 0 ? "border-t border-slate-100" : ""
          }`}
        >
          <span className="text-slate-500">{e.label}</span>
          <span className="font-semibold text-slate-700">{e.value} MD</span>
        </div>
      ))}
    </div>
  );
}
