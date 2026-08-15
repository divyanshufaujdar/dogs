"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { checkSignupEmail } from "@/lib/bits";

export type LoginState = { ok: boolean; message: string } | null;

/** Sends a magic-link / OTP email. Wired to the login form via useActionState. */
export async function sendMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { ok: false, message: "Enter your email address." };

  // Phase 7 hook: rejects non-BITS emails when RESTRICT_TO_BITS is on.
  const restriction = checkSignupEmail(email);
  if (restriction) return { ok: false, message: restriction };

  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) return { ok: false, message: error.message };
  return {
    ok: true,
    message: `Check ${email} for a sign-in link.`,
  };
}
