"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleFavourite } from "@/app/dogs/actions";

export default function FavouriteButton({
  dogId,
  initialFav,
  initialCount,
  canVote,
  size = "md",
}: {
  dogId: string;
  initialFav: boolean;
  initialCount: number;
  canVote: boolean;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [fav, setFav] = useState(initialFav);
  const [count, setCount] = useState(initialCount);
  const [, startTransition] = useTransition();

  function click() {
    if (!canVote) return router.push("/login");
    const prevFav = fav;
    const prevCount = count;
    setFav(!fav);
    setCount(count + (fav ? -1 : 1));

    startTransition(async () => {
      const res = await toggleFavourite(dogId);
      if (!res.ok) {
        setFav(prevFav);
        setCount(prevCount);
      } else {
        // Reflect that favouriting here may have moved it off another dog.
        router.refresh();
      }
    });
  }

  const pad = size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2";

  return (
    <button
      onClick={click}
      aria-pressed={fav}
      title={fav ? "Your campus favourite" : "Make this your favourite"}
      className={`inline-flex items-center gap-2 rounded-full border font-semibold transition-colors ${pad} ${
        fav
          ? "border-transparent bg-rose-500 text-white"
          : "border-border bg-surface text-ink hover:bg-surface-2"
      }`}
    >
      <span aria-hidden>{fav ? "❤️" : "🤍"}</span>
      {count}
    </button>
  );
}
