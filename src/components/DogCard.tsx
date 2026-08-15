import Link from "next/link";
import type { DogCard as DogCardData } from "@/lib/types";
import { dogPhotoUrl } from "@/lib/storage";

export default function DogCard({ dog }: { dog: DogCardData }) {
  const photo = dogPhotoUrl(dog.photo_path);
  const name = dog.top_name ?? "Unnamed pup";

  return (
    <Link
      href={`/dogs/${dog.id}`}
      className="group relative block overflow-hidden rounded-[1.1rem] border border-border bg-surface shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow)]"
    >
      <div className="aspect-square w-full overflow-hidden bg-surface-2">
        {dog.red_flagged && (
          <span
            title="Multiple bite reports — keep your distance"
            className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full bg-red-600/90 px-2.5 py-1 text-xs font-semibold text-white shadow-sm"
          >
            🚩 Caution
          </span>
        )}
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt={name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-5xl">🐾</div>
        )}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent"
        />
        <div className="absolute inset-x-0 bottom-0 p-3">
          <p className="truncate font-display text-lg font-semibold text-white drop-shadow">
            {name}
          </p>
          <p className="text-xs text-white/80">
            {dog.name_count === 0
              ? "No names yet"
              : `${dog.name_count} name${dog.name_count === 1 ? "" : "s"} · tap to vote`}
          </p>
        </div>
      </div>
    </Link>
  );
}
