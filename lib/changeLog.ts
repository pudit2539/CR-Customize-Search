import type { SupabaseClient } from "@supabase/supabase-js";

export type ChangeAction = "insert" | "update" | "delete" | "import_insert" | "import_update";

interface ChangeEntry {
  itemId: string | null;
  action: ChangeAction;
  before?: unknown;
  after?: unknown;
}

// Best-effort audit log — a logging failure should never break the actual
// mutation the user is waiting on. createdBy is the same for every entry in
// one call since a single request only ever acts as one logged-in user.
export async function logChanges(
  supabase: SupabaseClient,
  entries: ChangeEntry[],
  createdBy?: string
): Promise<void> {
  if (entries.length === 0) return;
  try {
    await supabase.from("cr_item_changes").insert(
      entries.map((e) => ({
        item_id: e.itemId,
        action: e.action,
        before: e.before ?? null,
        after: e.after ?? null,
        created_by: createdBy ?? null,
      }))
    );
  } catch {
    // ignore
  }
}
