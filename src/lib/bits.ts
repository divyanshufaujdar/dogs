// ---------------------------------------------------------------------------
// BITS email-domain restriction
//
// Vote integrity: signups will be restricted to BITS Pilani email domains.
// This is designed in now and switched ON in Phase 7. For the MVP it is OFF
// so any email can sign in and try the app.
//
// To turn it on in Phase 7: set RESTRICT_TO_BITS = true. Enforce it in BOTH
// places — the login server action (below) AND, authoritatively, in Supabase
// (Auth → Providers → Email, or a DB trigger on auth.users) so it can't be
// bypassed by hitting the API directly.
// ---------------------------------------------------------------------------

export const RESTRICT_TO_BITS = true;

/** Allowed BITS Pilani email domains. */
export const BITS_DOMAINS = [
  "pilani.bits-pilani.ac.in",
  "goa.bits-pilani.ac.in",
  "hyderabad.bits-pilani.ac.in",
  "dubai.bits-pilani.ac.in",
  "bits-pilani.ac.in",
];

export function isBitsEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  return BITS_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/** Returns null if allowed, or an error message if the email is rejected. */
export function checkSignupEmail(email: string): string | null {
  if (!RESTRICT_TO_BITS) return null;
  if (!isBitsEmail(email)) {
    return "Sign-in is restricted to BITS Pilani email addresses.";
  }
  return null;
}
