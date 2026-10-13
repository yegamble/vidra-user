"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LoadMoreButton } from "@/components/ui/LoadMoreButton";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { ApiError, adminWatchedWordLists, errorMessage, myWatchedWordLists } from "@/lib/api";
import type { WatchedWordList, WatchedWordListAction } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAppendingList } from "@/lib/use-appending-list";
import { useAsyncAction } from "@/lib/use-async-action";

const MAX_WORDS = 500;
const MAX_WORD_LEN = 100;
const MAX_NAME_LEN = 100;

/** `admin` = instance lists (moderators); `me` = a creator's own lists. */
export type WordListScope = "admin" | "me";

const ENDPOINTS = { admin: adminWatchedWordLists, me: myWatchedWordLists } as const;

const ACTION_LABEL: Record<WatchedWordListAction, string> = {
  flag: "Flag for review",
  hold: "Hold for approval",
};

/** One term per line; blank lines dropped. The server also de-duplicates. */
export function parseWords(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((w) => w.trim())
    .filter((w) => w !== "");
}

function wordsError(words: string[]): string | null {
  if (words.length > MAX_WORDS) return `At most ${MAX_WORDS} words per list.`;
  if (words.some((w) => w.length > MAX_WORD_LEN)) return `Each word must be at most ${MAX_WORD_LEN} characters.`;
  return null;
}

const mapConflict = (err: unknown) =>
  err instanceof ApiError && err.status === 409 ? (err.message || "A list with that name already exists.") : null;

// WordListsManager — named watched-word lists. A list is a name, a set of terms
// and an action: "flag" records a match for review, "hold" ALSO parks the comment
// in the held-for-review queue until a manager approves it. The same component
// serves both scopes (the admin's instance lists and a creator's own lists), so
// the two surfaces cannot drift.
export function WordListsManager({ scope }: { scope: WordListScope }) {
  const api = ENDPOINTS[scope];
  const list = useAppendingList<WatchedWordList>({
    queryKey: `word-lists:${scope}`,
    getId: (l) => l.id,
    load: (window, signal) =>
      api.list({ limit: window.limit, offset: window.offset }, signal).then((res) => ({
        items: res.lists,
        total: res.total,
      })),
  });

  return (
    <section aria-labelledby={`word-lists-${scope}`} className={cn("flex flex-col gap-4", scope === "admin" && "mt-10")}>
      <div>
        <h2 id={`word-lists-${scope}`} className="text-headline text-fg">
          Word lists
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          {scope === "admin"
            ? "Named lists of terms, applied to every comment. A list can hold matching comments for approval."
            : "Named lists of terms, applied to comments on your videos. A list can hold matching comments in your comment queue."}
        </p>
      </div>
      <CreateListForm
        scope={scope}
        onCreated={(created) => {
          list.prepend(created);
        }}
      />
      {list.status === "loading" ? <Spinner label="Loading word lists" /> : null}
      {list.status === "error" ? (
        <div className="flex items-center gap-3 text-sm text-danger">
          <p>Could not load word lists.</p>
          <Button variant="ghost" size="sm" onClick={list.reload}>
            Retry
          </Button>
        </div>
      ) : null}
      {list.status === "ready" && list.items.length === 0 ? (
        <p className="text-sm text-fg-muted">No word lists yet.</p>
      ) : null}
      {list.status === "ready" ? (
        <ul className="flex flex-col gap-2">
          {list.items.map((l) => (
            <li key={l.id}>
              <ListRow
                scope={scope}
                item={l}
                onSaved={(saved) => list.patch((items) => items.map((x) => (x.id === saved.id ? saved : x)))}
                onDeleted={(id) => list.drop((x) => x.id !== id)}
              />
            </li>
          ))}
        </ul>
      ) : null}
      {list.hasMore ? <LoadMoreButton busy={list.moreStatus === "loading"} error={list.moreStatus === "error" ? "Could not load more lists." : null} onClick={list.loadMore} /> : null}
    </section>
  );
}

function CreateListForm({ scope, onCreated }: { scope: WordListScope; onCreated: (l: WatchedWordList) => void }) {
  const [name, setName] = useState("");
  const [action, setAction] = useState<WatchedWordListAction>("flag");
  const [text, setText] = useState("");
  const { run, busy, error, setError } = useAsyncAction(
    async (words: string[]) => {
      const created = await ENDPOINTS[scope].create({ name: name.trim(), action, words });
      onCreated(created);
      setName("");
      setText("");
      setAction("flag");
    },
    "Could not create this list.",
    mapConflict,
  );

  return (
    <form
      className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const words = parseWords(text);
        const problem = wordsError(words);
        if (problem) return setError(problem);
        if (name.trim() === "" || busy) return;
        void run(words);
      }}
    >
      <Input
        label="New list name"
        maxLength={MAX_NAME_LEN}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Select label="When a comment matches" value={action} onChange={(e) => setAction(e.target.value as WatchedWordListAction)}>
        <option value="flag">{ACTION_LABEL.flag}</option>
        <option value="hold">{ACTION_LABEL.hold}</option>
      </Select>
      <Textarea
        label="Words for the new list"
        hint="One word or phrase per line."
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div>
        <Button type="submit" disabled={busy || name.trim() === ""}>
          {busy ? "Creating…" : "Create list"}
        </Button>
      </div>
    </form>
  );
}

