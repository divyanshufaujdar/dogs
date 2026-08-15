import Link from "next/link";
import type { DogCard as DogCardData } from "@/lib/types";
import { dogPhotoUrl } from "@/lib/storage";

export default function DogCard({ dog }: { dog: DogCardData }) {
  const photo = dogPhotoUrl(dog.photo_path);
  const name = dog.top_name ?? "Unnamed pup";

  return (
    <Link
      href={`/dogs/${dog.id}`}
      className="group overflow-hidden rounded-xl border border-zinc-200 bg-white transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="aspect-square w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt={name}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-5xl">
            🐾
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="truncate font-semibold text-zinc-900 dark:text-zinc-50">
          {name}
        </p>
        <p className="text-xs text-zinc-500">
          {dog.name_count === 0
            ? "No names yet"
            : `${dog.name_count} name${dog.name_count === 1 ? "" : "s"} in the running`}
        </p>
      </div>
    </Link>
  );
}
