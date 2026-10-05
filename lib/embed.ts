const VOYAGE_MODEL = "voyage-3-large"; // 1024-dim output, matches supabase/schema.sql
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

interface VoyageEmbeddingResponse {
  data: { embedding: number[] }[];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Bare fetch had no timeout and no retry — a slow or rate-limited Voyage
// response would hang the request until the platform's own function
// timeout killed it, surfacing as a generic 500 instead of recovering from
// a transient blip. Retries only the request itself (not partial results),
// since embeddings are a pure function of the input text.
async function embed(texts: string[], inputType: "document" | "query"): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("VOYAGE_API_KEY is not set");

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input: texts, model: VOYAGE_MODEL, input_type: inputType }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const message = `Voyage embeddings request failed: ${res.status} ${await res.text()}`;
        if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_RETRIES) {
          lastError = new Error(message);
          await sleep(2 ** attempt * 500);
          continue;
        }
        throw new Error(message);
      }

      const json = (await res.json()) as VoyageEmbeddingResponse;
      return json.data.map((d) => d.embedding);
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      if (isAbort && attempt < MAX_RETRIES) {
        lastError = new Error("Voyage embeddings request timed out");
        await sleep(2 ** attempt * 500);
        continue;
      }
      if (isAbort) throw new Error("Voyage embeddings request timed out");
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Voyage embeddings request failed");
}

// Used when indexing cr_items rows (import / manual add-edit).
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  return embed(texts, "document");
}

// Query vectors are a pure function of the text, and people re-run the same
// searches constantly (example chips, "search again" from Insights/History).
// A small per-instance cache skips the ~300ms+ Voyage round-trip for repeats;
// Map keeps insertion order, so deleting the first key evicts the oldest.
const QUERY_CACHE_MAX = 200;
const QUERY_CACHE_TTL_MS = 30 * 60_000;
const queryCache = new Map<string, { vector: number[]; at: number }>();

function cacheGet(text: string): number[] | null {
  const hit = queryCache.get(text);
  if (!hit) return null;
  if (Date.now() - hit.at > QUERY_CACHE_TTL_MS) {
    queryCache.delete(text);
    return null;
  }
  // Re-insert to mark as most recently used.
  queryCache.delete(text);
  queryCache.set(text, hit);
  return hit.vector;
}

function cacheSet(text: string, vector: number[]) {
  queryCache.set(text, { vector, at: Date.now() });
  if (queryCache.size > QUERY_CACHE_MAX) {
    const oldest = queryCache.keys().next().value;
    if (oldest !== undefined) queryCache.delete(oldest);
  }
}

// Used for the user's search query — Voyage tunes query vs. document
// embeddings differently for retrieval quality.
export async function embedQuery(text: string): Promise<number[]> {
  const key = text.trim();
  const cached = cacheGet(key);
  if (cached) return cached;
  const [vector] = await embed([text], "query");
  cacheSet(key, vector);
  return vector;
}

// Batch variant for the estimator — one Voyage call for many requirements.
// Only the uncached texts go to Voyage.
export async function embedQueries(texts: string[]): Promise<number[][]> {
  const keys = texts.map((t) => t.trim());
  const result: (number[] | null)[] = keys.map(cacheGet);
  const missing = [...new Set(keys.filter((_, i) => result[i] == null))];
  if (missing.length > 0) {
    const vectors = await embed(missing, "query");
    missing.forEach((k, i) => cacheSet(k, vectors[i]));
  }
  return keys.map((k, i) => result[i] ?? cacheGet(k)!);
}
