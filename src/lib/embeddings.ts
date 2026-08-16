import "server-only";
import sharp from "sharp";

// Server-side visual embeddings for dog photos (Phase 7 duplicate detection).
//
// We call a hosted CLIP model over HTTP (Jina AI's `jina-clip-v2`) instead of
// running the model inside the serverless function. Loading a ~30MB vision
// model on a cold start blows past Vercel's function timeout, which silently
// broke embedding in production; a plain HTTP request does not.
//
// Before sending, we downscale the photo to <=512px. Jina bills images by the
// number of 512px tiles, so a raw phone photo costs ~120k tokens — over the
// free tier's 100k-tokens/minute rate limit (a single upload would 429). A
// 512px image is one tile (~2.5k tokens), and CLIP only sees ~512px anyway, so
// match quality is unchanged while cost drops ~50x.
//
// jina-clip-v2 is a Matryoshka model — we request 512 dims to match the
// existing photos.embedding vector(512) column and its cosine HNSW index, so
// this is a drop-in with no schema change.

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

  // Fetch and downscale to a single 512px tile before embedding.
  const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
  if (!imgRes.ok) {
    throw new Error(`Could not fetch image (${imgRes.status})`);
  }
  const original = Buffer.from(await imgRes.arrayBuffer());
  const small = await sharp(original)
    .resize(512, 512, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  const base64 = small.toString("base64");

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
      input: [{ image: base64 }],
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
