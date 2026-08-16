import { createClient } from "@/lib/supabase/server";
import type {
  DogCard,
  NameSuggestionCount,
  RankedName,
  Sighting,
  TraitTally,
  SafetyLevel,
  SafetySummary,
  LeaderboardDog,
} from "@/lib/types";
import { PERSONALITY_TRAITS } from "@/lib/constants";

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

/** All of a dog's photo storage paths, primary first then newest. */
export async function getDogPhotos(dogId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("photos")
    .select("storage_path, is_primary, created_at")
    .eq("dog_id", dogId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load photos: ${error.message}`);
  return (data ?? []).map((p) => p.storage_path as string);
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

/** All sightings for a dog, newest first (newest = "last found"). */
export async function getSightings(dogId: string): Promise<Sighting[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sightings")
    .select("*")
    .eq("dog_id", dogId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load sightings: ${error.message}`);
  return (data ?? []) as Sighting[];
}

/** Personality traits with counts, ordered by votes, marking the viewer's picks. */
export async function getPersonality(dogId: string): Promise<TraitTally[]> {
  const supabase = await createClient();
  const [{ data: counts }, { data: userRes }] = await Promise.all([
    supabase
      .from("personality_trait_counts")
      .select("trait, votes")
      .eq("dog_id", dogId),
    supabase.auth.getUser(),
  ]);

  const userId = userRes?.user?.id ?? null;
  let mine = new Set<string>();
  if (userId) {
    const { data } = await supabase
      .from("personality_votes")
      .select("trait")
      .eq("dog_id", dogId)
      .eq("user_id", userId);
    mine = new Set((data ?? []).map((r) => r.trait as string));
  }

  const countMap = new Map<string, number>(
    (counts ?? []).map((r) => [r.trait as string, Number(r.votes)]),
  );

  // Show all preset traits plus any custom ones that exist, votes desc.
  const traits = new Set<string>([...PERSONALITY_TRAITS, ...countMap.keys()]);
  return [...traits]
    .map((trait) => ({
      trait,
      votes: countMap.get(trait) ?? 0,
      mine: mine.has(trait),
    }))
    .sort((a, b) => b.votes - a.votes || a.trait.localeCompare(b.trait));
}

/** Safety tally: per-level counts, the majority level, and the viewer's vote. */
export async function getSafety(dogId: string): Promise<SafetySummary> {
  const supabase = await createClient();
  const [{ data: counts }, { data: userRes }] = await Promise.all([
    supabase
      .from("safety_level_counts")
      .select("level, votes")
      .eq("dog_id", dogId),
    supabase.auth.getUser(),
  ]);

  const tally: Record<SafetyLevel, number> = {
    friendly: 0,
    chases: 0,
    bites: 0,
  };
  for (const row of counts ?? []) {
    tally[row.level as SafetyLevel] = Number(row.votes);
  }
  const total = tally.friendly + tally.chases + tally.bites;

  let majority: SafetyLevel | null = null;
  let best = 0;
  (["bites", "chases", "friendly"] as SafetyLevel[]).forEach((lvl) => {
    if (tally[lvl] > best) {
      best = tally[lvl];
      majority = lvl;
    }
  });

  let mine: SafetyLevel | null = null;
  const userId = userRes?.user?.id ?? null;
  if (userId) {
    const { data } = await supabase
      .from("safety_votes")
      .select("level")
      .eq("dog_id", dogId)
      .eq("user_id", userId)
      .maybeSingle();
    mine = (data?.level as SafetyLevel) ?? null;
  }

  return { counts: tally, total, majority, mine };
}

/** Dogs ranked by favourite votes (desc), newest as tiebreak. */
export async function getLeaderboard(): Promise<LeaderboardDog[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dog_leaderboard")
    .select("*")
    .order("favourites", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to load leaderboard: ${error.message}`);
  return (data ?? []) as LeaderboardDog[];
}

/** Favourite count for one dog + whether it's the current user's favourite. */
export async function getDogFavouriteInfo(
  dogId: string,
): Promise<{ count: number; mine: boolean }> {
  const supabase = await createClient();
  const [{ count }, { data: userRes }] = await Promise.all([
    supabase
      .from("dog_favourites")
      .select("*", { count: "exact", head: true })
      .eq("dog_id", dogId),
    supabase.auth.getUser(),
  ]);

  let mine = false;
  const userId = userRes?.user?.id ?? null;
  if (userId) {
    const { data } = await supabase
      .from("dog_favourites")
      .select("dog_id")
      .eq("user_id", userId)
      .maybeSingle();
    mine = data?.dog_id === dogId;
  }
  return { count: count ?? 0, mine };
}

/** The dog id the current user has marked as their favourite, or null. */
export async function getMyFavourite(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("dog_favourites")
    .select("dog_id")
    .eq("user_id", user.id)
    .maybeSingle();
  return (data?.dog_id as string) ?? null;
}
