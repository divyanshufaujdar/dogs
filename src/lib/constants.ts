// BITS Pilani (Rajasthan) campus — map center and a bounding box that keeps
// sighting pins on/around campus.
export const CAMPUS_CENTER: [number, number] = [28.3639, 75.5875];
export const CAMPUS_ZOOM = 16;

// [southWest, northEast] — a generous box around the Pilani campus.
export const CAMPUS_BOUNDS: [[number, number], [number, number]] = [
  [28.3520, 75.5770],
  [28.3760, 75.5990],
];

export function isInCampus(lat: number, lng: number): boolean {
  const [[swLat, swLng], [neLat, neLng]] = CAMPUS_BOUNDS;
  return lat >= swLat && lat <= neLat && lng >= swLng && lng <= neLng;
}

// Personality traits users can tag (Phase 6). "etc." in the spec → a curated set.
export const PERSONALITY_TRAITS = [
  "cute",
  "playful",
  "shy",
  "majestic",
  "calm",
  "energetic",
  "goofy",
  "protective",
  "cuddly",
  "sleepy",
] as const;

export type SafetyLevel = "friendly" | "chases" | "bites";

export const SAFETY_LEVELS: {
  level: SafetyLevel;
  label: string;
  emoji: string;
}[] = [
  { level: "friendly", label: "Friendly", emoji: "💚" },
  { level: "chases", label: "Chases", emoji: "⚠️" },
  { level: "bites", label: "Bites", emoji: "🛑" },
];
