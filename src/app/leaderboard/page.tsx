import Link from "next/link";
import { getLeaderboard, getMyFavourite } from "@/lib/queries";
import { getCurrentUserId } from "@/lib/auth";
import { dogPhotoUrl } from "@/lib/storage";
import FavouriteButton from "@/components/FavouriteButton";

export const dynamic = "force-dynamic";

const medals = ["🥇", "🥈", "🥉"];

export default async function LeaderboardPage() {
  const [dogs, myFav, userId] = await Promise.all([
    getLeaderboard(),
    getMyFavourite(),
    getCurrentUserId(),
  ]);

  const canVote = !!userId;
  const champ = dogs[0]?.favourites ? dogs[0] : null;
  const rest = champ ? dogs.slice(1) : dogs;

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <span className="eyebrow">BITS Pilani · campus favourite</span>
      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">
        The leaderboard
      </h1>
      <p className="mt-1.5 text-sm text-muted">
        One heart each — pick the dog that owns your heart. The pack&apos;s
        favourite rises to the top.
      </p>

      {/* Reigning favourite */}
      {champ && (
        <Link
          href={`/dogs/${champ.id}`}
          className="mt-6 flex items-center gap-4 overflow-hidden rounded-[1.3rem] border border-brand/40 bg-brand-soft p-4 shadow-[var(--shadow)]"
        >
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-surface-2">
            {dogPhotoUrl(champ.photo_path) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={dogPhotoUrl(champ.photo_path)!}
                alt={champ.top_name ?? "dog"}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full place-items-center text-4xl">🐾</div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">
              👑 Campus favourite
            </p>
            <p className="truncate font-display text-2xl font-semibold text-ink">
              {champ.top_name ?? "Unnamed pup"}
            </p>
            <p className="text-sm text-muted">
              {champ.favourites} {champ.favourites === 1 ? "heart" : "hearts"}
            </p>
          </div>
        </Link>
      )}

      {/* Ranked list */}
      <ol className="mt-6 space-y-2">
        {rest.map((dog, i) => {
          const rank = champ ? i + 2 : i + 1;
          return (
            <li
              key={dog.id}
              className="card flex items-center gap-3 p-3"
            >
              <span className="w-7 text-center font-display text-lg font-semibold text-muted">
                {medals[rank - 1] ?? rank}
              </span>
              <Link
                href={`/dogs/${dog.id}`}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                  {dogPhotoUrl(dog.photo_path) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={dogPhotoUrl(dog.photo_path)!}
                      alt={dog.top_name ?? "dog"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-xl">🐾</div>
                  )}
                </div>
                <span className="truncate font-medium text-ink">
                  {dog.top_name ?? "Unnamed pup"}
                </span>
              </Link>
              <FavouriteButton
                dogId={dog.id}
                initialFav={myFav === dog.id}
                initialCount={dog.favourites}
                canVote={canVote}
                size="sm"
              />
            </li>
          );
        })}
      </ol>

      {dogs.length === 0 && (
        <div className="card mt-6 grid place-items-center gap-2 border-dashed py-16 text-center">
          <span className="text-4xl">🏆</span>
          <p className="text-muted">
            No dogs yet — <Link href="/dogs/new" className="text-brand underline">add one</Link> to start the race.
          </p>
        </div>
      )}
    </main>
  );
}