function ListRow({
  scope,
  item,
  onSaved,
  onDeleted,
}: {
  scope: WordListScope;
  item: WatchedWordList;
  onSaved: (l: WatchedWordList) => void;
  onDeleted: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-fg">{item.name}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
            <Badge variant={item.action === "hold" ? "warning" : "neutral"}>{ACTION_LABEL[item.action]}</Badge>
            {item.is_default ? <Badge variant="neutral">Default</Badge> : null}
            <span>{item.word_count === 1 ? "1 word" : `${item.word_count} words`}</span>
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          aria-expanded={open}
          aria-label={`${open ? "Close" : "Edit"} list ${item.name}`}
          onClick={() => setOpen((v) => !v)}
          className="shrink-0"
        >
          {open ? "Close" : "Edit"}
        </Button>
      </div>
      {open ? (
        <ListEditor
          scope={scope}
          item={item}
          onSaved={(saved) => {
            onSaved(saved);
            setOpen(false);
          }}
          onDeleted={onDeleted}
        />
      ) : null}
    </div>
  );
}

function ListEditor({
  scope,
  item,
  onSaved,
  onDeleted,
}: {
  scope: WordListScope;
  item: WatchedWordList;
  onSaved: (l: WatchedWordList) => void;
  onDeleted: (id: string) => void;
}) {
  const api = ENDPOINTS[scope];
  const [name, setName] = useState(item.name);
  const [action, setAction] = useState<WatchedWordListAction>(item.action);
  const [text, setText] = useState("");
  // The page rows carry a count, not the terms: fetch them once on open. The
  // default list's terms are never sent (they are paged on the page above).
  const [loaded, setLoaded] = useState(item.is_default);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    if (item.is_default) return;
    const controller = new AbortController();
    api
      .get(item.id, controller.signal)
      .then((full) => {
        setText((full.words ?? []).join("\n"));
        setLoaded(true);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setLoadError(errorMessage(err, "Could not load this list."));
      });
    return () => controller.abort();
  }, [api, item.id, item.is_default]);

  const save = useAsyncAction(
    async () => {
      const words = parseWords(text);
      const problem = item.is_default ? null : wordsError(words);
      if (problem) throw new Error(problem);
      onSaved(
        await api.update(item.id, {
          name: name.trim(),
          action,
          ...(item.is_default ? {} : { words }),
        }),
      );
    },
    "Could not save this list.",
    mapConflict,
  );
  const remove = useAsyncAction(
    async () => {
      await api.remove(item.id);
      onDeleted(item.id);
    },
    "Could not delete this list.",
  );

  return (
    <form
      className="mt-3 flex flex-col gap-3 border-t border-border-subtle pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!save.busy && loaded && name.trim() !== "") void save.run();
      }}
    >
      <Input label="List name" maxLength={MAX_NAME_LEN} value={name} onChange={(e) => setName(e.target.value)} />
      <Select label="Action on a match" value={action} onChange={(e) => setAction(e.target.value as WatchedWordListAction)}>
        <option value="flag">{ACTION_LABEL.flag}</option>
        <option value="hold">{ACTION_LABEL.hold}</option>
      </Select>
      {item.is_default ? (
        <p className="text-sm text-fg-muted">The words of the default list are managed one at a time in the list above.</p>
      ) : (
        <Textarea
          label="Words in this list"
          hint="One word or phrase per line. Saving replaces the list's words."
          rows={6}
          disabled={!loaded}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      )}
      {loadError ? <p className="text-sm text-danger">{loadError}</p> : null}
      {save.error ? <p className="text-sm text-danger">{save.error}</p> : null}
      {remove.error ? <p className="text-sm text-danger">{remove.error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={save.busy || !loaded || name.trim() === ""}>
          {save.busy ? "Saving…" : "Save list"}
        </Button>
        {item.is_default ? null : (
          <Button
            type="button"
            variant="danger-outline"
            disabled={remove.busy}
            aria-label={`Delete list ${item.name}`}
            onClick={() => void remove.run()}
          >
            Delete list
          </Button>
        )}
      </div>
    </form>
  );
}
