import ExcelJS from "exceljs";
import { requireAuth } from "@/lib/dal";
import { allCategories, categoryOf } from "@/lib/moduleCategories";
import { sourceFileDateLabel } from "@/lib/sourceFileDates";
import { getSupabaseClient } from "@/lib/supabase";

const MODE_LABEL: Record<string, string> = {
  new_customer: "CR Presale",
  existing_customer: "CR Implement",
};

const HEADERS = [
  "No.",
  "Module",
  "ประเภท",
  "Requirement",
  "MD รวม",
  "Cost เดิม",
  "Project ที่เคยทำ",
  "Industry",
  "จำนวนลูกค้าที่เคยขอคล้ายกัน",
  "ไฟล์อ้างอิงต้นฉบับ",
  "ประเมินช่วง",
  "เหตุผลที่เสนอ",
  "เสนอโดย",
  "วันที่เสนอ",
  "ผลกระทบต่อ Platform (ลูกค้าอื่น) — โปรดระบุ",
  "ความเห็น พี่ยอด (Product/UI)",
  "มติ พี่ยอด (STD / ปฏิเสธ / ต้องดูเพิ่ม)",
  "ความเห็น พี่แชมป์ (Dev)",
  "มติ พี่แชมป์ (STD / ปฏิเสธ / ต้องดูเพิ่ม)",
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", { dateStyle: "short" });
}

// "จำนวนลูกค้าที่เคยขอคล้ายกัน" is the signal the user asked for: STD only
// makes sense if multiple clients would benefit, since it's a shared
// platform change. Approximated by distinct project names on cr_items rows
// sharing the same module (a rough proxy — exact text match would undercount
// paraphrased requirements, but module + project spread is what's available
// without re-running embeddings per export).
function countDistinctProjects(project: string | null): number {
  if (!project) return 0;
  return project.split(",").map((p) => p.trim()).filter(Boolean).length;
}

export async function GET() {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("std_candidates")
    .select(
      "note, created_by, created_at, cr_items(id, item_no, module, source_type, detail, md_summary, cost, project, industry, import_batch_id, import_batches(filename))"
    )
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Group by business category (same buckets as /std-candidates and /items)
  // so พี่ยอด/พี่แชมป์ can review one product area at a time instead of a
  // flat list mixing every module together.
  type RowItem = Record<string, unknown> & { import_batches: { filename: string } | null };
  const grouped = new Map<string, { row: (typeof data)[number]; item: RowItem }[]>();
  for (const row of data ?? []) {
    const item = row.cr_items as unknown as RowItem | null;
    if (!item) continue;
    const category = categoryOf(item.module as string | null);
    if (!grouped.has(category)) grouped.set(category, []);
    grouped.get(category)!.push({ row, item });
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("STD Candidates");
  sheet.addRow(HEADERS);
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { wrapText: true };

  const orderedCategories = allCategories().filter((c) => grouped.has(c));
  for (const category of orderedCategories) {
    const entries = grouped.get(category)!;
    const headerRow = sheet.addRow([`${category} (${entries.length})`]);
    sheet.mergeCells(headerRow.number, 1, headerRow.number, HEADERS.length);
    headerRow.getCell(1).font = { bold: true, color: { argb: "FFFFFF" } };
    headerRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "6366F1" } };

    for (const { row, item } of entries) {
      const filename = item.import_batches?.filename ?? null;
      sheet.addRow([
        item.item_no,
        item.module,
        MODE_LABEL[item.source_type as string] ?? item.source_type,
        item.detail,
        item.md_summary,
        item.cost,
        item.project,
        item.industry,
        countDistinctProjects(item.project as string | null),
        filename ?? "ไม่มีไฟล์อ้างอิง",
        sourceFileDateLabel(filename) ?? "-",
        row.note ?? "-",
        row.created_by ?? "-",
        formatDate(row.created_at),
        "", // ผลกระทบต่อ platform — filled in during review
        "", // ความเห็นพี่ยอด
        "", // มติพี่ยอด
        "", // ความเห็นพี่แชมป์
        "", // มติพี่แชมป์
      ]);
    }
  }

  sheet.columns.forEach((col, i) => {
    col.width = [6, 10, 16, 40, 8, 12, 20, 14, 12, 30, 16, 30, 12, 12, 30, 30, 20, 30, 20][i] ?? 18;
  });
  sheet.getColumn(4).alignment = { wrapText: true, vertical: "top" };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `std_candidates_${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
