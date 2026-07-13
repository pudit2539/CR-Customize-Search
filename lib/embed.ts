const VOYAGE_MODEL = "voyage-3-lite"; // 512-dim output, matches supabase/schema.sql

interface VoyageEmbeddingResponse {
  data: { embedding: number[] }[];
}

async function embed(texts: string[], inputType: "document" | "query"): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("VOYAGE_API_KEY is not set");

  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: texts, model: VOYAGE_MODEL, input_type: inputType }),
  });

  if (!res.ok) {
    throw new Error(`Voyage embeddings request failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as VoyageEmbeddingResponse;
  return json.data.map((d) => d.embedding);
}

// Used when indexing cr_items rows (import / manual add-edit).
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  return embed(texts, "document");
}

// Used for the user's search query — Voyage tunes query vs. document
// embeddings differently for retrieval quality.
export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embed([text], "query");
  return vector;
}
