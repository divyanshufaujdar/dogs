import { cookies } from "next/headers";
import { createAdminClient, hasAdminKey } from "@/lib/supabase/admin";
import { dogPhotoUrl } from "@/lib/storage";
import { ADMIN_COOKIE, sessionToken } from "@/lib/nimbooz";
import { unlock, lock } from "./actions";

export const dynamic = "force-dynamic";

function PasswordGate({ error }: { error: boolean }) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-20">
      <div className="card p-8 shadow-[var(--shadow)]">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-ink text-2xl">
          🔒
        </span>
        <h1 className="mt-5 font-display text-2xl font-semibold text-ink">
          Admin access
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          Restricted. Enter the admin password to continue.
        </p>
        <form action={unlock} className="mt-6 space-y-3">
          <input
            type="password"
            name="password"
            autoFocus
            placeholder="Password"
            className="input"
          />
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">
              Wrong password.
            </p>
          )}
          <button type="submit" className="btn btn-primary w-full py-2.5">
            Unlock
          </button>
        </form>
      </div>
    </main>
  );
}

type Row = {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  dogs: number;
  photos: number;
  sightings: number;
  names: number;
};

export default async function NimboozPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const store = await cookies();
  const authed = store.get(ADMIN_COOKIE)?.value === sessionToken();

  if (!authed) return <PasswordGate error={error === "1"} />;

  if (!hasAdminKey()) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <p className="text-muted">
          SUPABASE_SERVICE_ROLE_KEY is not set — the admin dashboard needs it to
          read across all users.
        </p>
      </main>
    );
  }

  const admin = createAdminClient();
  const [
    { data: profiles },
    { data: dogs },
    { data: photos },
    { data: sightings },
    { data: names },
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("id, email, display_name, created_at")
      .order("created_at", { ascending: true }),
    admin.from("dogs").select("id, created_by, status, created_at"),
    admin.from("photos").select("id, uploaded_by, storage_path, dog_id, is_primary, created_at"),
    admin.from("sightings").select("id, user_id"),
    admin.from("name_suggestions").select("id, suggested_by, name, dog_id"),
  ]);

  const profs = profiles ?? [];
  const allDogs = dogs ?? [];
  const allPhotos = photos ?? [];
  const allSightings = sightings ?? [];
  const allNames = names ?? [];

  const count = <T,>(arr: T[], pick: (t: T) => string | null, id: string) =>
    arr.filter((t) => pick(t) === id).length;

  const rows: Row[] = profs.map((p) => ({
    id: p.id,
    email: p.email,
    display_name: p.display_name,
    created_at: p.created_at,
    dogs: count(allDogs, (d) => d.created_by, p.id),
    photos: count(allPhotos, (ph) => ph.uploaded_by, p.id),
    sightings: count(allSightings, (s) => s.user_id, p.id),
    names: count(allNames, (n) => n.suggested_by, p.id),
  }));

  const emailOf = (uid: string | null) =>
    profs.find((p) => p.id === uid)?.email ?? "—";

  // Uploads: newest dogs with a photo + uploader.
  const uploads = [...allDogs]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .map((d) => {
      const photo =
        allPhotos.find((p) => p.dog_id === d.id && p.is_primary) ??
        allPhotos.find((p) => p.dog_id === d.id);
      const topName = allNames.find((n) => n.dog_id === d.id)?.name ?? null;
      return {
        id: d.id,
        status: d.status,
        created_at: d.created_at,
        uploader: emailOf(d.created_by),
        photoPath: photo?.storage_path ?? null,
        name: topName,
      };
    });

  const stat = (label: string, value: number) => (
    <div className="card px-4 py-3">
      <p className="font-display text-2xl font-semibold text-ink">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <span className="eyebrow">Admin · /nimbooz</span>
          <h1 className="font-display text-3xl font-semibold text-ink">
            Dashboard
          </h1>
        </div>
        <form action={lock}>
          <button className="btn btn-ghost border border-border">Lock</button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stat("Users", profs.length)}
        {stat("Dogs", allDogs.length)}
        {stat("Photos", allPhotos.length)}
        {stat("Sightings", allSightings.length)}
      </div>

      {/* Users */}
      <h2 className="eyebrow mb-3 mt-10">Who&apos;s logged in ({rows.length})</h2>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3 font-medium">Dogs</th>
              <th className="px-4 py-3 font-medium">Photos</th>
              <th className="px-4 py-3 font-medium">Sightings</th>
              <th className="px-4 py-3 font-medium">Names</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-3 text-ink">{r.email ?? "—"}</td>
                <td className="px-4 py-3 text-muted">
                  {new Date(r.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">{r.dogs}</td>
                <td className="px-4 py-3">{r.photos}</td>
                <td className="px-4 py-3">{r.sightings}</td>
                <td className="px-4 py-3">{r.names}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted">
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Uploads */}
      <h2 className="eyebrow mb-3 mt-10">
        What they uploaded ({uploads.length})
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {uploads.map((u) => (
          <div key={u.id} className="card overflow-hidden">
            <div className="aspect-square w-full bg-surface-2">
              {dogPhotoUrl(u.photoPath) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={dogPhotoUrl(u.photoPath)!}
                  alt={u.name ?? "dog"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="grid h-full place-items-center text-3xl">🐾</div>
              )}
            </div>
            <div className="p-3">
              <p className="truncate font-medium text-ink">
                {u.name ?? "Unnamed"}{" "}
                {u.status !== "active" && (
                  <span className="text-xs text-amber-600">({u.status})</span>
                )}
              </p>
              <p className="truncate text-xs text-muted">{u.uploader}</p>
              <p className="text-xs text-muted/70">
                {new Date(u.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        ))}
        {uploads.length === 0 && (
          <p className="text-sm text-muted">No uploads yet.</p>
        )}
      </div>
    </main>
  );
}
