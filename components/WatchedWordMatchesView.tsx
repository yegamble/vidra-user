"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { ListBoundary } from "@/components/admin/ListBoundary";
import { PagedListShell } from "@/components/admin/PagedListShell";
import { FlagIcon } from "@/components/icons";
import { RoleGate } from "@/components/RoleGate";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  FilterChipGroup,
  type FilterChipOption,
} from "@/components/ui/FilterChips";
import { api, errorMessage } from "@/lib/api";
import type { WatchedWordMatch, WatchedWordMatchStatusFilter } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { usePagedList } from "@/lib/use-paged-list";

const MAX_NOTE_LEN = 2000;

const STATUS_OPTIONS: readonly FilterChipOption<WatchedWordMatchStatusFilter>[] =
  [
    { value: "open", label: "Open" },
    { value: "resolved", label: "Resolved" },
    { value: "dismissed", label: "Dismissed" },
    { value: "all", label: "All" },
  ];

// The SERVER defaults to open too, so the chip and the request agree without the
// client having to send anything.
const DEFAULT_STATUS: WatchedWordMatchStatusFilter = "open";

const EMPTY_COPY: Record<
  WatchedWordMatchStatusFilter,
  { title: string; message: string }
> = {
  open: {
    title: "Nothing waiting",
    message: "No flagged comment or video is waiting for review.",
  },
  resolved: {
    title: "Nothing resolved yet",
    message: "Flagged items you act on are kept here as a record.",
  },
  dismissed: {
    title: "Nothing dismissed yet",
    message: "Flagged items you judge to be false positives are kept here.",
  },
  all: {
    title: "No flagged content",
    message: "No comments or videos have matched a watched term yet.",
  },
};

/**
 * Split a flag-time snapshot into the text before the matched term, the term
 * itself, and the text after it.
 *
 * `offset`/`length` are counted in RUNES (Unicode code points) by the backend,
 * because a byte offset would cut a multi-byte character in half — so the slice
 * runs over `Array.from(text)`, not over the raw string, whose indices are
 * UTF-16 code units. `offset` is -1 when the backend could not locate the term
 * (every row backfilled by migration 0132, among others); the fallback is a
 * case-insensitive search for the term, and failing that, no highlight at all.
 * Highlighting the wrong span would be worse than highlighting nothing.
 */
export function splitSnapshot(
  text: string,
  offset: number,
  length: number,
  term: string,
): [string, string, string] {
  const chars = Array.from(text);
  let start = offset;
  let end = offset + length;
  if (start < 0 || length <= 0 || end > chars.length) {
    if (!term) return [text, "", ""];
    const found = text.toLowerCase().indexOf(term.toLowerCase());
    if (found < 0) return [text, "", ""];
    // indexOf works in UTF-16 units; convert to rune indices for the slice.
    start = Array.from(text.slice(0, found)).length;
    end = start + Array.from(term).length;
  }
  return [
    chars.slice(0, start).join(""),
    chars.slice(start, end).join(""),
    chars.slice(end).join(""),
  ];
}

// WatchedWordMatchesView is the moderator/admin review queue for content that
// matched a watched term — comments (type "comment") and videos (type "video"),
// each badged with what was flagged. Role-gated by RoleGate (an
// under-privileged/anonymous viewer sees the shared permission prompt and
// nothing fetches).
export function WatchedWordMatchesView() {
  return (
    <RoleGate minRole="moderator" action="review flagged content">
      <ListBoundary label="flagged content">
        <MatchesList />
      </ListBoundary>
    </RoleGate>
  );
}

function MatchesList() {
  const list = usePagedList<WatchedWordMatch>({
    filterKeys: ["status"],
    load: (query, signal) =>
      api
        .getWatchedWordMatches(
          {
            status:
              (query.filters.status as WatchedWordMatchStatusFilter) ??
              DEFAULT_STATUS,
            limit: query.limit,
            offset: query.offset,
          },
          signal,
        )
        .then((res) => ({
          items: res.matches,
          total: res.total,
          limit: res.limit,
          offset: res.offset,
        })),
  });

  const status =
    (list.filters.status as WatchedWordMatchStatusFilter) ?? DEFAULT_STATUS;
  const { patch, drop } = list;

  // The SERVER applies the filter, so `total` counts the matches matching it.
  // Under a single-state filter a row that has just been triaged is no longer
  // one of them and leaves the page and the count together — patching it in
  // place would leave the pager promising an open item that is not. Under "All"
  // the row stays, wearing its new state.
  const onTriaged = useCallback(
    (id: string, next: "resolved" | "dismissed") => {
      if (status === "all") {
        patch((rows) =>
          rows.map((m) => (m.id === id ? { ...m, status: next } : m)),
        );
      } else {
        drop((m) => m.id !== id);
      }
    },
    [drop, patch, status],
  );

  return (
    <PagedListShell
      list={list}
      noun="flagged item"
      toolbar={
        <FilterChipGroup<WatchedWordMatchStatusFilter>
          label="Filter flagged content"
          options={STATUS_OPTIONS}
          value={status}
          onChange={(next) =>
            list.setFilter("status", next === DEFAULT_STATUS ? "" : next)
          }
        />
      }
      errorMessage="Could not load flagged content."
      emptyIcon={<FlagIcon size={24} />}
      emptyTitle={EMPTY_COPY[status].title}
      emptyMessage={EMPTY_COPY[status].message}
    >
      <ul className="flex flex-col divide-y divide-border-subtle">
        {list.items.map((m) => (
          <li key={m.id}>
            <MatchRow match={m} onTriaged={onTriaged} />
          </li>
        ))}
      </ul>
    </PagedListShell>
  );
}

