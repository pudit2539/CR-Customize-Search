import mammoth from "mammoth";
import ExcelJS from "exceljs";

// Claude reads PDFs natively as a document content block (see lib/claude.ts)
// — no local text extraction needed for that format, so this only ever
// returns text OR a base64 PDF, never both.
export type DocInput = { text: string } | { pdfBase64: string };

function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "object") {
    if ("richText" in value) return (value as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
    if ("text" in value) return String((value as { text: unknown }).text);
    if ("result" in value) return cellToString((value as { result: ExcelJS.CellValue }).result);
  }
  return String(value);
}

// Flattens every non-empty row of every sheet into one "cell | cell | cell"
// line per row — used for freeform/unformatted Excel uploads that don't
// follow the fixed Estimate MD layout lib/parseExcel.ts expects, so Claude
// gets the raw content instead of a parser silently reading nothing.
async function xlsxToText(buffer: Buffer): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any);
  const lines: string[] = [];
  workbook.eachSheet((sheet) => {
    lines.push(`--- Sheet: ${sheet.name} ---`);
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells = (row.values as ExcelJS.CellValue[]).slice(1).map(cellToString).filter((c) => c.trim());
      if (cells.length) lines.push(cells.join(" | "));
    });
  });
  return lines.join("\n");
}

// Extracts document content for the AI import flows (Create Quotation doc
// upload, freeform Import upload). .docx and .xlsx are converted to plain
// text here; .pdf is handed to Claude as a native document block instead
// (image-heavy scanned PDFs read better that way than through a text-only
// extractor).
export async function extractDocInput(buffer: Buffer, filename: string): Promise<DocInput> {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "pdf") return { pdfBase64: buffer.toString("base64") };
  if (ext === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    if (!result.value.trim()) throw new Error("ไม่พบข้อความในไฟล์ Word นี้");
    return { text: result.value };
  }
  if (ext === "xlsx") {
    const text = await xlsxToText(buffer);
    if (!text.trim()) throw new Error("ไม่พบข้อมูลในไฟล์ Excel นี้");
    return { text };
  }
  throw new Error(`ไม่รองรับไฟล์ประเภทนี้ (.${ext}) — รองรับ .docx, .xlsx, .pdf`);
}
