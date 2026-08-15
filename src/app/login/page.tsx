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

  useEffect(() => {
    if (state?.ok) {
      router.push("/");
      router.refresh();
    }
  }, [state, router]);

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
          Sign in with your BITS Pilani email — no password, no waiting for a
          link.
        </p>

        <form action={formAction} className="mt-6 space-y-3">
          <input
            type="email"
            name="email"
            required
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
            className="btn btn-primary w-full py-2.5"
          >
            {pending || state?.ok
              ? "Signing in…"
              : "Authenticate with your BITS email"}
          </button>
        </form>

        <p className="mt-4 text-xs text-muted">
          Only <span className="font-medium text-ink">bits-pilani.ac.in</span>{" "}
          addresses can join — that keeps the naming votes honest.
        </p>
      </div>

      <Link
        href="/"
        className="mx-auto mt-6 text-sm text-muted hover:text-ink"
      >
        ← Back to the pack
      </Link>
    </div>
  );
}
