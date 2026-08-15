import "server-only";
import os from "node:os";
import path from "node:path";

// Server-side visual embeddings for dog photos (Phase 7 duplicate detection).
//
// The model is a frozen, pretrained CLIP visual encoder — nothing here trains
// or fine-tunes anything. Every uploaded photo gets embedded once and stored in
// photos.embedding; new uploads are matched against that accumulating index via
// pgvector nearest-neighbor search (retrieval, not classification).
//
// Runs as a regular Node serverless function (not Edge — the ONNX runtime and
// model file are far past Edge's bundle limit). The quantized ViT-B/32 encoder
// is a few tens of MB; the first (cold) invocation downloads + loads it, warm
// invocations reuse the module-level singleton below.

export const EMBEDDING_MODEL = "Xenova/clip-vit-base-patch32";
export const EMBEDDING_DIM = 512;

type Embedder = (
  image: string,
  options?: { pool?: boolean },
) => Promise<{ data: Float32Array | number[] }>;

let embedderPromise: Promise<Embedder> | null = null;

function loadEmbedder(): Promise<Embedder> {
  if (!embedderPromise) {
    embedderPromise = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      // Serverless filesystems are read-only outside tmp — cache models there.
      env.cacheDir = path.join(os.tmpdir(), "transformers-cache");
      const extractor = await pipeline("image-feature-extraction", EMBEDDING_MODEL, {
        dtype: "q8",
      });
      return extractor as unknown as Embedder;
    })();
    // A failed load (network hiccup mid-download) shouldn't poison the cache.
    embedderPromise.catch(() => {
      embedderPromise = null;
    });
  }
  return embedderPromise;
}

/**
 * Embeds one image (by URL) into a unit-normalized 512-dim vector, ready for
 * pgvector cosine search. Throws if the model or image can't be loaded.
 */
export async function embedImage(imageUrl: string): Promise<number[]> {
  const embed = await loadEmbedder();
  const output = await embed(imageUrl);
  const raw = Array.from(output.data).slice(0, EMBEDDING_DIM);
  if (raw.length !== EMBEDDING_DIM) {
    throw new Error(`Unexpected embedding size ${raw.length}`);
  }
  const norm = Math.sqrt(raw.reduce((sum, v) => sum + v * v, 0)) || 1;
  return raw.map((v) => v / norm);
}
