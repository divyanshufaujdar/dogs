"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TraitTally } from "@/lib/types";
import { togglePersonality } from "@/app/dogs/actions";

export default function PersonalityTags({
  dogId,
  initial,
  canVote,
}: {
  dogId: string;
  initial: TraitTally[];
  canVote: boolean;
}) {
  const router = useRouter();
  const [tags, setTags] = useState<TraitTally[]>(initial);
  const [custom, setCustom] = useState("");
  const [, startTransition] = useTransition();

  function sortTags(list: TraitTally[]) {
    return [...list].sort(
      (a, b) => b.votes - a.votes || a.trait.localeCompare(b.trait),
    );
  }

  function toggle(trait: string) {
    if (!canVote) return router.push("/login");

    const snapshot = tags;
    setTags((prev) =>
      sortTags(
        prev.map((t) =>
          t.trait === trait
            ? { ...t, mine: !t.mine, votes: t.votes + (t.mine ? -1 : 1) }
            : t,
        ),
      ),
    );
    startTransition(async () => {
      const res = await togglePersonality(dogId, trait);
      if (!res.ok) setTags(snapshot);
    });
  }

  function addCustom(e: React.FormEvent) {
    e.preventDefault();
    if (!canVote) return router.push("/login");
    const trait = custom.trim().toLowerCase();
    if (!trait) return;
    setCustom("");

    if (!tags.some((t) => t.trait === trait)) {
      setTags((prev) => sortTags([...prev, { trait, votes: 1, mine: true }]));
    } else {
      // Already listed — just make sure it's marked mine.
      setTags((prev) =>
        sortTags(
          prev.map((t) =>
            t.trait === trait && !t.mine
              ? { ...t, mine: true, votes: t.votes + 1 }
              : t,
          ),
        ),
      );
    }
    startTransition(async () => {
      const res = await togglePersonality(dogId, trait);
      // If it was already mine, the toggle would remove it — re-run to re-add.
      if (res.ok && res.data && !res.data.active) {
        await togglePersonality(dogId, trait);
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {tags.map((t) => (
          <button
            key={t.trait}
            onClick={() => toggle(t.trait)}
            aria-pressed={t.mine}
            className={`rounded-full border px-3 py-1.5 text-sm capitalize transition-colors ${
              t.mine
                ? "border-transparent bg-brand text-[var(--brand-ink)]"
                : "border-border bg-surface text-ink hover:bg-surface-2"
            }`}
          >
            {t.trait}
            {t.votes > 0 && (
              <span className={`ml-1.5 ${t.mine ? "opacity-70" : "text-muted"}`}>
                {t.votes}
              </span>
            )}
          </button>
        ))}
      </div>

      <form onSubmit={addCustom} className="mt-4 flex gap-2">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          maxLength={24}
          placeholder={canVote ? "Add another trait…" : "Sign in to add a trait"}
          className="input flex-1"
        />
        <button type="submit" className="btn btn-primary">
          Add
        </button>
      </form>
    </div>
  );
}
