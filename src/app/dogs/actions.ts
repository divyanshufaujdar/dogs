"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isInCampus } from "@/lib/constants";
import { dogPhotoUrl } from "@/lib/storage";
import { embedImage } from "@/lib/embeddings";
import {
  duplicateScore,
  SUGGEST_SCORE_THRESHOLD,
  VISUAL_DISTANCE_CEILING,
} from "@/lib/dedup";
import type {
  DangerAlert,
  DuplicateCandidate,
  SafetyLevel,
} from "@/lib/types";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Embeds an uploaded photo for duplicate matching. Best-effort: the embedding
 * is a matching signal, so a model hiccup must never block adding a dog.
 */
async function tryEmbed(storagePath: string): Promise<number[] | null> {
  const url = dogPhotoUrl(storagePath);
  if (!url) return null;
  try {
    return await embedImage(url);
  } catch (err) {
    console.error("Photo embedding failed:", err);
    return null;
  }
}

/**
 * Creates a dog from an already-uploaded photo plus a first proposed name.
 * The creator auto-votes their own suggestion so the dog has a display name
 * immediately. Runs after the client has uploaded the file to storage.
 * If the uploader shared their location, it becomes the dog's first sighting
 * (seeding the home range used for duplicate matching).
 */
export async function createDog(input: {
  storagePath: string;
  name: string;
  location?: { lat: number; lng: number };
  // Reuse the embedding already computed during match-checking, so we don't
  // run the (slow) CLIP model a second time. Falls back to computing it.
  embedding?: number[] | null;
}): Promise<ActionResult<{ dogId: string }>> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Give the dog a starting name." };
  if (name.length > 40) return { ok: false, error: "Name is too long (max 40)." };
  if (!input.storagePath) return { ok: false, error: "Photo upload failed." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  // Reuse the match-time embedding when we have it; only compute as a fallback
  // so every upload still lands in the dedup index.
  const embedding =
    input.embedding ?? (await tryEmbed(input.storagePath));

  const { data: dog, error: dogErr } = await supabase
    .from("dogs")
    .insert({ created_by: user.id })
    .select("id")
    .single();
  if (dogErr || !dog) {
    return { ok: false, error: dogErr?.message ?? "Could not create dog." };
  }

  const { error: photoErr } = await supabase.from("photos").insert({
    dog_id: dog.id,
    storage_path: input.storagePath,
    uploaded_by: user.id,
    is_primary: true,
    embedding,
  });
  if (photoErr) return { ok: false, error: photoErr.message };

  if (input.location && isInCampus(input.location.lat, input.location.lng)) {
    await supabase.from("sightings").insert({
      dog_id: dog.id,
      lat: input.location.lat,
      lng: input.location.lng,
      user_id: user.id,
      note: "First spotted here",
    });
  }

  const { data: suggestion, error: nameErr } = await supabase
    .from("name_suggestions")
    .insert({ dog_id: dog.id, name, suggested_by: user.id })
    .select("id")
    .single();
  if (nameErr || !suggestion) {
    return { ok: false, error: nameErr?.message ?? "Could not add the name." };
  }

  // Creator endorses their own suggestion (their one vote for this dog).
  await supabase.from("name_votes").insert({
    suggestion_id: suggestion.id,
    user_id: user.id,
    dog_id: dog.id,
  });

  revalidatePath("/");
  return { ok: true, data: { dogId: dog.id } };
}

/** Adds a new candidate name for a dog. Returns the created suggestion. */
export async function addName(
  dogId: string,
  rawName: string,
): Promise<ActionResult<{ suggestionId: string; name: string }>> {
  const name = rawName.trim();
  if (!name) return { ok: false, error: "Enter a name." };
  if (name.length > 40) return { ok: false, error: "Name is too long (max 40)." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: suggestion, error } = await supabase
    .from("name_suggestions")
    .insert({ dog_id: dogId, name, suggested_by: user.id })
    .select("id")
    .single();

  if (error) {
    // Unique violations: (dog_id, lower(name)) or (dog_id, suggested_by).
    if (error.code === "23505") {
      if (/suggested_by/.test(error.message)) {
        return {
          ok: false,
          error: "You can only suggest one name per dog.",
        };
      }
      return { ok: false, error: "That name's already been suggested." };
    }
    return { ok: false, error: error.message };
  }

  // Suggesting a name is this user's single vote for the dog — move it here.
  await supabase
    .from("name_votes")
    .delete()
    .eq("dog_id", dogId)
    .eq("user_id", user.id);
  await supabase.from("name_votes").insert({
    suggestion_id: suggestion.id,
    user_id: user.id,
    dog_id: dogId,
  });

  revalidatePath(`/dogs/${dogId}`);
  return { ok: true, data: { suggestionId: suggestion.id, name } };
}

