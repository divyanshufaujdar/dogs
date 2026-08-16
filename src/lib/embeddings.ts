import "server-only";

// Server-side visual embeddings for dog photos (Phase 7 duplicate detection).
//
// We call a hosted CLIP model over HTTP (Jina AI's `jina-clip-v2`) instead of
// running the model inside the serverless function. Loading a ~30MB vision
// model on a cold start blows past Vercel's function timeout, which silently
// broke embedding in production; a plain HTTP request does not.
//
// jina-clip-v2 is a Matryoshka model — we request 512 dims to match the
// existing photos.embedding vector(512) column and its cosine HNSW index, so
// this is a drop-in with no schema change. Both stored photos and new queries
// go through the same model, so distances stay consistent.

export const EMBEDDING_MODEL = "jina-clip-v2";
export const EMBEDDING_DIM = 512;

const JINA_ENDPOINT = "https://api.jina.ai/v1/embeddings";

/**
 * Embeds one image (by public URL) into a unit-normalized 512-dim vector,
 * ready for pgvector cosine search. Throws if the API key is missing or the
 * request fails — callers treat embedding as best-effort (see tryEmbed).
 */
export async function embedImage(imageUrl: string): Promise<number[]> {
  const key = process.env.JINA_API_KEY;
  if (!key) {
    throw new Error("JINA_API_KEY is not set — cannot embed photos.");
  }

  const res = await fetch(JINA_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIM,
      normalized: true,
      input: [{ image: imageUrl }],
    }),
    // Never hang a request behind a slow embed.
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Jina embedding failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    data?: { embedding?: number[] }[];
  };
  const embedding = json.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIM) {
    throw new Error(`Unexpected embedding shape: ${embedding?.length}`);
  }
  return embedding;
}
