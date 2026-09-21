import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/dal";
import { categoryOf } from "@/lib/moduleCategories";
import { getSupabaseClient } from "@/lib/supabase";
import type { CrItemRow, SourceType } from "@/lib/types";

const SHEET_NAME: Record<SourceType, string> = {
  new_customer: "Estimate MD (New)",
  existing_customer: "Estimate MD",
};

const HEADERS = [
  "No.",
  "Module",
  "Detail",
  "Fun Junior",
  "Fun Consultant",
  "Fun Senior",
  "Dev Consultant",
  "Dev Senior",
  "Dev Manager",
  "Manager",
  "Dev Senior & Mgr (เดิม)",
  "Summary",
  "Cost",
  "Project",
  "Industry",
  "Check",
  "Priority",
  "Remark",
  "Timeline Follow up",
  "Pre-Sale",
];

function toRow(item: CrItemRow): (string | number | null)[] {
  const b = item.md_breakdown;
  return [
    item.item_no,
    item.module,
    item.detail,
    b?.fun_junior ?? null,
    b?.fun_consultant ?? null,
    b?.fun_senior ?? null,
    b?.dev_consultant ?? null,
    b?.dev_senior ?? null,
    b?.dev_manager ?? null,
    b?.manager ?? null,
    b?.dev_senior_mgr ?? null,
    item.md_summary,
    item.cost,
    item.project,
    item.industry,
    item.check_note,
    item.priority,
    item.remark,
    item.timeline_followup,
    item.presale_note,
  ];
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const { searchParams } = new URL(request.url);
  const sourceTypeFilter = searchParams.get("source_type");
  const categoryFilter = searchParams.get("category");
  const projectFilter = searchParams.get("project");

  const supabase = getSupabaseClient();
  let query = supabase
    .from("cr_items")
    .select(
      "source_type, item_no, module, detail, md_breakdown, md_summary, cost, project, industry, check_note, priority, remark, timeline_followup, presale_note"
    )
    .order("item_no", { ascending: true });
  if (sourceTypeFilter) query = query.eq("source_type", sourceTypeFilter);
  if (projectFilter) query = query.ilike("project", `%${projectFilter}%`);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Category is derived from module, not a DB column — filter in JS same as
  // the dashboard aggregation does.
  const rows = categoryFilter
    ? (data ?? []).filter((i) => categoryOf(i.module) === categoryFilter)
    : data ?? [];

  const sourceTypesToInclude = sourceTypeFilter
    ? [sourceTypeFilter as SourceType]
    : (["new_customer", "existing_customer"] as const);

  const workbook = new ExcelJS.Workbook();
  for (const sourceType of sourceTypesToInclude) {
    const sheet = workbook.addWorksheet(SHEET_NAME[sourceType]);
    sheet.addRow(HEADERS);
    sheet.getRow(1).font = { bold: true };
    for (const item of rows.filter((i) => i.source_type === sourceType)) {
      sheet.addRow(toRow(item as CrItemRow));
    }
    sheet.columns.forEach((col) => (col.width = 20));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `cr_items_export_${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
