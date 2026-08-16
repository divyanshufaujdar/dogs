"use client";

import { useEffect, useRef, useState } from "react";
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
type Stage = "pick" | "working" | "match" | "name";

const WORKING_MESSAGES = [
  "Uploading your good boy… 🐾",
  "Sniffing through the pack for a match… 🐶",
  "Comparing snouts and floppy ears… 👃",
  "Just hang in there for a bit more… 🦴",
];

/** Cycles friendly copy while the (slow) photo match runs. */
function useRotatingMessage(active: boolean) {
  const [msg, setMsg] = useState(WORKING_MESSAGES[0]);
  useEffect(() => {
    if (!active) return;
    setMsg(WORKING_MESSAGES[0]);
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % WORKING_MESSAGES.length;
      setMsg(WORKING_MESSAGES[i]);
    }, 2200);
    return () => clearInterval(id);
  }, [active]);
  return msg;
}

export default function AddDogForm() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("pick");
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [location, setLocation] = useState<Coords | null>(null);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [embedding, setEmbedding] = useState<number[] | null>(null);
  const [candidates, setCandidates] = useState<DuplicateCandidate[]>([]);
  const nameRef = useRef<HTMLInputElement>(null);

  const workingMsg = useRotatingMessage(stage === "working");

  // Location is a matching signal, never a requirement — ask once, carry on.
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (isInCampus(c.lat, c.lng)) setLocation(c);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  // Picking a photo kicks off upload + matching immediately.
  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setError(null);
    setStage("working");

    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(DOG_PHOTOS_BUCKET)
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) throw new Error(upErr.message);
      setPendingPath(path);

      const res = await findPossibleDuplicates({
        storagePath: path,
        location: location ?? undefined,
      });
      if (!res.ok) throw new Error(res.error);

      setEmbedding(res.data.embedding);
      if (res.data.candidates.length > 0) {
        setCandidates(res.data.candidates);
        setStage("match");
      } else {
        setStage("name");
        setTimeout(() => nameRef.current?.focus(), 50);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStage("pick");
      setPreview(null);
    }
  }

  async function confirmSameDog(dogId: string) {
    if (!pendingPath) return;
    setSaving(true);
    setError(null);
    try {
      const res = await addPhotoToExistingDog({
        dogId,
        storagePath: pendingPath,
        location: location ?? undefined,
        embedding,
      });
      if (!res.ok) throw new Error(res.error);
      router.push(`/dogs/${res.data.dogId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSaving(false);
    }
  }

  async function submitNewDog(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingPath) return;
    if (!name.trim()) return setError("Give the dog a starting name.");
    setSaving(true);
    setError(null);
    try {
      const res = await createDog({
        storagePath: pendingPath,
        name,
        location: location ?? undefined,
        embedding,
      });
      if (!res.ok) throw new Error(res.error);
      router.push(`/dogs/${res.data.dogId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSaving(false);
    }
  }

  // --- Working: the slow embed/match step -----------------------------------
  if (stage === "working") {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="your upload"
            className="h-40 w-40 animate-pulse rounded-2xl object-cover shadow-[var(--shadow)]"
          />
        )}
        <p className="font-display text-lg text-ink">{workingMsg}</p>
        <p className="text-xs text-muted">Finding if we already know this pup…</p>
      </div>
    );
  }

  // --- Match: best matches, "is this the same dog?" -------------------------
  if (stage === "match") {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="your upload"
              className="h-20 w-20 rounded-xl border border-border object-cover"
            />
          )}
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">
              Is this a dog we already know?
            </h2>
            <p className="text-sm text-muted">
              Your photo looks a lot like{" "}
              {candidates.length === 1 ? "this pup" : "these pups"}.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {candidates.map((c, i) => (
            <div
              key={c.dogId}
              className={`flex items-center gap-4 rounded-xl border p-3 ${
                i === 0 ? "border-brand/50 bg-brand-soft" : "border-border bg-surface"
              }`}
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
                  {i === 0 && (
                    <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold text-[var(--brand-ink)]">
                      BEST MATCH
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted">
                  {Math.round(c.score * 100)}% match
                  {c.homeRangeMeters != null &&
                    ` · usually ~${Math.round(c.homeRangeMeters)}m away`}
                </p>
              </div>
              <button
                onClick={() => confirmSameDog(c.dogId)}
                disabled={saving}
                className="btn btn-brand shrink-0"
              >
                Yes, same dog
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={() => {
            setStage("name");
            setTimeout(() => nameRef.current?.focus(), 50);
          }}
          disabled={saving}
          className="btn btn-ghost w-full border border-border py-2.5"
        >
          No, it&apos;s a new dog
        </button>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  }

  // --- Name: only reached for a genuinely new dog ---------------------------
  if (stage === "name") {
    return (
      <form onSubmit={submitNewDog} className="space-y-5">
        <div className="flex items-center gap-4">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="your upload"
              className="h-20 w-20 rounded-xl border border-border object-cover"
            />
          )}
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">
              A new face! 🎉
            </h2>
            <p className="text-sm text-muted">
              Give them a starting name — others can suggest &amp; vote on more.
            </p>
          </div>
        </div>

        <input
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="e.g. Bruno"
          className="input"
        />
        {location && (
          <p className="text-xs text-muted">
            📍 We&apos;ll log where you are now as their first sighting.
          </p>
        )}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="btn btn-brand w-full py-2.5"
        >
          {saving ? "Adding…" : "Add to the pack"}
        </button>
      </form>
    );
  }

  // --- Pick: the entry point ------------------------------------------------
  return (
    <div className="space-y-4">
      <label className="flex aspect-video cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-surface-2 text-muted transition-colors hover:border-brand">
        <span className="text-3xl">📷</span>
        <span className="text-sm font-medium">Take or choose a photo</span>
        <span className="text-xs">We&apos;ll instantly check for a match</span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onPick}
        />
      </label>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
