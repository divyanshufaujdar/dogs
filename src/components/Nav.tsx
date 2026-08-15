import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import NavTabs from "@/components/NavTabs";

function initials(name: string) {
  return name.trim().slice(0, 2).toUpperCase();
}

export default async function Nav() {
  const profile = await getCurrentProfile();
  const label = profile?.display_name ?? profile?.email ?? "";

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
      <nav className="mx-auto flex w-full max-w-5xl items-center gap-4 px-6 py-3">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand text-lg shadow-sm">
            🐕
          </span>
          <span className="hidden font-display text-lg font-semibold text-ink sm:inline">
            Campus Dogs
          </span>
        </Link>

        <NavTabs />

        <div className="ml-auto flex items-center gap-2">
          {profile ? (
            <>
              <Link href="/dogs/new" className="btn btn-brand">
                <span className="text-base leading-none">+</span> Add a dog
              </Link>
              <div className="flex items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1 pr-1 sm:pr-3">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-surface-2 text-xs font-bold text-ink">
                  {initials(label || "?")}
                </span>
                <span className="hidden max-w-[10rem] truncate text-sm text-muted sm:inline">
                  {label}
                </span>
              </div>
              <form action="/auth/signout" method="post">
                <button type="submit" className="btn btn-ghost" title="Sign out">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link href="/login" className="btn btn-primary">
              Sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
