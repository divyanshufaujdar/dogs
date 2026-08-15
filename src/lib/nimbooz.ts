import { createHash } from "crypto";

// Simple owner-only admin gate. The password is checked server-side and never
// sent to the browser. Override in production via NIMBOOZ_PASSWORD.
export const ADMIN_COOKIE = "nimbooz_session";
export const ADMIN_PASS = process.env.NIMBOOZ_PASSWORD ?? "1357";

/** Opaque cookie value derived from the password (so it can't be trivially forged). */
export function sessionToken(): string {
  return createHash("sha256").update(`nimbooz::${ADMIN_PASS}`).digest("hex");
}
