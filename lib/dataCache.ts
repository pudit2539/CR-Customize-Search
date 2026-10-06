// Stale-while-revalidate cache for page data, held in module memory so it
// survives client-side navigation (the JS bundle isn't reloaded between
// menu clicks). Pages seed their state from peekCache() — so returning to
// Dashboard/Items/Insights paints instantly with the last data — then call
// fetchCached() in the background to refresh it. warmCache() preloads the
// main pages' data after login / on sidebar hover so even the FIRST visit
// is usually instant.
const store = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();

export function peekCache<T>(url: string): T | null {
  return (store.get(url) as T | undefined) ?? null;
}

// Always hits the network (that's the "revalidate"), but dedupes concurrent
// calls for the same URL — e.g. a hover-prefetch still in flight when the
// page mounts shares one request instead of starting a second.
export function fetchCached<T>(url: string): Promise<T> {
  const existing = inflight.get(url);
  if (existing) return existing as Promise<T>;
  const p = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json() as Promise<T>;
    })
    .then((data) => {
      store.set(url, data);
      return data;
    })
    .finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}

export function prefetchCache(url: string) {
  if (store.has(url) || inflight.has(url)) return;
  fetchCached(url).catch(() => {});
}

// The default (unfiltered) data behind each menu entry.
export const PAGE_DATA_URLS: Record<string, string> = {
  "/dashboard": "/api/dashboard?",
  "/items": "/api/items?page=1&page_size=10",
  "/insights": "/api/insights",
};

export function warmPage(href: string) {
  const url = PAGE_DATA_URLS[href];
  if (url) prefetchCache(url);
}

export function warmAllPages() {
  Object.keys(PAGE_DATA_URLS).forEach(warmPage);
}
