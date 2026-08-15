// Tuning constants + score blending for duplicate-dog detection (Phase 7).
//
// Thresholds are deliberately biased toward fewer false positives: a missed
// duplicate costs an admin a manual merge in /nimbooz later, while a bogus
// "is this the same dog?" prompt annoys the uploader immediately. Tune against
// a small hand-labeled set of real campus photos (same-dog pairs, different-dog
// pairs, and especially similar-looking-but-different-territory pairs) once
// live data exists.

/** Cosine distance below which a dog is even considered a candidate. */
export const VISUAL_DISTANCE_CEILING = 0.28;

/** Blended score above which the upload-time confirm prompt is shown. */
export const SUGGEST_SCORE_THRESHOLD = 0.74;

/**
 * How much a candidate's home-range distance discounts its visual similarity.
 * ~1 within campus-building range, decaying through a few hundred meters, and
 * floored (not zeroed) far away — a dog that moved territory is rare but real.
 */
export function spatialWeight(homeRangeMeters: number | null): number {
  if (homeRangeMeters == null) return 1; // no sighting history → visual-only
  const NEAR = 100; // full weight inside this radius
  const DECAY = 150; // e-folding distance beyond it
  const FLOOR = 0.5;
  const excess = Math.max(0, homeRangeMeters - NEAR);
  return FLOOR + (1 - FLOOR) * Math.exp(-excess / DECAY);
}

/** Blends pgvector cosine distance + home-range distance into one 0–1 score. */
export function duplicateScore(
  visualDistance: number,
  homeRangeMeters: number | null,
): number {
  const visualSimilarity = 1 - visualDistance;
  return visualSimilarity * spatialWeight(homeRangeMeters);
}
