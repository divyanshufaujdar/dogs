"use client";

import dynamic from "next/dynamic";
import type { Sighting } from "@/lib/types";

// Leaflet needs the browser, so load the real map client-side only.
const SightingMapInner = dynamic(() => import("./SightingMapInner"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[320px] items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-sm text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">
      Loading map…
    </div>
  ),
});

export default function SightingMap(props: {
  dogId: string;
  sightings: Sighting[];
  canAdd: boolean;
}) {
  return <SightingMapInner {...props} />;
}
