import type { SupabaseClient } from "@supabase/supabase-js";

export type ChangeAction = "insert" | "update" | "delete" | "import_insert" | "import_update";

interface ChangeEntry {
  itemId: string | null;
  action: ChangeAction;
  before?: unknown;
  after?: unknown;
}

// Best-effort audit log — a logging failure should never break the actual
// mutation the user is waiting on.
export async function logChanges(
  supabase: SupabaseClient,
  entries: ChangeEntry[]
): Promise<void> {
  if (entries.length === 0) return;
  try {
    await supabase.from("cr_item_changes").insert(
      entries.map((e) => ({
        item_id: e.itemId,
        action: e.action,
        before: e.before ?? null,
        after: e.after ?? null,
      }))
    );
  } catch {
    // ignore
  }
}
