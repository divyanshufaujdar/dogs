import Link from "next/link";
import { getDogCards } from "@/lib/queries";
import { getCurrentUserId } from "@/lib/auth";
import DogCard from "@/components/DogCard";

export const dynamic = "force-dynamic";

function isConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return !!url && !url.includes("your-project");
}

export default async function Home() {
  if (!isConfigured()) {
    return (
      <main className="mx-auto w-full max-w-5xl px-6 py-16">
        <h1 className="font-display text-3xl font-semibold text-ink">
          Almost there
        </h1>
        <p className="mt-2 text-muted">
          Add your Supabase URL and anon key to{" "}
          <code className="font-mono">.env.local</code> and run the schema in the
          SQL Editor, then reload.
        </p>
      </main>
    );
  }

  const [dogs, userId] = await Promise.all([getDogCards(), getCurrentUserId()]);

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-[1.5rem] border border-border bg-surface px-8 py-12 shadow-[var(--shadow)] sm:px-12 sm:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-brand-soft blur-2xl"
        />
        <div className="relative max-w-xl">
          <span className="eyebrow">BITS Pilani · community directory</span>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-[1.05] text-ink sm:text-5xl">
            Every campus dog,{" "}
            <span className="italic text-brand">known &amp; named</span>.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted">
            Snap the strays you meet, put their names to a vote, log where they
            roam, and share whether they&apos;re a cuddle or a chaser — one
            shared directory for the whole campus.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={userId ? "/dogs/new" : "/login"}
              className="btn btn-brand px-5 py-2.5"
            >
              <span className="text-base leading-none">+</span> Add a dog
            </Link>
            {!userId && (
              <Link href="/login" className="btn btn-ghost border border-border">
                Sign in with BITS email
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Grid */}
      <div className="mb-5 mt-12 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold text-ink">
            The pack
          </h2>
          <p className="text-sm text-muted">
            {dogs.length === 0
              ? "No dogs yet — be the first to add one."
              : `${dogs.length} campus dog${dogs.length === 1 ? "" : "s"} on the map.`}
          </p>
        </div>
      </div>

      {dogs.length === 0 ? (
        <div className="card grid place-items-center gap-2 border-dashed py-20 text-center">
          <span className="text-4xl">🐾</span>
          <p className="text-muted">
            Empty for now. Spotted a good boy or girl on campus? Add them.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
          {dogs.map((dog) => (
            <DogCard key={dog.id} dog={dog} />
          ))}
        </div>
      )}
    </main>
  );
}
