import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getDog,
  getRankedNames,
  getSightings,
  getPersonality,
  getSafety,
} from "@/lib/queries";
import { getCurrentUserId } from "@/lib/auth";
import { dogPhotoUrl } from "@/lib/storage";
import NameVotes from "@/components/NameVotes";
import SightingMap from "@/components/SightingMap";
import PersonalityTags from "@/components/PersonalityTags";
import SafetyControl from "@/components/SafetyControl";

export const dynamic = "force-dynamic";

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
      {children}
    </h2>
  );
}

export default async function DogPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [dog, names, sightings, personality, safety, userId] =
    await Promise.all([
      getDog(id),
      getRankedNames(id),
      getSightings(id),
      getPersonality(id),
      getSafety(id),
      getCurrentUserId(),
    ]);

  if (!dog) notFound();

  const photo = dogPhotoUrl(dog.photo_path);
  const displayName = names[0]?.name ?? "Unnamed pup";
  const canVote = !!userId;
  const hasSuggested = !!userId && names.some((n) => n.suggested_by === userId);
  const lastSeen = sightings[0];

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

      <div className="mt-10 space-y-10">
        <section>
          <SectionHeading>Names — vote for your favourite</SectionHeading>
          <NameVotes
            dogId={dog.id}
            initial={names}
            canVote={canVote}
            hasSuggested={hasSuggested}
          />
        </section>

        <section>
          <SectionHeading>Safety — how does this dog behave?</SectionHeading>
          <SafetyControl dogId={dog.id} initial={safety} canVote={canVote} />
        </section>

        <section>
          <SectionHeading>Personality</SectionHeading>
          <PersonalityTags dogId={dog.id} initial={personality} canVote={canVote} />
        </section>

        <section>
          <SectionHeading>
            Where&apos;s this dog?{" "}
            {lastSeen && (
              <span className="ml-1 font-normal normal-case text-zinc-400">
                last found {new Date(lastSeen.created_at).toLocaleDateString()}
              </span>
            )}
          </SectionHeading>
          <SightingMap dogId={dog.id} sightings={sightings} canAdd={canVote} />
        </section>
      </div>
    </main>
  );
}
