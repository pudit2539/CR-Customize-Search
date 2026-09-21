import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/dal";
import { getSupabaseClient } from "@/lib/supabase";

// Which md_rates rows each rate-card level updates. "Consult" feeds both the
// functional and dev consultant roles (same rate in the card). Levels not in
// this map (e.g. a future new level) are upserted as their own reference row.
const LEVEL_TO_ROLES: [RegExp, string[]][] = [
  [/^junior$/i, ["fun_junior"]],
  [/^consult(ant)?$/i, ["fun_consultant", "dev_consultant"]],
  [/^senior$/i, ["fun_senior"]],
  [/^manager[\s-]*im$/i, ["manager"]],
  [/^manager[\s-]*product$/i, ["manager_product"]],
  [/^(project\s*)?manager$/i, ["manager"]],
];

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("text" in value) return String(value.text);
  }
  return String(value);
}

function cellNumber(value: ExcelJS.CellValue): number | null {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "result" in value) {
    return cellNumber(value.result as ExcelJS.CellValue);
  }
  const n = Number(cellText(value).replace(/,/g, ""));
  return Number.isFinite(n) && cellText(value).trim() !== "" ? n : null;
}

interface ParsedLevel {
  level: string;
  rate: number;
}

// Finds a "Cost Rate | <year> | <year> ..." block anywhere in the workbook
// (the layout used by Project Resource Plan_Template.xlsx) and returns the
// levels with the latest year's rate. Falls back to a simple 2-column
// "role/level | rate" sheet if no such block exists.
function parseRateCard(wb: ExcelJS.Workbook): { levels: ParsedLevel[]; year: number | null } {
  for (const ws of wb.worksheets) {
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= row.cellCount; c++) {
        if (!/^cost\s*rate\s*$/i.test(cellText(row.getCell(c).value).trim())) continue;

        // Year headers sit to the right of the "Cost Rate" cell.
        const yearCols: { col: number; year: number }[] = [];
        for (let yc = c + 1; yc <= c + 6; yc++) {
          const y = cellNumber(row.getCell(yc).value);
          if (y != null && y >= 2000 && y <= 2100) yearCols.push({ col: yc, year: y });
        }
        if (yearCols.length === 0) continue;
        const latest = yearCols.reduce((a, b) => (b.year > a.year ? b : a));

        const levels: ParsedLevel[] = [];
        for (let lr = r + 1; lr <= r + 30; lr++) {
          const name = cellText(ws.getRow(lr).getCell(c).value).trim();
          if (!name) break;
          const rate = cellNumber(ws.getRow(lr).getCell(latest.col).value);
          if (rate != null && rate > 0) levels.push({ level: name, rate });
        }
        if (levels.length > 0) return { levels, year: latest.year };
      }
    }
  }

  // Fallback: first sheet as a plain "level | rate" list (header optional).
  const ws = wb.worksheets[0];
  const levels: ParsedLevel[] = [];
  if (ws) {
    for (let r = 1; r <= ws.rowCount; r++) {
      const name = cellText(ws.getRow(r).getCell(1).value).trim();
      const rate = cellNumber(ws.getRow(r).getCell(2).value);
      if (name && rate != null && rate > 0) levels.push({ level: name, rate });
    }
  }
  return { levels, year: null };
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "missing file" }, { status: 400 });
  }
  const filename = "name" in file && file.name ? file.name : "rates.xlsx";

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const { levels, year } = parseRateCard(wb);
  if (levels.length === 0) {
    return NextResponse.json(
      { error: "ไม่พบตารางอัตราในไฟล์ (มองหา block 'Cost Rate' หรือชีทแบบ 2 คอลัมน์ ระดับ|อัตรา)" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseClient();
  const { data: existingRows } = await supabase.from("md_rates").select("role, label, rate");
  const existing = new Map((existingRows ?? []).map((r) => [r.role, r]));

  const applied: { role: string; label: string; from: number | null; to: number }[] = [];
  const unchanged: string[] = [];

  for (const { level, rate } of levels) {
    const mapped = LEVEL_TO_ROLES.find(([re]) => re.test(level))?.[1] ?? [
      level.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""),
    ];
    for (const role of mapped) {
      const before = existing.get(role);
      const beforeRate = before ? Number(before.rate) : null;
      if (beforeRate === rate) {
        unchanged.push(role);
        continue;
      }
      const label = before?.label ?? level;
      const { error } = await supabase.from("md_rates").upsert({
        role,
        label,
        rate,
        updated_by: auth.session.username,
        updated_at: new Date().toISOString(),
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await supabase.from("md_rate_changes").insert({
        role,
        action: "import",
        before: before ? { label: before.label, rate: beforeRate } : null,
        after: { label, rate, source_file: filename, rate_year: year },
        created_by: auth.session.username,
      });
      applied.push({ role, label, from: beforeRate, to: rate });
    }
  }

  return NextResponse.json({ applied, unchanged, year, filename });
}
