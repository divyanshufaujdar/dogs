"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RankedName } from "@/lib/types";
import { addName, toggleNameVote } from "@/app/dogs/actions";

function rank(list: RankedName[]): RankedName[] {
  return [...list].sort(
    (a, b) =>
      b.votes - a.votes ||
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

export default function NameVotes({
  dogId,
  initial,
  canVote,
  hasSuggested,
}: {
  dogId: string;
  initial: RankedName[];
  canVote: boolean;
  hasSuggested: boolean;
}) {
  const router = useRouter();
  const [names, setNames] = useState<RankedName[]>(rank(initial));
  const [suggested, setSuggested] = useState(hasSuggested);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Single choice per dog: voting a new name moves the vote off the old one.
  function vote(suggestionId: string) {
    if (!canVote) {
      router.push("/login");
      return;
    }
    setError(null);
    const snapshot = names;

    setNames((prev) =>
      rank(
        prev.map((n) => {
          if (n.suggestion_id === suggestionId) {
            return {
              ...n,
              voted_by_me: !n.voted_by_me,
              votes: n.votes + (n.voted_by_me ? -1 : 1),
            };
          }
          // Clear my vote from any other name.
          if (n.voted_by_me) {
            return { ...n, voted_by_me: false, votes: n.votes - 1 };
          }
          return n;
        }),
      ),
    );

    startTransition(async () => {
      const res = await toggleNameVote(dogId, suggestionId);
      if (!res.ok) {
        setNames(snapshot);
        setError(res.error);
      }
    });
  }

  async function submitName(e: React.FormEvent) {
    e.preventDefault();
    if (!canVote) {
      router.push("/login");
      return;
    }
    const name = newName.trim();
    if (!name) return;
    setError(null);

    const res = await addName(dogId, name);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    // Suggesting is my single vote — add the new name and clear any prior pick.
    setNames((prev) =>
      rank([
        ...prev.map((n) =>
          n.voted_by_me ? { ...n, voted_by_me: false, votes: n.votes - 1 } : n,
        ),
        {
          suggestion_id: res.data.suggestionId,
          dog_id: dogId,
          name: res.data.name,
          suggested_by: "",
          created_at: new Date().toISOString(),
          votes: 1,
          voted_by_me: true,
        },
      ]),
    );
    setNewName("");
    setSuggested(true);
  }

  return (
    <div>
      <ol className="space-y-2">
        {names.map((n, i) => (
          <li
            key={n.suggestion_id}
            className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <span className="w-5 text-center text-sm font-semibold text-zinc-400">
              {i + 1}
            </span>
            <span className="flex-1 font-medium text-zinc-900 dark:text-zinc-50">
              {n.name}
            </span>
            <button
              onClick={() => vote(n.suggestion_id)}
              aria-pressed={n.voted_by_me}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold transition-colors ${
                n.voted_by_me
                  ? "bg-emerald-500/15 text-emerald-700 ring-1 ring-inset ring-emerald-500/40 dark:text-emerald-300"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              <span aria-hidden>▲</span>
              {n.votes}
            </button>
          </li>
        ))}
        {names.length === 0 && (
          <li className="rounded-lg border border-dashed border-zinc-300 px-3 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
            No names yet — suggest one below.
          </li>
        )}
      </ol>

      {suggested ? (
        <p className="mt-3 text-xs text-zinc-500">
          You&apos;ve suggested your one name for this dog. Tap a name above to
          move your vote (you get one).
        </p>
      ) : (
        <form onSubmit={submitName} className="mt-3 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={40}
            placeholder={
              canVote ? "Suggest a name…" : "Sign in to suggest a name"
            }
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-100"
          />
          <button
            type="submit"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Add
          </button>
        </form>
      )}

      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
