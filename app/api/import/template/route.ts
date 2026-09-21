import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/dal";
import { DEFAULT_RATES, type MdRates } from "@/lib/mdRates";
import { getSupabaseClient } from "@/lib/supabase";

const BRAND_RED = "C8102E";

// Matches the exact layout lib/parseExcel.ts already knows how to read:
// sheet name -> source_type, rows 1-5 header (rate card on row 5, cols D-I),
// data from row 6. Keeping this in lockstep with the parser means any file
// filled from this template imports cleanly through the existing /import
// flow with no changes there.
const SHEETS: { name: string; label: string }[] = [
  { name: "Estimate MD (New)", label: "CR Presale (ลูกค้าใหม่)" },
  { name: "Estimate MD", label: "CR Implement (ลูกค้าเดิม)" },
];

const MD_HEADERS = ["Fun Junior", "Fun Consultant", "Fun Senior", "Dev Consultant", "Dev Senior & Mgr", "Manager"];
// Legacy combined column — the bulk-import format only has one Dev
// Senior/Manager column (see lib/parseExcel.ts MD_COLUMNS). Approximated
// with the current Dev Senior rate since that's the more common tier; if a
// line is genuinely Dev-Manager-tier work, note it in Remark and split it
// out later via /items (which does support separate Dev Senior / Dev
// Manager fields).
const MD_RATE_KEYS: (keyof MdRates)[] = ["fun_junior", "fun_consultant", "fun_senior", "dev_consultant", "dev_senior", "manager"];

const OTHER_HEADERS = ["Project", "Industry", "Check", "Priority", "Remark", "Timeline Follow up", "Pre-Sale Note"];

const SAMPLE_ROWS: [number, string, string, (number | null)[], string][] = [
  [1, "TM", "ตัวอย่าง: คำนวณ OT แยกตามกะการทำงาน (ลบแถวนี้ก่อน import จริง)", [null, null, 2, null, null, null], "ตัวอย่างลูกค้า"],
  [2, "BN", "ตัวอย่าง: เพิ่ม Benefit ประกันสุขภาพกลุ่มพนักงาน (ลบแถวนี้ก่อน import จริง)", [null, 1, null, 1, null, null], "ตัวอย่างลูกค้า"],
];

export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const supabase = getSupabaseClient();
  const { data: rateRows } = await supabase.from("md_rates").select("role, rate");
  const rates: MdRates = { ...DEFAULT_RATES };
  for (const r of rateRows ?? []) {
    if (r.role in rates) rates[r.role as keyof MdRates] = Number(r.rate);
  }

  const workbook = new ExcelJS.Workbook();

  for (const { name, label } of SHEETS) {
    const sheet = workbook.addWorksheet(name);
    sheet.columns = [
      { width: 6 },
      { width: 10 },
      { width: 44 },
      ...MD_HEADERS.map(() => ({ width: 12 })),
      { width: 20 },
      { width: 14 },
      { width: 8 },
      { width: 10 },
      { width: 24 },
      { width: 16 },
      { width: 20 },
    ];

    // Row 1: title
    sheet.mergeCells(1, 1, 1, 3 + MD_HEADERS.length);
    sheet.getCell(1, 1).value = `PINNO IPOP — CR/Customize Estimate MD Template (${label})`;
    sheet.getCell(1, 1).font = { bold: true, size: 13, color: { argb: BRAND_RED } };

    // Row 2: instructions
    sheet.mergeCells(2, 1, 2, 3 + MD_HEADERS.length);
    sheet.getCell(2, 1).value =
      "กรอกทีละแถวตั้งแต่แถว 6 เป็นต้นไป — No./Module/Detail จำเป็น, ช่อง MD ใส่เฉพาะ role ที่ใช้จริง (เว้นว่างได้), Cost คำนวณอัตโนมัติจากอัตราแถวที่ 5 เมื่อ import";
    sheet.getCell(2, 1).font = { italic: true, size: 9, color: { argb: "71717A" } };

    // Row 3: column group headers
    sheet.getCell(3, 4).value = "MD Breakdown (Fun / Dev / Manager)";
    sheet.getCell(3, 4).font = { bold: true, size: 9, color: { argb: "52525B" } };
    sheet.mergeCells(3, 4, 3, 3 + MD_HEADERS.length);

    // Row 4: column headers
    const headerRow = 4;
    const headers = ["No.", "Module", "Detail", ...MD_HEADERS, ...OTHER_HEADERS];
    headers.forEach((h, i) => {
      const cell = sheet.getCell(headerRow, i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: "FFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_RED } };
      cell.alignment = { wrapText: true, vertical: "middle" };
    });

    // Row 5: rate card — this is what the importer's cost formula multiplies
    // each MD figure by (see lib/parseExcel.ts RATE_CARD_ROW).
    sheet.getCell(5, 3).value = "อัตรา (บาท/MD) ปัจจุบัน:";
    sheet.getCell(5, 3).font = { italic: true, size: 9 };
    sheet.getCell(5, 3).alignment = { horizontal: "right" };
    MD_RATE_KEYS.forEach((role, i) => {
      const cell = sheet.getCell(5, 4 + i);
      cell.value = rates[role];
      cell.font = { size: 9, color: { argb: "71717A" } };
      cell.alignment = { horizontal: "right" };
    });

    // Sample rows from row 6 — highlighted so they're obviously not real data.
    SAMPLE_ROWS.forEach((sample, i) => {
      const [no, module, detail, md, project] = sample;
      const rowNum = 6 + i;
      const row = sheet.getRow(rowNum);
      row.getCell(1).value = no;
      row.getCell(2).value = module;
      row.getCell(3).value = detail;
      md.forEach((v, mi) => (row.getCell(4 + mi).value = v));
      row.getCell(10).value = project;
      for (let c = 1; c <= headers.length; c++) {
        row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FEF9C3" } };
      }
    });

    sheet.views = [{ state: "frozen", ySplit: 5 }];
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="PINNO_CR_Estimate_MD_Template.xlsx"`,
    },
  });
}
