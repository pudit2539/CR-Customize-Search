import type { RateEntry } from "./mdRates";
import type { CrItemRow } from "./types";

export interface ItemDetailPayload {
  counterpart: {
    id: string;
    source_type: string;
    item_no: number | null;
    module: string | null;
    detail: string;
    md_breakdown: CrItemRow["md_breakdown"];
    md_summary: number | null;
    cost: number | null;
    project: string | null;
    industry: string | null;
    remark: string | null;
    import_batch_id: string | null;
    source_filename: string | null;
  } | null;
  logs: {
    id: string;
    action: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    created_by: string | null;
    created_at: string;
  }[];
  nominated: boolean;
  rateEntries: RateEntry[];
  files: { id: string; filename: string }[];
}

// Client-side cache + in-flight dedupe for the item-detail payload. Lets the
// UI warm it on hover/focus (prefetchItemDetail) so the modal is usually
// already populated by the time it opens, and reopening an item is instant.
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; data: ItemDetailPayload }>();
const inflight = new Map<string, Promise<ItemDetailPayload>>();

export function peekItemDetail(id: string): ItemDetailPayload | null {
  const hit = cache.get(id);
  return hit && Date.now() - hit.at < TTL_MS ? hit.data : null;
}

export function loadItemDetail(id: string): Promise<ItemDetailPayload> {
  const existing = inflight.get(id);
  if (existing) return existing;
  const p = fetch(`/api/items/${id}/detail`)
    .then((r) => {
      if (!r.ok) throw new Error(`โหลดรายละเอียดไม่สำเร็จ (${r.status})`);
      return r.json() as Promise<ItemDetailPayload>;
    })
    .then((data) => {
      cache.set(id, { at: Date.now(), data });
      return data;
    })
    .finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

export function prefetchItemDetail(id: string) {
  if (peekItemDetail(id)) return;
  loadItemDetail(id).catch(() => {});
}

// Called after nominate/unnominate so a reopened modal doesn't show stale state.
export function patchItemDetail(id: string, patch: Partial<ItemDetailPayload>) {
  const hit = cache.get(id);
  if (hit) cache.set(id, { at: hit.at, data: { ...hit.data, ...patch } });
}
