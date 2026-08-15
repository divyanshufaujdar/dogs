"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DOG_PHOTOS_BUCKET, dogPhotoUrl } from "@/lib/storage";
import {
  createDog,
  findPossibleDuplicates,
  addPhotoToExistingDog,
} from "@/app/dogs/actions";
import { isInCampus } from "@/lib/constants";
import type { DuplicateCandidate } from "@/lib/types";

type Coords = { lat: number; lng: number };

export default function AddDogForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<Coords | null>(null);
  // Set once the photo is uploaded and candidates came back — shows the prompt.
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<DuplicateCandidate[]>([]);

  // Location is a matching signal, never a requirement — ask once, and carry
  // on with visual-only matching if the user declines or it fails.
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (isInCampus(coords.lat, coords.lng)) setLocation(coords);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
    setPendingPath(null);
    setCandidates([]);
  }

  async function finishAsNewDog(storagePath: string) {
    const res = await createDog({
      storagePath,
      name,
      location: location ?? undefined,
    });
    if (!res.ok) throw new Error(res.error);
    router.push(`/dogs/${res.data.dogId}`);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!file) return setError("Pick a photo of the dog.");
    if (!name.trim()) return setError("Give the dog a starting name.");

    setBusy(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(DOG_PHOTOS_BUCKET)
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) throw new Error(upErr.message);

      // Before committing a new dog, check whether this photo looks like one
      // that's already in the pack — the uploader is the one person actually
      // looking at both photos, so they get to decide.
      setChecking(true);
      const dup = await findPossibleDuplicates({
        storagePath: path,
        location: location ?? undefined,
      });
      setChecking(false);

      if (dup.ok && dup.data.candidates.length > 0) {
        setPendingPath(path);
        setCandidates(dup.data.candidates);
        setBusy(false);
        return;
      }

      await finishAsNewDog(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
      setChecking(false);
    }
  }

  async function confirmSameDog(dogId: string) {
    if (!pendingPath) return;
    setBusy(true);
    setError(null);
    try {
      const res = await addPhotoToExistingDog({
        dogId,
        storagePath: pendingPath,
        location: location ?? undefined,
      });
      if (!res.ok) throw new Error(res.error);
      router.push(`/dogs/${res.data.dogId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  async function confirmNewDog() {
    if (!pendingPath) return;
    setBusy(true);
    setError(null);
    try {
      await finishAsNewDog(pendingPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  // The photo is uploaded and looks like a dog we already know.
  if (pendingPath && candidates.length > 0) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="your upload"
              className="h-24 w-24 rounded-xl border border-border object-cover"
            />
          )}
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">
              Wait — is this a dog we already know?
            </h2>
            <p className="text-sm text-muted">
              Your photo looks a lot like {candidates.length === 1 ? "this pack member" : "these pack members"}.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {candidates.map((c) => (
            <div
              key={c.dogId}
              className="flex items-center gap-4 rounded-xl border border-border bg-surface p-3"
            >
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                {dogPhotoUrl(c.photoPath) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={dogPhotoUrl(c.photoPath)!}
                    alt={c.topName ?? "dog"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="grid h-full place-items-center text-2xl">🐾</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">
                  {c.topName ?? "Unnamed pup"}
                </p>
                <p className="text-xs text-muted">
                  {Math.round(c.score * 100)}% match
                  {c.homeRangeMeters != null &&
                    ` · usually ~${Math.round(c.homeRangeMeters)}m from here`}
                </p>
              </div>
              <button
                onClick={() => confirmSameDog(c.dogId)}
                disabled={busy}
                className="btn btn-brand shrink-0"
              >
                Yes, same dog
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={confirmNewDog}
          disabled={busy}
          className="btn btn-ghost w-full border border-border py-2.5"
        >
          {busy ? "Adding…" : "No, it's a different dog — add as new"}
        </button>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label className="mb-2 block text-sm font-medium text-ink">Photo</label>
        <label className="flex aspect-video cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-surface-2 text-muted transition-colors hover:border-brand">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="preview" className="h-full w-full object-cover" />
          ) : (
            <span className="text-sm">Tap to choose a photo 🐾</span>
          )}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={onPick}
          />
        </label>
      </div>

      <div>
        <label htmlFor="name" className="mb-2 block text-sm font-medium text-ink">
          Starting name
        </label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="e.g. Bruno"
          className="input"
        />
        <p className="mt-1.5 text-xs text-muted">
          Just a first idea — others can suggest and vote on more names.
        </p>
      </div>

      <p className="text-xs text-muted">
        {location
          ? "📍 Your location will be logged as this dog's first sighting."
          : "📍 Share your location (optional) so this spot becomes the dog's first sighting."}
      </p>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button type="submit" disabled={busy} className="btn btn-brand w-full py-2.5">
        {checking
          ? "Checking for look-alikes…"
          : busy
            ? "Adding…"
            : "Add to the pack"}
      </button>
    </form>
  );
}
