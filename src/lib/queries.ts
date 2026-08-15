import { createClient } from "@/lib/supabase/server";
import type { DogCard, NameSuggestionCount, RankedName } from "@/lib/types";

/** All active dogs for the grid, newest first. */
export async function getDogCards(): Promise<DogCard[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dog_cards")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load dogs: ${error.message}`);
  return (data ?? []) as DogCard[];
}

/** A single dog, or null if it doesn't exist / isn't active (per RLS). */
export async function getDog(id: string): Promise<DogCard | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dog_cards")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load dog: ${error.message}`);
  return (data as DogCard) ?? null;
}

/**
 * Ranked name suggestions for a dog, annotated with whether the current viewer
 * has voted for each. Sorted by votes desc, then oldest first as a tiebreak.
 */
export async function getRankedNames(dogId: string): Promise<RankedName[]> {
  const supabase = await createClient();

  const [{ data: counts, error: countsErr }, { data: userRes }] =
    await Promise.all([
      supabase
        .from("name_suggestion_counts")
        .select("*")
        .eq("dog_id", dogId),
      supabase.auth.getUser(),
    ]);

  if (countsErr) throw new Error(`Failed to load names: ${countsErr.message}`);

  const rows = (counts ?? []) as NameSuggestionCount[];
  const userId = userRes?.user?.id ?? null;

  let myVotes = new Set<string>();
  if (userId && rows.length > 0) {
    const { data: votes } = await supabase
      .from("name_votes")
      .select("suggestion_id")
      .eq("user_id", userId)
      .in(
        "suggestion_id",
        rows.map((r) => r.suggestion_id),
      );
    myVotes = new Set((votes ?? []).map((v) => v.suggestion_id as string));
  }

  return rows
    .map((r) => ({ ...r, voted_by_me: myVotes.has(r.suggestion_id) }))
    .sort(
      (a, b) =>
        b.votes - a.votes ||
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
}
