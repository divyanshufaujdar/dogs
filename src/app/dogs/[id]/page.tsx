import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getDog,
  getDogPhotos,
  getRankedNames,
  getSightings,
  getPersonality,
  getSafety,
  getDogFavouriteInfo,
} from "@/lib/queries";
import { getCurrentUserId } from "@/lib/auth";
import PhotoCarousel from "@/components/PhotoCarousel";
import NameVotes from "@/components/NameVotes";
import SightingMap from "@/components/SightingMap";
import PersonalityTags from "@/components/PersonalityTags";
import SafetyControl from "@/components/SafetyControl";
import FavouriteButton from "@/components/FavouriteButton";
import SightingsLog from "@/components/SightingsLog";

export const dynamic = "force-dynamic";

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="eyebrow">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default async function DogPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [dog, photos, names, sightings, personality, safety, fav, userId] =
    await Promise.all([
      getDog(id),
      getDogPhotos(id),
      getRankedNames(id),
      getSightings(id),
      getPersonality(id),
      getSafety(id),
      getDogFavouriteInfo(id),
      getCurrentUserId(),
    ]);

  if (!dog) notFound();

  const galleryPaths = photos.length ? photos : dog.photo_path ? [dog.photo_path] : [];
  const displayName = names[0]?.name ?? "Unnamed pup";
  const canVote = !!userId;
  const hasSuggested = !!userId && names.some((n) => n.suggested_by === userId);
  const lastSeen = sightings[0];

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-8">
      <Link href="/" className="text-sm text-muted hover:text-ink">
        ← The pack
      </Link>

      <div className="relative mt-4 overflow-hidden rounded-[1.3rem] border border-border shadow-[var(--shadow)]">
        {galleryPaths.length ? (
          <PhotoCarousel paths={galleryPaths} alt={displayName} />
        ) : (
          <div className="grid aspect-[4/3] w-full place-items-center bg-surface-2 text-6xl">
            🐾
          </div>
        )}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-28 bg-gradient-to-t from-black/70 to-transparent"
        />
        <div className="absolute right-4 top-4 z-10">
          <FavouriteButton
            dogId={dog.id}
            initialFav={fav.mine}
            initialCount={fav.count}
            canVote={canVote}
            size="sm"
          />
        </div>
        <h1 className="pointer-events-none absolute bottom-4 left-5 z-[6] font-display text-3xl font-semibold text-white drop-shadow">
          {displayName}
        </h1>
      </div>

      <div className="mt-8 space-y-5">
        <Section title="Names — vote for your favourite">
          <NameVotes
            dogId={dog.id}
            initial={names}
            canVote={canVote}
            hasSuggested={hasSuggested}
          />
        </Section>

        <Section title="Safety — how does this dog behave?">
          <SafetyControl
            dogId={dog.id}
            initial={safety}
            canVote={canVote}
            redFlagged={dog.red_flagged}
          />
        </Section>

        <Section title="Personality">
          <PersonalityTags dogId={dog.id} initial={personality} canVote={canVote} />
        </Section>

        <Section
          title="Where's this dog?"
          aside={
            lastSeen ? (
              <span className="text-xs text-muted">
                last found {new Date(lastSeen.created_at).toLocaleDateString()}
              </span>
            ) : undefined
          }
        >
          <SightingMap
            dogId={dog.id}
            sightings={sightings}
            canAdd={canVote}
            redFlagged={dog.red_flagged}
            biteReports={safety.counts.bites}
          />
          <div className="mt-5 border-t border-border pt-4">
            <h3 className="eyebrow mb-3">Sightings log</h3>
            <SightingsLog sightings={sightings} />
          </div>
        </Section>
      </div>
    </main>
  );
}
