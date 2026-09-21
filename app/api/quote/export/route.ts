import ExcelJS from "exceljs";
import { requireAuth } from "@/lib/dal";
import { MD_ROLE_LABEL } from "@/lib/format";

const BRAND_RED = "C8102E";
const VAT_RATE = 0.07;

interface QuoteItem {
  description: string;
  md?: number | null;
  amount: number | null;
  mdBreakdown?: Partial<Record<string, number>> | null;
}

// "Fun Senior: 2 MD, Dev Consultant: 3 MD" — per 2026-07-24 feedback, the
// quotation should distinguish Fun/Dev and level, not just show one MD
// total. Lists every role actually present on the breakdown (not a fixed
// role list) so a legacy pre-split "Dev Senior/Mgr" figure still shows.
function formatBreakdown(breakdown: QuoteItem["mdBreakdown"]): string {
  if (!breakdown) return "";
  return Object.entries(breakdown)
    .filter(([, v]) => v != null && v !== 0)
    .map(([role, v]) => `${MD_ROLE_LABEL[role] ?? role}: ${v} MD`)
    .join(", ");
}

interface QuoteRequest {
  customerName: string;
  customerAddress?: string;
  contactPerson?: string;
  quotationNo?: string;
  validDays?: number;
  items: QuoteItem[];
}

function thickBorder(color = "D4D4D8") {
  return {
    top: { style: "thin" as const, color: { argb: color } },
    left: { style: "thin" as const, color: { argb: color } },
    bottom: { style: "thin" as const, color: { argb: color } },
    right: { style: "thin" as const, color: { argb: color } },
  };
}

