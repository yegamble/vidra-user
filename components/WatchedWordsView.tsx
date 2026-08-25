"use client";

import { useState } from "react";

import { ListBoundary } from "@/components/admin/ListBoundary";
import { PagedListShell } from "@/components/admin/PagedListShell";
import { RoleGate } from "@/components/RoleGate";
import { Button } from "@/components/ui/Button";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { WatchedWord } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { usePagedList } from "@/lib/use-paged-list";

const MAX_WORD_LEN = 100;

// WatchedWordsView is the moderator/admin watched-words list: add and remove
// instance-wide watched terms. Role-gated by RoleGate (an under-privileged/
// anonymous viewer sees the shared permission prompt and nothing fetches).
export function WatchedWordsView() {
  return (
    <RoleGate minRole="moderator" action="manage watched words">
      <ListBoundary label="watched words">
        <WordsList />
      </ListBoundary>
    </RoleGate>
  );
}

function WordsList() {
  const list = usePagedList<WatchedWord>({
    load: (query, signal) =>
      api
        .getWatchedWords({ limit: query.limit, offset: query.offset }, signal)
        .then((res) => ({
          items: res.words,
          total: res.total,
          limit: res.limit,
          offset: res.offset,
        })),
  });

  return (
    <PagedListShell
      list={list}
      noun="watched word"
      // The add form is the surface's primary control, so it sits above the
      // list; a new term is prepended AND counted, which keeps the pager
      // honest without a refetch.
      toolbar={<AddWordForm onAdded={list.prepend} />}
      errorMessage="Could not load watched words."
      emptyTitle="No watched words"
      emptyMessage="Add a term above. Content containing a watched word can be flagged for review."
    >
      <ul className="flex flex-col gap-2">
        {list.items.map((w) => (
          <li key={w.id}>
            <WordRow word={w} onRemoved={(id) => list.drop((x) => x.id !== id)} />
          </li>
        ))}
      </ul>
    </PagedListShell>
  );
}

function AddWordForm({ onAdded }: { onAdded: (word: WatchedWord) => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const word = value.trim();
    if (word === "" || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.addWatchedWord(word);
      onAdded(created);
      setValue("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("That word is already on the list.");
      } else {
        setError(errorMessage(err, "Could not add this word."));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="flex gap-2">
        <input
          type="text"
          aria-label="Add a watched word"
          placeholder="Add a watched word or phrase"
          maxLength={MAX_WORD_LEN}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="focus-ring w-full max-w-sm rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted"
        />
        <Button type="submit" disabled={busy || value.trim() === ""} className="shrink-0">
          {busy ? "Adding…" : "Add"}
        </Button>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </form>
  );
}

function WordRow({ word, onRemoved }: { word: WatchedWord; onRemoved: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteWatchedWord(word.id);
      onRemoved(word.id);
    } catch (err) {
      setError(errorMessage(err, "Could not remove this word."));
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-fg">{word.word}</p>
        <p className="text-[13px] text-fg-muted">
          added {relativeTime(word.created_at)}
          {word.created_by_username ? (
            <>
              {" "}by <span className="font-medium text-fg">{word.created_by_username}</span>
            </>
          ) : null}
        </p>
        {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
      </div>
      <Button
        variant="secondary"
        size="sm"
        disabled={busy}
        aria-label={`Remove ${word.word}`}
        onClick={() => void remove()}
        className="shrink-0"
      >
        Remove
      </Button>
    </div>
  );
}
