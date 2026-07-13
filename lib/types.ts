export type SourceType = "new_customer" | "existing_customer";

export interface MdBreakdown {
  fun_junior: number | null;
  fun_consultant: number | null;
  fun_senior: number | null;
  dev_consultant: number | null;
  dev_senior_mgr: number | null;
  manager: number | null;
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
  created_at?: string;
  updated_at?: string;
}

export interface CrItemMatch extends CrItemRow {
  similarity: number;
}