function MatchRow({
  match: m,
  onTriaged,
}: {
  match: WatchedWordMatch;
  onTriaged: (id: string, next: "resolved" | "dismissed") => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOpen = m.status === "open";
  const [before, hit, after] = splitSnapshot(
    m.matched_text,
    m.match_offset,
    m.match_length,
    m.word,
  );
  const targetLabel = m.type === "video" ? "video" : "comment";

  async function triage(next: "resolved" | "dismissed") {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.resolveWatchedWordMatch(m.id, {
        status: next,
        note: note.trim() || undefined,
      });
      onTriaged(m.id, next);
    } catch (err) {
      setError(errorMessage(err, "Could not update this flagged item."));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="warning">{m.word}</Badge>
        {/* What was flagged: a comment, or the video itself. */}
        <Badge className="capitalize">{m.type}</Badge>
        {m.status !== "open" ? (
          <Badge
            variant={m.status === "resolved" ? "success" : "strong"}
            className="capitalize"
          >
            {m.status}
          </Badge>
        ) : null}
        {!m.term_active ? (
          <Badge
            variant="strong"
            title="This term is no longer on the watched-words list"
          >
            Term removed
          </Badge>
        ) : null}
        <span className="text-sm text-fg-muted">
          by {m.author_username || "unknown"}
        </span>
        <Link
          href={`/videos/${m.video_id}`}
          className="focus-ring rounded-sm text-sm text-fg-muted underline transition-colors hover:text-fg"
        >
          {m.type === "video" ? m.video_title || "on video" : "on video"}
        </Link>
        <span className="text-[13px] text-fg-muted">
          {relativeTime(m.created_at)}
        </span>
      </div>

      {/* The SNAPSHOT — the text as it read when the flag was raised, with the
          term highlighted. This used to be a live join on the comment body, so
          an author who edited the term away left the queue quoting a clean body
          under the flag. */}
      <blockquote className="border-l-2 border-border pl-3 text-sm whitespace-pre-wrap text-fg-muted italic">
        {before}
        {hit ? (
          <mark className="rounded-sm bg-warning/25 px-0.5 text-fg not-italic">
            {hit}
          </mark>
        ) : null}
        {after}
      </blockquote>

      {m.snapshot_backfilled ? (
        <p className="text-footnote text-fg-muted">
          Reconstructed from the live {targetLabel} when snapshots were added,
          not captured when the flag was raised.
        </p>
      ) : null}

      {m.target_status === "edited_away" ? (
        <p className="text-footnote text-fg-muted">
          The live {targetLabel} no longer contains this term — it was edited
          after the flag.{" "}
          <Link
            href={`/videos/${m.video_id}`}
            className="focus-ring rounded-sm underline transition-colors hover:text-fg"
          >
            Open the {targetLabel}
          </Link>{" "}
          to see it as it reads now.
        </p>
      ) : null}

      {!isOpen && m.moderator_note ? (
        <p className="text-footnote text-fg-muted">
          <span className="font-semibold text-fg">Note:</span>{" "}
          {m.moderator_note}
        </p>
      ) : null}
      {!isOpen && m.resolved_by_username ? (
        <p className="text-footnote text-fg-muted">
          {m.status === "resolved" ? "Resolved" : "Dismissed"} by{" "}
          {m.resolved_by_username}
          {m.resolved_at ? ` ${relativeTime(m.resolved_at)}` : ""}
        </p>
      ) : null}

      {isOpen ? (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-fg-muted">
              Internal note (optional)
            </span>
            <textarea
              aria-label="Internal moderator note"
              rows={2}
              maxLength={MAX_NOTE_LEN}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="focus-ring w-full rounded-xl border border-border bg-surface px-3.5 py-2 text-sm text-fg placeholder:text-fg-muted"
            />
          </label>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void triage("resolved")}
            >
              Resolve
            </Button>
            <Button
              variant="tonal"
              size="sm"
              disabled={busy}
              onClick={() => void triage("dismissed")}
            >
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
