import Link from "next/link";
import { notFound } from "next/navigation";
import { getDog, getRankedNames } from "@/lib/queries";
import { getCurrentUserId } from "@/lib/auth";
import { dogPhotoUrl } from "@/lib/storage";
import NameVotes from "@/components/NameVotes";

export const dynamic = "force-dynamic";

export default async function DogPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [dog, names, userId] = await Promise.all([
    getDog(id),
    getRankedNames(id),
    getCurrentUserId(),
  ]);

  if (!dog) notFound();

  const photo = dogPhotoUrl(dog.photo_path);
  const displayName = names[0]?.name ?? "Unnamed pup";

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-8">
      <Link
        href="/"
        className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
      >
        ← The pack
      </Link>

      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <div className="aspect-video w-full bg-zinc-100 dark:bg-zinc-800">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt={displayName} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-6xl">🐾</div>
          )}
        </div>
      </div>

      <h1 className="mt-5 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        {displayName}
      </h1>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Names — vote for your favourite
        </h2>
        <NameVotes dogId={dog.id} initial={names} canVote={!!userId} />
      </section>
    </main>
  );
}
