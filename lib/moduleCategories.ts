// Groups the raw Module codes from the spreadsheet (TM, BN, ...) into
// business-level categories for filtering/browsing. Add new module codes
// here as they show up in future imports — anything unmapped falls back to
// "อื่นๆ" instead of being dropped.
const CATEGORY_MODULES: Record<string, string[]> = {
  "Time Attendance": ["TM"],
  Benefit: ["BN"],
  Workflow: ["WF"],
  Payroll: ["PY"],
  "Employee Profile": ["EP"],
  General: ["GN"],
  "e-Signature": ["iZign"],
  Loan: ["LOAN"],
  "Integration & Data": [
    "Interface",
    "Interface (API)",
    "Interface (SFTP)",
    "API",
    "Data Migration",
    "IMP",
  ],
};

const MODULE_TO_CATEGORY: Record<string, string> = Object.fromEntries(
  Object.entries(CATEGORY_MODULES).flatMap(([category, modules]) =>
    modules.map((m) => [m, category])
  )
);

const OTHER_CATEGORY = "อื่นๆ";

export function categoryOf(module: string | null): string {
  if (!module) return OTHER_CATEGORY;
  return MODULE_TO_CATEGORY[module] ?? OTHER_CATEGORY;
}

export function allCategories(): string[] {
  return [...Object.keys(CATEGORY_MODULES), OTHER_CATEGORY];
}

export function modulesInCategory(category: string): string[] | null {
  if (category === OTHER_CATEGORY) return null; // caller handles "anything unmapped"
  return CATEGORY_MODULES[category] ?? [];
}
