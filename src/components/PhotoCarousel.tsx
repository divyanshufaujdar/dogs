"use client";

import { useRef, useState } from "react";
import { dogPhotoUrl } from "@/lib/storage";

/**
 * Swipeable hero gallery for a dog's photos. Native horizontal scroll-snap =
 * real touch swiping on mobile, with dots + arrows on desktop.
 */
export default function PhotoCarousel({
  paths,
  alt,
}: {
  paths: string[];
  alt: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  }

  function goTo(i: number) {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }

  return (
    <div className="relative aspect-[4/3] w-full bg-surface-2">
      <div
        ref={scroller}
        onScroll={onScroll}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {paths.map((p, i) => {
          const url = dogPhotoUrl(p);
          return (
            <div
              key={p + i}
              className="relative h-full w-full flex-none snap-center"
            >
              {url && (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt=""
                    aria-hidden
                    className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-2xl"
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`${alt} — photo ${i + 1}`}
                    className="relative h-full w-full object-contain"
                  />
                </>
              )}
            </div>
          );
        })}
      </div>

      {paths.length > 1 && (
        <>
          {/* Arrows (desktop) */}
          {index > 0 && (
            <button
              onClick={() => goTo(index - 1)}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white backdrop-blur hover:bg-black/60 sm:grid"
            >
              ‹
            </button>
          )}
          {index < paths.length - 1 && (
            <button
              onClick={() => goTo(index + 1)}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white backdrop-blur hover:bg-black/60 sm:grid"
            >
              ›
            </button>
          )}

          {/* Count pill (top-left; favourite button lives top-right) */}
          <div className="absolute left-3 top-3 z-10 rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
            {index + 1} / {paths.length}
          </div>

          {/* Dots */}
          <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
            {paths.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                aria-label={`Go to photo ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-5 bg-white" : "w-1.5 bg-white/50"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
