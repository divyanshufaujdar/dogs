"use server";

import { createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hasAdminKey } from "@/lib/supabase/admin";
import { checkSignupEmail } from "@/lib/bits";

export type LoginState = { ok: boolean; message: string } | null;

/**
 * Derives a stable, server-only password from the email. The user never sees
 * or types it — it just gives Supabase a credential so a real session exists
 * (needed for RLS, created_by, etc.). Security here is the BITS-domain gate,
 * not the password, so this is deliberately simple.
 */
function derivePassword(email: string): string {
  const salt = process.env.BITS_AUTH_SECRET ?? "campus-dogs-demo-salt";
  return createHash("sha256").update(`${email}::${salt}`).digest("hex");
}

/**
 * Domain-gated instant sign-in — no email is ever sent. Validates the BITS
 * domain, then signs the user in. On first visit it creates a pre-confirmed
 * account via the Admin API (which sends no email and ignores the confirm-email
 * setting and the email rate limit).
 */
export async function authenticate(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email) return { ok: false, message: "Enter your email address." };

  const restriction = checkSignupEmail(email);
  if (restriction) return { ok: false, message: restriction };

  const supabase = await createClient();
  const password = derivePassword(email);

  // Returning user → straight in.
  const first = await supabase.auth.signInWithPassword({ email, password });
  if (!first.error) return { ok: true, message: "ok" };

  if (!hasAdminKey()) {
    return {
      ok: false,
      message:
        "Server not configured for instant sign-in: add SUPABASE_SERVICE_ROLE_KEY to .env.local.",
    };
  }

  // First visit → create a pre-confirmed user with no email sent.
  const admin = createAdminClient();
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  // Ignore "already registered" — the account exists, we just need to sign in.
  if (created.error && !/registered|exists/i.test(created.error.message)) {
    return { ok: false, message: created.error.message };
  }

  const retry = await supabase.auth.signInWithPassword({ email, password });
  if (retry.error) return { ok: false, message: retry.error.message };
  return { ok: true, message: "ok" };
}
