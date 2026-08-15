"use client";

import { useEffect, useState } from "react";
import type { Sighting } from "@/lib/types";

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function SightingsLog({ sightings }: { sightings: Sighting[] }) {
  const [expanded, setExpanded] = useState(false);
  // Times are locale/clock-dependent → render them only after mount so the
  // server and client markup match (no hydration mismatch).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (sightings.length === 0) {
    return (
      <p className="text-sm text-muted">
        No sightings logged yet — drop a pin above when you spot this dog.
      </p>
    );
  }

  const shown = expanded ? sightings : sightings.slice(0, 3);

  return (
    <div>
      <ol className="space-y-2.5">
        {shown.map((s, i) => (
          <li key={s.id} className="flex gap-3">
            <span
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                i === 0 && !expanded ? "bg-brand" : "bg-border"
              } ${i === 0 ? "ring-2 ring-brand-soft" : ""}`}
            />
            <div className="min-w-0">
              <p className="text-sm text-ink">
                {i === 0 ? "Last found" : "Seen"}
                {mounted && (
                  <span className="text-muted"> · {timeAgo(s.created_at)}</span>
                )}
              </p>
              {s.note ? (
                <p className="truncate text-sm text-muted">“{s.note}”</p>
              ) : (
                mounted && (
                  <p className="text-xs text-muted/70">
                    {new Date(s.created_at).toLocaleString()}
                  </p>
                )
              )}
            </div>
          </li>
        ))}
      </ol>

      {sightings.length > 3 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 text-sm font-medium text-brand hover:underline"
        >
          {expanded ? "Show fewer" : `List all ${sightings.length} sightings`}
        </button>
      )}
    </div>
  );
}
