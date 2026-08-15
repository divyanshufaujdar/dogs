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
      <main className="mx-auto w-full max-w-4xl px-6 py-16">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          Almost there
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Add your Supabase URL and anon key to{" "}
          <code className="font-mono">.env.local</code> and run{" "}
          <code className="font-mono">supabase/schema_mvp.sql</code> in the SQL
          Editor, then reload.
        </p>
      </main>
    );
  }

  const [dogs, userId] = await Promise.all([getDogCards(), getCurrentUserId()]);

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
            The pack
          </h1>
          <p className="text-sm text-zinc-500">
            {dogs.length === 0
              ? "No dogs yet — be the first to add one."
              : `${dogs.length} campus dog${dogs.length === 1 ? "" : "s"} and counting.`}
          </p>
        </div>
        <Link
          href={userId ? "/dogs/new" : "/login"}
          className="shrink-0 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          + Add a dog
        </Link>
      </div>

      {dogs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 py-16 text-center text-zinc-500 dark:border-zinc-700">
          🐾 Empty for now. Spotted a good boy or girl on campus? Add them.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {dogs.map((dog) => (
            <DogCard key={dog.id} dog={dog} />
          ))}
        </div>
      )}
    </main>
  );
}
