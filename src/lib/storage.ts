export const DOG_PHOTOS_BUCKET = "dog-photos";

/**
 * Public URL for a stored dog photo. The bucket is public, so this is a plain
 * deterministic URL — no client or network round-trip needed.
 */
export function dogPhotoUrl(storagePath: string | null): string | null {
  if (!storagePath) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/${DOG_PHOTOS_BUCKET}/${storagePath}`;
}
