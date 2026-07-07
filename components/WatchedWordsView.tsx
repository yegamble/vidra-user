"use client";

import { useCallback, useEffect, useState } from "react";

import { RoleGate } from "@/components/RoleGate";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { WatchedWord } from "@/lib/api";
import { relativeTime } from "@/lib/format";

const MAX_WORD_LEN = 100;

type Status = "loading" | "error" | "ready";

// WatchedWordsView is the moderator/admin watched-words list: add and remove
// instance-wide watched terms. Role-gated by RoleGate (an under-privileged/
// anonymous viewer sees the shared permission prompt and nothing fetches).
export function WatchedWordsView() {
  return (
    <RoleGate minRole="moderator" action="manage watched words">
      <WordsList />
    </RoleGate>
  );
}

function WordsList() {
  const [status, setStatus] = useState<Status>("loading");
  const [words, setWords] = useState<WatchedWord[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getWatchedWords({ limit: 100 }, controller.signal)
      .then((res) => {
        setWords(res.words);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [reloadKey]);

  const retry = useCallback(() => {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  }, []);

  const onAdded = useCallback((word: WatchedWord) => {
    setWords((prev) => [word, ...prev]);
  }, []);

  const onRemoved = useCallback((id: string) => {
    setWords((prev) => prev.filter((w) => w.id !== id));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <AddWordForm onAdded={onAdded} />

      {status === "loading" ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading watched words" />
        </div>
      ) : status === "error" ? (
        <ErrorState message="Could not load watched words." onRetry={retry} />
      ) : words.length === 0 ? (
        <EmptyState
          title="No watched words"
          message="Add a term above. Content containing a watched word can be flagged for review."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {words.map((w) => (
            <li key={w.id}>
              <WordRow word={w} onRemoved={onRemoved} />
            </li>
          ))}
        </ul>
      )}
    </div>
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
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-muted px-4 py-3">
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
