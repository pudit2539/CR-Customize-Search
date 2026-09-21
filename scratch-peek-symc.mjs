import ExcelJS from "exceljs";

function unwrap(v) {
  if (v !== null && typeof v === "object" && "result" in v) return v.result;
  return v;
}
function text(v) {
  v = unwrap(v);
  if (v == null) return null;
  if (typeof v === "object" && "richText" in v) return v.richText.map((r) => r.text).join("").trim();
  if (typeof v === "object" && "text" in v) return String(v.text).trim();
  const s = String(v).trim();
  return s.length ? s : null;
}

for (const file of [
  "../pm-cr-files-review/Symphony/SYMC - Effort Estimation for PR Grouping Config.xlsx",
  "../pm-cr-files-review/Symphony/SYMC - Effort Estimation for Carry forward & Overtime.xlsx",
]) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await (await import("fs")).promises.readFile(file));
  console.log(`\n########## ${file.split("/").pop()}`);
  for (const sheet of wb.worksheets) {
    console.log(`--- sheet: ${sheet.name} (rows ${sheet.rowCount})`);
    sheet.eachRow({ includeEmpty: false }, (row, rn) => {
      const cells = [];
      row.eachCell({ includeEmpty: false }, (cell, cn) => {
        const t = text(cell.value);
        if (t !== null) cells.push(`[${cn}]${t}`);
      });
      if (cells.length) console.log(`r${rn}: ${cells.join(" | ")}`);
    });
  }
}
