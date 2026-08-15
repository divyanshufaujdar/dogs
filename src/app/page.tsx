import { checkSupabaseHealth } from "@/lib/supabase/health";

const phases = [
  { n: 1, title: "Skeleton, live", status: "current" },
  { n: 2, title: "Add-a-dog, see-a-dog" },
  { n: 3, title: "Accounts" },
  { n: 4, title: "The naming vote" },
  { n: 5, title: "Map & sightings" },
  { n: 6, title: "Temperament tags" },
  { n: 7, title: "Harden, then delight" },
] as const;

function StatusPill({ state }: { state: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    connected: {
      label: "Supabase connected",
      cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30",
    },
    unconfigured: {
      label: "Supabase not configured",
      cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/30",
    },
    error: {
      label: "Supabase error",
      cls: "bg-red-500/15 text-red-700 dark:text-red-300 ring-red-500/30",
    },
  };
  const s = map[state] ?? map.error;
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset ${s.cls}`}
    >
      <span className="h-2 w-2 rounded-full bg-current" />
      {s.label}
    </span>
  );
}

export default async function Home() {
  const health = await checkSupabaseHealth();

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-16 dark:bg-zinc-950">
      <main className="w-full max-w-2xl">
        <div className="mb-3 flex items-center gap-3">
          <span className="text-4xl">🐕</span>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Campus Dogs
          </h1>
        </div>
        <p className="mb-8 text-lg text-zinc-600 dark:text-zinc-400">
          A community directory for the strays of BITS Pilani — upload photos,
          vote on names, log sightings, and tag each dog&apos;s personality and
          safety.
        </p>

        <div className="mb-10">
          <StatusPill state={health.state} />
          {health.state === "unconfigured" && (
            <p className="mt-2 text-sm text-zinc-500">
              Add <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
              <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{" "}
              <code className="font-mono">.env.local</code>, then restart the dev
              server.
            </p>
          )}
          {health.state === "error" && (
            <p className="mt-2 text-sm text-red-500">{health.message}</p>
          )}
        </div>

        <ol className="space-y-2">
          {phases.map((p) => (
            <li
              key={p.n}
              className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
                "status" in p
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
              }`}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white dark:bg-zinc-50 dark:text-zinc-900">
                {p.n}
              </span>
              <span className="font-medium text-zinc-800 dark:text-zinc-200">
                {p.title}
              </span>
              {"status" in p && (
                <span className="ml-auto text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                  You are here
                </span>
              )}
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
