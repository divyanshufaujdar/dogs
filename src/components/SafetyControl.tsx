"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SafetySummary, SafetyLevel } from "@/lib/types";
import { SAFETY_LEVELS } from "@/lib/constants";
import { setSafety } from "@/app/dogs/actions";

const styles: Record<
  SafetyLevel,
  { ring: string; active: string; bar: string }
> = {
  friendly: {
    ring: "ring-emerald-500/40",
    active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    bar: "bg-emerald-500",
  },
  chases: {
    ring: "ring-amber-500/40",
    active: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    bar: "bg-amber-500",
  },
  bites: {
    ring: "ring-red-500/50",
    active: "bg-red-500/15 text-red-700 dark:text-red-300",
    bar: "bg-red-500",
  },
};

export default function SafetyControl({
  dogId,
  initial,
  canVote,
}: {
  dogId: string;
  initial: SafetySummary;
  canVote: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<SafetySummary>(initial);
  const [, startTransition] = useTransition();

  function recompute(counts: Record<SafetyLevel, number>, mine: SafetyLevel | null) {
    const total = counts.friendly + counts.chases + counts.bites;
    let majority: SafetyLevel | null = null;
    let best = 0;
    (["bites", "chases", "friendly"] as SafetyLevel[]).forEach((l) => {
      if (counts[l] > best) {
        best = counts[l];
        majority = l;
      }
    });
    return { counts, total, majority, mine };
  }

  function choose(level: SafetyLevel) {
    if (!canVote) return router.push("/login");

    const snapshot = data;
    const next = { ...data.counts };
    const clearing = data.mine === level;

    if (data.mine) next[data.mine] = Math.max(0, next[data.mine] - 1);
    const newMine: SafetyLevel | null = clearing ? null : level;
    if (newMine) next[newMine] += 1;

    setData(recompute(next, newMine));

    startTransition(async () => {
      const res = await setSafety(dogId, newMine);
      if (!res.ok) setData(snapshot);
    });
  }

  const bites = data.majority === "bites" && data.counts.bites > 0;

  return (
    <div>
      {bites && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 font-semibold text-red-700 dark:text-red-300">
          <span className="text-xl">🛑</span>
          Caution: the community reports this dog <u>bites</u>. Keep your distance.
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {SAFETY_LEVELS.map(({ level, label, emoji }) => {
          const s = styles[level];
          const isMine = data.mine === level;
          const count = data.counts[level];
          const pct = data.total ? Math.round((count / data.total) * 100) : 0;
          return (
            <button
              key={level}
              onClick={() => choose(level)}
              aria-pressed={isMine}
              className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-3 text-sm transition-colors ${
                isMine
                  ? `${s.active} ring-2 ring-inset ${s.ring} border-transparent`
                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              <span className="text-lg">{emoji}</span>
              <span className="font-medium">{label}</span>
              <span className="text-xs text-zinc-500">
                {count} · {pct}%
              </span>
              <span className="mt-1 h-1 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                <span
                  className={`block h-full ${s.bar}`}
                  style={{ width: `${pct}%` }}
                />
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        {data.total === 0
          ? canVote
            ? "No safety votes yet — tap to add the first."
            : "No safety votes yet."
          : `${data.total} ${data.total === 1 ? "vote" : "votes"}${
              canVote ? " · tap your rating (tap again to clear)" : ""
            }`}
      </p>
    </div>
  );
}
