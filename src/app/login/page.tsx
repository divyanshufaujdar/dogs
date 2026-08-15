"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authenticate, type LoginState } from "./actions";

export default function LoginPage() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    authenticate,
    null,
  );

  // On success, drop into the app and refresh so the nav picks up the session.
  useEffect(() => {
    if (state?.ok) {
      router.push("/");
      router.refresh();
    }
  }, [state, router]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        Sign in
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Use your BITS Pilani email — no password, no waiting for a link.
      </p>

      <form action={formAction} className="mt-6 space-y-3">
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@pilani.bits-pilani.ac.in"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-100"
        />
        {state && !state.ok && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {state.message}
          </p>
        )}
        <button
          type="submit"
          disabled={pending || state?.ok === true}
          className="w-full rounded-lg bg-zinc-900 px-4 py-2 font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {pending || state?.ok ? "Signing in…" : "Authenticate with your BITS email"}
        </button>
      </form>

      <Link
        href="/"
        className="mt-6 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
      >
        ← Back to the pack
      </Link>
    </div>
  );
}
