"use client";

import { Suspense, useActionState, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { authenticate, type LoginState } from "./actions";

// Real login: Google OAuth, which proves the person controls the account and
// gives Supabase a verified email. The BITS-domain gate lives in
// /auth/callback (app-level) and the auth.users DB trigger (authoritative) —
// the `hd` param below is only a hint to Google's account picker.
const SHOW_DEV_LOGIN = process.env.NODE_ENV !== "production";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.17 3.57-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.87-3c-1.08.72-2.45 1.14-4.06 1.14-3.13 0-5.78-2.11-6.72-4.96H1.29v3.1A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27a7.2 7.2 0 0 1 0-4.54v-3.1H1.29a12.02 12.02 0 0 0 0 10.74l3.99-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.44-3.44A11.98 11.98 0 0 0 1.29 6.63l3.99 3.1C6.22 6.88 8.87 4.77 12 4.77Z"
      />
    </svg>
  );
}

function LoginCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");
  const [oauthBusy, setOauthBusy] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    authenticate,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      router.push("/");
      router.refresh();
    }
  }, [state, router]);

  async function signInWithGoogle() {
    setOauthBusy(true);
    setOauthError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${location.origin}/auth/callback`,
        // Pre-filters Google's account chooser to the BITS Workspace domain.
        // A UX nicety only — enforcement happens in /auth/callback + the DB.
        queryParams: { hd: "bits-pilani.ac.in" },
      },
    });
    if (error) {
      setOauthError(error.message);
      setOauthBusy(false);
    }
  }

  const urlErrorMessage =
    urlError === "domain"
      ? "That Google account isn't a BITS Pilani address. Sign in with your @…bits-pilani.ac.in account."
      : urlError === "auth"
        ? "Sign-in failed — please try again."
        : null;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <div className="card p-8 shadow-[var(--shadow)]">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand text-2xl shadow-sm">
          🐕
        </span>
        <h1 className="mt-5 font-display text-2xl font-semibold text-ink">
          Welcome to the pack
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          Sign in with your BITS Pilani Google account.
        </p>

        <button
          onClick={signInWithGoogle}
          disabled={oauthBusy}
          className="btn btn-primary mt-6 w-full gap-2 py-2.5"
        >
          <GoogleIcon />
          {oauthBusy ? "Redirecting…" : "Continue with Google"}
        </button>

        {(urlErrorMessage || oauthError) && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">
            {oauthError ?? urlErrorMessage}
          </p>
        )}

        {SHOW_DEV_LOGIN && (
          <form action={formAction} className="mt-6 space-y-3 border-t border-border pt-5">
            <p className="text-xs text-muted">
              Dev-only fallback (no Google credentials needed locally):
            </p>
            <input
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@pilani.bits-pilani.ac.in"
              className="input"
            />
            {state && !state.ok && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {state.message}
              </p>
            )}
            <button
              type="submit"
              disabled={pending || state?.ok === true}
              className="btn btn-ghost w-full border border-border py-2.5"
            >
              {pending || state?.ok ? "Signing in…" : "Dev sign-in (no password)"}
            </button>
          </form>
        )}

        <p className="mt-4 text-xs text-muted">
          Only <span className="font-medium text-ink">bits-pilani.ac.in</span>{" "}
          addresses can join — that keeps the naming votes honest.
        </p>
      </div>

      <Link href="/" className="mx-auto mt-6 text-sm text-muted hover:text-ink">
        ← Back to the pack
      </Link>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginCard />
    </Suspense>
  );
}
