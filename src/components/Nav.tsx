import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";

export default async function Nav() {
  const profile = await getCurrentProfile();

  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <nav className="mx-auto flex w-full max-w-4xl items-center gap-4 px-6 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold text-zinc-900 dark:text-zinc-50">
          <span className="text-xl">🐕</span>
          <span>Campus Dogs</span>
        </Link>

        <div className="ml-auto flex items-center gap-2 text-sm">
          {profile ? (
            <>
              <Link
                href="/dogs/new"
                className="rounded-lg bg-zinc-900 px-3 py-1.5 font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                + Add a dog
              </Link>
              <span className="hidden text-zinc-500 sm:inline">
                {profile.display_name ?? profile.email}
              </span>
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="rounded-lg px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-zinc-900 px-3 py-1.5 font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
