"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isInCampus } from "@/lib/constants";
import type { SafetyLevel } from "@/lib/types";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Creates a dog from an already-uploaded photo plus a first proposed name.
 * The creator auto-votes their own suggestion so the dog has a display name
 * immediately. Runs after the client has uploaded the file to storage.
 */
export async function createDog(input: {
  storagePath: string;
  name: string;
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
  });
  if (photoErr) return { ok: false, error: photoErr.message };

  const { data: suggestion, error: nameErr } = await supabase
    .from("name_suggestions")
    .insert({ dog_id: dog.id, name, suggested_by: user.id })
    .select("id")
    .single();
  if (nameErr || !suggestion) {
    return { ok: false, error: nameErr?.message ?? "Could not add the name." };
  }

  // Creator endorses their own suggestion (one vote per user per name).
  await supabase
    .from("name_votes")
    .insert({ suggestion_id: suggestion.id, user_id: user.id });

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
    // Unique violation on (dog_id, lower(name)).
    if (error.code === "23505") {
      return { ok: false, error: "That name's already been suggested." };
    }
    return { ok: false, error: error.message };
  }

  // Suggesting a name counts as a vote for it.
  await supabase
    .from("name_votes")
    .insert({ suggestion_id: suggestion.id, user_id: user.id });

  revalidatePath(`/dogs/${dogId}`);
  return { ok: true, data: { suggestionId: suggestion.id, name } };
}

/** Toggles the current user's vote on a name suggestion. */
export async function toggleNameVote(
  dogId: string,
  suggestionId: string,
): Promise<ActionResult<{ voted: boolean }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: existing } = await supabase
    .from("name_votes")
    .select("id")
    .eq("suggestion_id", suggestionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("name_votes")
      .delete()
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/dogs/${dogId}`);
    return { ok: true, data: { voted: false } };
  }

  const { error } = await supabase
    .from("name_votes")
    .insert({ suggestion_id: suggestionId, user_id: user.id });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/dogs/${dogId}`);
  return { ok: true, data: { voted: true } };
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