/**
 * Sets the current user's single name vote for a dog. Voting for a different
 * name moves the vote; voting for the one you already picked clears it.
 */
export async function toggleNameVote(
  dogId: string,
  suggestionId: string,
): Promise<ActionResult<{ voted: boolean }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  // The user has at most one vote per dog.
  const { data: existing } = await supabase
    .from("name_votes")
    .select("id, suggestion_id")
    .eq("dog_id", dogId)
    .eq("user_id", user.id)
    .maybeSingle();

  // Clicking the name you already voted for clears your vote.
  if (existing && existing.suggestion_id === suggestionId) {
    const { error } = await supabase
      .from("name_votes")
      .delete()
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/dogs/${dogId}`);
    return { ok: true, data: { voted: false } };
  }

  // Otherwise move (or place) the vote on this name.
  if (existing) {
    await supabase.from("name_votes").delete().eq("id", existing.id);
  }
  const { error } = await supabase.from("name_votes").insert({
    suggestion_id: suggestionId,
    user_id: user.id,
    dog_id: dogId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/dogs/${dogId}`);
  return { ok: true, data: { voted: true } };
}

/**
 * Sets the current user's single favourite dog (campus popularity vote).
 * Passing the dog you already favourited clears it.
 */
export async function toggleFavourite(
  dogId: string,
): Promise<ActionResult<{ favourite: boolean }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: existing } = await supabase
    .from("dog_favourites")
    .select("dog_id")
    .eq("user_id", user.id)
    .maybeSingle();

  // Clicking your current favourite clears it.
  if (existing && existing.dog_id === dogId) {
    const { error } = await supabase
      .from("dog_favourites")
      .delete()
      .eq("user_id", user.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/leaderboard");
    revalidatePath(`/dogs/${dogId}`);
    return { ok: true, data: { favourite: false } };
  }

  // Otherwise move (or set) the favourite — one row per user.
  const { error } = await supabase
    .from("dog_favourites")
    .upsert({ user_id: user.id, dog_id: dogId }, { onConflict: "user_id" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/leaderboard");
  revalidatePath(`/dogs/${dogId}`);
  return { ok: true, data: { favourite: true } };
}

// --- Phase 5: sightings -----------------------------------------------------

/** Logs where a dog was seen. Pins must fall inside the campus bounding box. */
export async function addSighting(input: {
  dogId: string;
  lat: number;
  lng: number;
  note?: string;
}): Promise<ActionResult> {
  if (!isInCampus(input.lat, input.lng)) {
    return { ok: false, error: "Drop the pin within the BITS Pilani campus." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { error } = await supabase.from("sightings").insert({
    dog_id: input.dogId,
    lat: input.lat,
    lng: input.lng,
    note: input.note?.trim() || null,
    user_id: user.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/dogs/${input.dogId}`);
  return { ok: true, data: undefined };
}

// --- Phase 6: temperament ---------------------------------------------------

/** Toggles a personality trait for the current user. */
export async function togglePersonality(
  dogId: string,
  trait: string,
): Promise<ActionResult<{ active: boolean }>> {
  const clean = trait.trim().toLowerCase();
  if (!clean || clean.length > 24) {
    return { ok: false, error: "Invalid trait." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: existing } = await supabase
    .from("personality_votes")
    .select("id")
    .eq("dog_id", dogId)
    .eq("user_id", user.id)
    .eq("trait", clean)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("personality_votes")
      .delete()
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/dogs/${dogId}`);
    return { ok: true, data: { active: false } };
  }

  const { error } = await supabase
    .from("personality_votes")
    .insert({ dog_id: dogId, user_id: user.id, trait: clean });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/dogs/${dogId}`);
  return { ok: true, data: { active: true } };
}

/** Sets (or clears) the current user's safety rating for a dog. */
export async function setSafety(
  dogId: string,
  level: SafetyLevel | null,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  if (level === null) {
    const { error } = await supabase
      .from("safety_votes")
      .delete()
      .eq("dog_id", dogId)
      .eq("user_id", user.id);
    if (error) return { ok: false, error: error.message };
  } else {
    // One row per (dog, user) — upsert on that unique key.
    const { error } = await supabase
      .from("safety_votes")
      .upsert(
        { dog_id: dogId, user_id: user.id, level },
        { onConflict: "dog_id,user_id" },
      );
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(`/dogs/${dogId}`);
  return { ok: true, data: undefined };
}

// --- Phase 7: duplicate detection + danger alerts ---------------------------

/**
 * Looks for existing dogs that a freshly-uploaded photo might duplicate.
 * Embeds the photo server-side, runs the pgvector nearest-neighbor query, and
 * blends visual similarity with distance from each candidate's home range
 * ("the library dog is never seen at the girls' hostel"). Called between the
 * storage upload and createDog so AddDogForm can show the confirm-or-new
 * prompt. Never fails hard — no candidates just means "proceed as a new dog".
 */
export async function findPossibleDuplicates(input: {
  storagePath: string;
  location?: { lat: number; lng: number };
}): Promise<
  ActionResult<{ candidates: DuplicateCandidate[]; embedding: number[] | null }>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const embedding = await tryEmbed(input.storagePath);
  if (!embedding) return { ok: true, data: { candidates: [], embedding: null } };

  const { data, error } = await supabase.rpc("find_similar_dogs", {
    query_embedding: embedding,
    query_lat: input.location?.lat ?? null,
    query_lng: input.location?.lng ?? null,
    match_limit: 5,
  });
  if (error) {
    console.error("find_similar_dogs failed:", error.message);
    return { ok: true, data: { candidates: [], embedding } };
  }

  const candidates: DuplicateCandidate[] = (data ?? [])
    .filter(
      (row: { visual_distance: number }) =>
        row.visual_distance <= VISUAL_DISTANCE_CEILING,
    )
    .map(
      (row: {
        dog_id: string;
        visual_distance: number;
        home_range_meters: number | null;
        photo_path: string | null;
        top_name: string | null;
      }) => ({
        dogId: row.dog_id,
        score: duplicateScore(row.visual_distance, row.home_range_meters),
        visualDistance: row.visual_distance,
        homeRangeMeters: row.home_range_meters,
        photoPath: row.photo_path,
        topName: row.top_name,
      }),
    )
    .filter((c: DuplicateCandidate) => c.score >= SUGGEST_SCORE_THRESHOLD)
    .sort((a: DuplicateCandidate, b: DuplicateCandidate) => b.score - a.score);

  return { ok: true, data: { candidates, embedding } };
}

/**
 * The "yes, it's the same dog" path from the duplicate prompt: attaches the
 * uploaded photo to the existing dog instead of creating a new one, and logs
 * the location (when shared) as a sighting so the home range stays current.
 */
export async function addPhotoToExistingDog(input: {
  dogId: string;
  storagePath: string;
  location?: { lat: number; lng: number };
  embedding?: number[] | null;
}): Promise<ActionResult<{ dogId: string }>> {
  if (!input.storagePath) return { ok: false, error: "Photo upload failed." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const embedding =
    input.embedding ?? (await tryEmbed(input.storagePath));

  const { error } = await supabase.from("photos").insert({
    dog_id: input.dogId,
    storage_path: input.storagePath,
    uploaded_by: user.id,
    is_primary: false,
    embedding,
  });
  if (error) return { ok: false, error: error.message };

  if (input.location && isInCampus(input.location.lat, input.location.lng)) {
    await supabase.from("sightings").insert({
      dog_id: input.dogId,
      lat: input.location.lat,
      lng: input.location.lng,
      user_id: user.id,
    });
  }

  revalidatePath(`/dogs/${input.dogId}`);
  return { ok: true, data: { dogId: input.dogId } };
}

/**
 * Recent sightings of red-flagged dogs near the given position. Stateless by
 * design: the coordinates are used for this one check and never stored.
 */
export async function nearbyDangerAlerts(
  lat: number,
  lng: number,
): Promise<ActionResult<{ alerts: DangerAlert[] }>> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, error: "Invalid location." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("nearby_danger_alerts", {
    query_lat: lat,
    query_lng: lng,
  });
  if (error) return { ok: false, error: error.message };

  const alerts: DangerAlert[] = (data ?? []).map(
    (row: {
      dog_id: string;
      sighting_id: string;
      top_name: string | null;
      lat: number;
      lng: number;
      distance_meters: number;
      last_seen_at: string;
    }) => ({
      dogId: row.dog_id,
      sightingId: row.sighting_id,
      topName: row.top_name,
      lat: row.lat,
      lng: row.lng,
      distanceMeters: row.distance_meters,
      lastSeenAt: row.last_seen_at,
    }),
  );
  return { ok: true, data: { alerts } };
}
