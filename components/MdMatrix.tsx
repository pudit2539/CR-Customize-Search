import type { MdBreakdown } from "@/lib/types";

// Renders an MD breakdown as a wrapping row of two-part chips — a tinted
// "Fun · Senior" label beside a bold number — instead of a fixed grid.
// Only roles that actually carry MD are shown (no empty "–" cells), so a
// one-role case is a single chip and a multi-role case wraps naturally in
// narrow table cells. Colors keep the Fun (sky) / Dev (violet) families used
// elsewhere (lib/format.ts MD_ROLE_COLOR); "Manager (PM)" and the legacy
// combined "Dev Senior/Mgr" figure get their own neutral / dashed-amber
// styling since they don't sit on the Fun/Dev axis.
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
const CATEGORY_STYLE: Record<string, { label: string; dot: string; border: string }> = {
  Fun: { label: "bg-sky-50 text-sky-700", dot: "bg-sky-500", border: "border-sky-200" },
  Dev: { label: "bg-violet-50 text-violet-700", dot: "bg-violet-500", border: "border-violet-200" },
};

interface Chip {
  key: string;
  label: string;
  value: number;
  labelClass: string;
  dot: string;
  borderClass: string;
}

interface MdMatrixProps {
  breakdown: MdBreakdown | Partial<Record<string, number | null | undefined>> | null;
  className?: string;
}

export default function MdMatrix({ breakdown: breakdownProp, className }: MdMatrixProps) {
  // Cast once for bracket-notation access below — MdBreakdown has no index
  // signature, but every field this component reads is dynamic by role key.
  const breakdown = breakdownProp as Partial<Record<string, number | null | undefined>> | null;
  if (!breakdown) return <span className="text-slate-400">-</span>;

  const chips: Chip[] = [];
  for (const cat of Object.keys(CATEGORY_ROLE)) {
    for (const lvl of LEVELS) {
      const role = CATEGORY_ROLE[cat][lvl];
      const v = role ? breakdown[role] : null;
      if (v == null) continue;
      const style = CATEGORY_STYLE[cat];
      chips.push({
        key: role!,
        label: `${cat} · ${LEVEL_LABEL[lvl]}`,
        value: v,
        labelClass: style.label,
        dot: style.dot,
        borderClass: style.border,
      });
    }
  }
  if (breakdown.manager != null) {
    chips.push({
      key: "manager",
      label: "Manager (PM)",
      value: breakdown.manager,
      labelClass: "bg-slate-100 text-slate-600",
      dot: "bg-slate-500",
      borderClass: "border-slate-200",
    });
  }
  if (breakdown.dev_senior_mgr != null) {
    chips.push({
      key: "dev_senior_mgr",
      label: "Dev Senior/Mgr (เดิม)",
      value: breakdown.dev_senior_mgr,
      labelClass: "bg-amber-50 text-amber-700",
      dot: "bg-amber-500",
      borderClass: "border-dashed border-amber-300",
    });
  }

  if (chips.length === 0) return <span className="text-slate-400">-</span>;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className ?? ""}`}>
      {chips.map((c) => (
        <span
          key={c.key}
          className={`inline-flex items-stretch overflow-hidden rounded-lg border bg-white text-xs ${c.borderClass}`}
        >
          <span className={`flex items-center gap-1.5 px-2 py-1 font-medium whitespace-nowrap ${c.labelClass}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
            {c.label}
          </span>
          <span className="flex items-center px-2 py-1 font-semibold text-slate-900 tabular-nums">{c.value}</span>
        </span>
      ))}
    </div>
  );
}
