// Hand-written types for the MVP schema. Once your Supabase project is live you
// can regenerate a full Database type with:
//   npx supabase gen types typescript --project-id <ref> > src/lib/database.types.ts
// and swap these for it. Until then, these cover everything the app reads.

export type DogStatus = "active" | "hidden" | "merged";

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  is_admin: boolean;
  created_at: string;
}

export interface Dog {
  id: string;
  created_by: string;
  status: DogStatus;
  merged_into: string | null;
  created_at: string;
}

export interface Photo {
  id: string;
  dog_id: string;
  storage_path: string;
  uploaded_by: string;
  is_primary: boolean;
  created_at: string;
}

/** A row from the `dog_cards` view — everything a grid card needs. */
export interface DogCard {
  id: string;
  created_at: string;
  created_by: string;
  photo_path: string | null;
  top_name: string | null;
  name_count: number;
}

/** A row from the `name_suggestion_counts` view. */
export interface NameSuggestionCount {
  suggestion_id: string;
  dog_id: string;
  name: string;
  suggested_by: string;
  created_at: string;
  votes: number;
}

/** A suggestion enriched with the current viewer's vote state, for the UI. */
export interface RankedName extends NameSuggestionCount {
  voted_by_me: boolean;
}

export interface Sighting {
  id: string;
  dog_id: string;
  lat: number;
  lng: number;
  user_id: string;
  note: string | null;
  created_at: string;
}

export interface LatestSighting {
  dog_id: string;
  lat: number;
  lng: number;
  note: string | null;
  created_at: string;
}

/** Personality traits with counts + whether the viewer picked each. */
export interface TraitTally {
  trait: string;
  votes: number;
  mine: boolean;
}

export type SafetyLevel = "friendly" | "chases" | "bites";

export interface SafetySummary {
  counts: Record<SafetyLevel, number>;
  total: number;
  majority: SafetyLevel | null;
  mine: SafetyLevel | null;
}

/** A row from the `dog_leaderboard` view. */
export interface LeaderboardDog {
  id: string;
  created_at: string;
  photo_path: string | null;
  top_name: string | null;
  favourites: number;
}
