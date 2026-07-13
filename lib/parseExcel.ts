import ExcelJS from "exceljs";

export type SourceType = "new_customer" | "existing_customer";

export interface ParsedCrItem {
  source_type: SourceType;
  item_no: number | null;
  module: string | null;
  detail: string;
  md_breakdown: {
    fun_junior: number | null;
    fun_consultant: number | null;
    fun_senior: number | null;
    dev_consultant: number | null;
    dev_senior_mgr: number | null;
    manager: number | null;
  };
  md_summary: number | null;
  cost: number | null;
  project: string | null;
  industry: string | null;
  check_note: string | null;
  priority: string | null;
  remark: string | null;
  timeline_followup: string | null;
  presale_note: string | null;
}

// Sheet name -> which side of the business this data represents.
const SHEET_MAP: Record<string, SourceType> = {
  "Estimate MD (New)": "new_customer",
  "Estimate MD": "existing_customer",
};

// Both sheets share the same layout: rows 1-5 are a multi-row header
// (labels + role sub-labels + rate card in row 5, cols D-I), data starts at row 6.
const DATA_START_ROW = 6;
const RATE_CARD_ROW = 5;
const MD_COLUMNS = [4, 5, 6, 7, 8, 9] as const; // fun_junior..manager, D-I

// Formula cells come back as { formula, result } or { result, sharedFormula } —
// unwrap to the computed result before treating the value as text/number.
function unwrapFormula(value: ExcelJS.CellValue): ExcelJS.CellValue {
  if (value !== null && typeof value === "object" && "result" in (value as object)) {
    return (value as { result: ExcelJS.CellValue }).result;
  }
  return value;
}

function cellText(rawValue: ExcelJS.CellValue): string | null {
  const value = unwrapFormula(rawValue);
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && "richText" in (value as object)) {
    return (value as { richText: { text: string }[] })
      .richText.map((r) => r.text)
      .join("")
      .trim();
  }
  if (typeof value === "object" && "text" in (value as object)) {
    return String((value as { text: unknown }).text).trim();
  }
  const text = String(value).trim();
  return text.length ? text : null;
}

function cellNumber(rawValue: ExcelJS.CellValue): number | null {
  const value = unwrapFormula(rawValue);
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function parseWorkbook(buffer: Buffer): Promise<ParsedCrItem[]> {
  const workbook = new ExcelJS.Workbook();
  // exceljs's bundled type defs disagree with the generic `Buffer<T>` shape
  // from the project's @types/node — the runtime value is fine either way.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any);

  const items: ParsedCrItem[] = [];

  for (const [sheetName, sourceType] of Object.entries(SHEET_MAP)) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) continue;

    // Cached formula results for the Summary/Cost columns are unreliable via
    // exceljs (shared-formula master cells often carry no cached value), so
    // recompute both from the MD breakdown + this sheet's own rate card
    // instead of trusting Excel's stored SUM/SUMPRODUCT results.
    const rateRow = sheet.getRow(RATE_CARD_ROW);
    const rates = MD_COLUMNS.map((col) => cellNumber(rateRow.getCell(col).value) ?? 0);

    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber < DATA_START_ROW) return;

      const get = (col: number) => row.getCell(col).value;
      const detail = cellText(get(3));
      // Skip stray/blank rows that carry no requirement text.
      if (!detail) return;

      const mdValues = MD_COLUMNS.map((col) => cellNumber(get(col)));
      const [fun_junior, fun_consultant, fun_senior, dev_consultant, dev_senior_mgr, manager] =
        mdValues;

      // Matches the sheet's own formulas: Summary excludes Manager mandays,
      // Cost includes every role's cost.
      const md_summary = mdValues
        .slice(0, 5)
        .reduce((sum: number, v) => sum + (v ?? 0), 0);
      const cost = mdValues.reduce((sum: number, v, i) => sum + (v ?? 0) * rates[i], 0);

      items.push({
        source_type: sourceType,
        item_no: cellNumber(get(1)),
        module: cellText(get(2)),
        detail,
        md_breakdown: {
          fun_junior,
          fun_consultant,
          fun_senior,
          dev_consultant,
          dev_senior_mgr,
          manager,
        },
        md_summary,
        cost,
        project: cellText(get(12)),
        industry: cellText(get(13)),
        check_note: cellText(get(14)),
        priority: cellText(get(15)),
        remark: cellText(get(16)),
        timeline_followup: cellText(get(17)),
        presale_note: cellText(get(18)),
      });
    });
  }

  return items;
}

// Text sent to the embedding model — module gives short category context,
// detail carries the actual requirement wording that gets matched against.
export function embeddingText(item: Pick<ParsedCrItem, "module" | "detail">): string {
  return item.module ? `[${item.module}] ${item.detail}` : item.detail;
}
