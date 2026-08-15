import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkSignupEmail } from "@/lib/bits";

/**
 * OAuth/magic-link landing route. Supabase redirects here with a `code` we
 * exchange for a session, then forwards the user on to `next` (default: home).
 *
 * This is the real BITS gate for Google sign-in: the `hd` hint on the Google
 * button only filters the account picker, so the domain is verified here,
 * after the exchange — a non-BITS account is signed straight back out.
 * (Plus, authoritatively, the DB trigger in enable_bits_restriction.sql.)
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (checkSignupEmail(user?.email ?? "")) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?error=domain`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