// Generic PINNO-branded quotation template — reusable for any selection of
// requirements (from search results or the Quick Estimator), not tied to a
// specific client. Matches the letterhead/table/terms layout seen across the
// real quotation files this app has ingested, simplified to one clean sheet.
export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const body = (await request.json()) as QuoteRequest;
  if (!body.customerName?.trim() || !body.items?.length) {
    return Response.json({ error: "customerName and items are required" }, { status: 400 });
  }

  const today = new Date();
  const validDays = body.validDays ?? 30;
  const validTo = new Date(today.getTime() + validDays * 86_400_000);
  const quotationNo = body.quotationNo?.trim() || `DRAFT-${today.toISOString().slice(0, 10)}`;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Quotation", { views: [{ showGridLines: false }] });
  sheet.columns = [
    { width: 6 },
    { width: 46 },
    { width: 10 },
    { width: 16 },
    { width: 16 },
  ];

  // Letterhead
  sheet.mergeCells("A1:B1");
  sheet.getCell("A1").value = "PINNO SOLUTIONS CO., LTD.";
  sheet.getCell("A1").font = { bold: true, size: 14, color: { argb: BRAND_RED } };
  sheet.mergeCells("A2:B2");
  sheet.getCell("A2").value = "2034/84 ITAL-THAI TOWER 18TH FL., NEW PETCHABURI RD., BANGKAPI, HUAYKWANG, BANGKOK 10310";
  sheet.getCell("A2").font = { size: 9, color: { argb: "71717A" } };
  sheet.mergeCells("A3:B3");
  sheet.getCell("A3").value = "Tel. 02 716 0000";
  sheet.getCell("A3").font = { size: 9, color: { argb: "71717A" } };

  sheet.mergeCells("D1:E1");
  sheet.getCell("D1").value = "QUOTATION";
  sheet.getCell("D1").font = { bold: true, size: 16, color: { argb: BRAND_RED } };
  sheet.getCell("D1").alignment = { horizontal: "right" };

  // Customer / quotation meta block
  const metaStartRow = 5;
  const metaRows: [string, string][] = [
    ["Customer:", body.customerName],
    ["Address:", body.customerAddress || "-"],
    ["Contact Person:", body.contactPerson || "-"],
    ["Quotation No.:", quotationNo],
    ["Quotation Date:", today.toLocaleDateString("en-GB")],
    ["Valid to:", validTo.toLocaleDateString("en-GB")],
  ];
  metaRows.forEach(([label, value], i) => {
    const row = metaStartRow + i;
    sheet.getCell(`A${row}`).value = label;
    sheet.getCell(`A${row}`).font = { bold: true, size: 10 };
    sheet.mergeCells(`B${row}:E${row}`);
    sheet.getCell(`B${row}`).value = value;
    sheet.getCell(`B${row}`).font = { size: 10 };
  });

  // Item table
  const tableHeaderRow = metaStartRow + metaRows.length + 1;
  const headers = ["No.", "Description", "MD", "Amount (THB)"];
  const headerRow = sheet.getRow(tableHeaderRow);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_RED } };
    cell.alignment = { horizontal: i >= 2 ? "right" : "left", vertical: "middle" };
    cell.border = thickBorder();
  });
  sheet.mergeCells(tableHeaderRow, 4, tableHeaderRow, 5);

  let total = 0;
  let totalMd = 0;
  body.items.forEach((item, i) => {
    const rowNum = tableHeaderRow + 1 + i;
    const row = sheet.getRow(rowNum);
    const breakdownText = formatBreakdown(item.mdBreakdown);
    row.getCell(1).value = i + 1;
    row.getCell(2).value = breakdownText ? `${item.description}\n(${breakdownText})` : item.description;
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
    row.getCell(3).value = item.md ?? "-";
    row.getCell(3).alignment = { horizontal: "right" };
    sheet.mergeCells(rowNum, 4, rowNum, 5);
    row.getCell(4).value = item.amount != null ? item.amount : "-";
    row.getCell(4).numFmt = "#,##0.00";
    row.getCell(4).alignment = { horizontal: "right" };
    for (let c = 1; c <= 5; c++) row.getCell(c).border = thickBorder();
    if (item.amount != null) total += item.amount;
    if (item.md != null) totalMd += item.md;
  });

  const vat = total * VAT_RATE;
  const grandTotal = total + vat;
  const summaryStartRow = tableHeaderRow + body.items.length + 1;
  const summaryRows: [string, number][] = [
    ["Total", total],
    ["VAT 7%", vat],
    ["Grand Total", grandTotal],
  ];
  summaryRows.forEach(([label, value], i) => {
    const rowNum = summaryStartRow + i;
    const isGrand = label === "Grand Total";
    sheet.mergeCells(rowNum, 1, rowNum, 3);
    const labelCell = sheet.getCell(rowNum, 1);
    labelCell.value = label;
    labelCell.font = { bold: true };
    labelCell.alignment = { horizontal: "right" };
    sheet.mergeCells(rowNum, 4, rowNum, 5);
    const valueCell = sheet.getCell(rowNum, 4);
    valueCell.value = value;
    valueCell.numFmt = "#,##0.00";
    valueCell.font = { bold: isGrand };
    valueCell.alignment = { horizontal: "right" };
    if (isGrand) {
      labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FEF2F2" } };
      valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FEF2F2" } };
    }
  });

  const termsRow = summaryStartRow + summaryRows.length + 2;
  sheet.getCell(termsRow, 1).value = "Terms and Conditions:";
  sheet.getCell(termsRow, 1).font = { bold: true, size: 10 };
  const terms = [
    "Credit term net 30 days.",
    "This price is included all applicable taxes.",
    `This quotation is valid until ${validTo.toLocaleDateString("en-GB")}.`,
    "This price is for budgetary purpose and subject to change if the scope is adjusted.",
  ];
  terms.forEach((t, i) => {
    sheet.mergeCells(termsRow + 1 + i, 1, termsRow + 1 + i, 5);
    const cell = sheet.getCell(termsRow + 1 + i, 1);
    cell.value = `• ${t}`;
    cell.font = { size: 9, color: { argb: "52525B" } };
  });

  const signRow = termsRow + terms.length + 3;
  sheet.getCell(signRow, 1).value = "Prepared by:";
  sheet.getCell(signRow, 1).font = { size: 9, color: { argb: "71717A" } };
  sheet.getCell(signRow, 4).value = "Client Signature:";
  sheet.getCell(signRow, 4).font = { size: 9, color: { argb: "71717A" } };

  const footerNote = `สร้างจากระบบ CR/Customize Search — สรุปเบื้องต้น MD รวม ${totalMd || "-"} MD, ราคายังไม่รวม MD ที่แก้ไขเอง (ถ้ามี) โปรดตรวจสอบก่อนส่งลูกค้า`;
  sheet.mergeCells(signRow + 3, 1, signRow + 3, 5);
  sheet.getCell(signRow + 3, 1).value = footerNote;
  sheet.getCell(signRow + 3, 1).font = { italic: true, size: 8, color: { argb: "A1A1AA" } };

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `PINNO_Quotation_${body.customerName.replace(/[^a-zA-Z0-9]+/g, "_")}_${today.toISOString().slice(0, 10)}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
