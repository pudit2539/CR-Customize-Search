// Approximate evaluation period per imported source file, extracted from each
// .xlsx's internal metadata (docProps/core.xml created/modified) and dates
// embedded in filenames. Filesystem mtimes were useless (reset when the files
// were copied for import), and some metadata "modified" stamps were polluted
// by the July 2026 import review — those fall back to created / filename.
//
// Keyed by import_batches.filename. `from` marks documents that accumulated
// entries over a period; `ongoing` marks living documents still being updated.

interface SourceFileDate {
  from?: string; // YYYY-MM
  to: string; // YYYY-MM
  ongoing?: boolean;
}

const SOURCE_FILE_DATES: Record<string, SourceFileDate> = {
  "Presale - PINNO_Customize Mandays item list.xlsx": {
    from: "2024-08",
    to: "2026-06",
    ongoing: true,
  },
  "Requirement EJIP.xlsx": { to: "2024-11" },
  "CNext Change Requests.xlsx": { from: "2022-01", to: "2022-08" },
  "DDD_CRList.xlsx": { from: "2023-06", to: "2025-06" },
  "IPOP FORTH - Reserve MD & CR V3.0.xlsx": { to: "2026-07" },
  "IPOP NITTO - CR List V1.1.xlsx": { to: "2024-11" },
  "Optinova Estimate Mandays.xlsx": { to: "2025-04" },
  "IPOP - Standard Feature requested by PRTR Outsource_20260316.xlsx": { to: "2026-03" },
  "MD PRTR Outsource Lot 3 Lot 4 V.1.0 260323.xlsx": { to: "2026-03" },
  "MDAssessment_Quasar_API Leave & Compensate.xlsx": { to: "2026-06" },
  "MDAssessment_Quasar_API Payslip&50BIS.xlsx": { to: "2026-05" },
  "Quasar_CR_Tracking_Summary.xlsx": { to: "2026-06", ongoing: true },
  "IPOP Symphony - Customization & CR V0.1.xlsx": { to: "2024-11" },
  "Solution&Mandays_CR_SYMC - Payroll Approvals.xlsx": { from: "2026-04", to: "2026-06" },
  "CR Generali_GenQuota V5.xlsx": { from: "2021-03", to: "2024-07" },
  "Overtime Request Type_Requirement Update V.4.xlsx": { to: "2022-10" },
  "TLI_Business Leave.xlsx": { to: "2023-09" },
  "SYMC - Effort Estimation for Carry forward & Overtime.xlsx": { from: "2023-02", to: "2024-02" },
  "SYMC - Effort Estimation for PR Grouping Config.xlsx": { to: "2023-02" },
};

function formatMonth(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("th-TH", { year: "numeric", month: "short" });
}

// "ประเมินช่วง มี.ค. 2569" / "ก.พ. 2566 – ก.พ. 2567" / "ส.ค. 2567 – ปัจจุบัน"
export function sourceFileDateLabel(filename: string | null): string | null {
  if (!filename) return null;
  const entry = SOURCE_FILE_DATES[filename];
  if (!entry) return null;
  const to = entry.ongoing ? "ปัจจุบัน" : formatMonth(entry.to);
  return entry.from ? `${formatMonth(entry.from)} – ${to}` : to;
}
