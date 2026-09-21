export type SourceType = "new_customer" | "existing_customer";

export interface MdBreakdown {
  fun_junior: number | null;
  fun_consultant: number | null;
  fun_senior: number | null;
  dev_consultant: number | null;
  dev_senior: number | null;
  dev_manager: number | null;
  manager: number | null;
  // Legacy: before Dev Senior and Dev Manager were split into separate rates,
  // both were recorded as one combined figure under this key. Old rows may
  // still carry it — never migrated automatically (no reliable way to guess
  // the split retroactively) and never written to by new items.
  dev_senior_mgr?: number | null;
}

export interface CrItemRow {
  id: string;
  source_type: SourceType;
  item_no: number | null;
  module: string | null;
  detail: string;
  md_breakdown: MdBreakdown | null;
  md_summary: number | null;
  cost: number | null;
  project: string | null;
  industry: string | null;
  check_note: string | null;
  priority: string | null;
  remark: string | null;
  timeline_followup: string | null;
  presale_note: string | null;
  // Which /import upload this row came from, if any — null for manual/AI-
  // extracted items and anything imported before this field existed.
  import_batch_id?: string | null;
  source_filename?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CrItemMatch extends CrItemRow {
  similarity: number;
}
