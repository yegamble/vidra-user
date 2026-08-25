"use client";

import Link from "next/link";
import { useState } from "react";

import { ListBoundary } from "@/components/admin/ListBoundary";
import { ListSearch } from "@/components/admin/ListToolbar";
import { PagedListShell } from "@/components/admin/PagedListShell";
import { RoleGate } from "@/components/RoleGate";
import { Button } from "@/components/ui/Button";
import { api, errorMessage } from "@/lib/api";
import type { AdminComment } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { usePagedList } from "@/lib/use-paged-list";

// AdminCommentsView is the moderator/admin comments overview: browse every
// comment and delete any of them. Role-gated by RoleGate (an under-privileged/
// anonymous viewer sees the shared permission prompt and nothing fetches).
export function AdminCommentsView() {
  return (
    <RoleGate minRole="moderator" action="review comments">
      <ListBoundary label="comments">
        <CommentsList />
      </ListBoundary>
    </RoleGate>
  );
}

function CommentsList() {
  const list = usePagedList<AdminComment>({
    filterKeys: ["q"],
    load: (query, signal) =>
      api
        .getAdminComments(
          { q: query.filters.q, limit: query.limit, offset: query.offset },
          signal,
        )
        .then((res) => ({
          items: res.comments,
          total: res.total,
          limit: res.limit,
          offset: res.offset,
        })),
  });
  const searched = Boolean(list.filters.q);

  return (
    <PagedListShell
      list={list}
      noun="comment"
      toolbar={
        <ListSearch
          label="Search comments"
          placeholder="Search by text"
          value={list.filters.q ?? ""}
          onSubmit={(next) => list.setFilter("q", next)}
        />
      }
      errorMessage="Could not load comments."
      emptyTitle={searched ? "No matching comments" : "No comments yet"}
      emptyMessage={
        searched
          ? "Try a different search term."
          : "Comments will appear here as viewers post them."
      }
    >
      <ul className="flex flex-col gap-3">
        {list.items.map((c) => (
          <li key={c.id}>
            <CommentRow comment={c} onDeleted={(id) => list.drop((x) => x.id !== id)} />
          </li>
        ))}
      </ul>
    </PagedListShell>
  );
}

function CommentRow({
  comment,
  onDeleted,
}: {
  comment: AdminComment;
  onDeleted: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteComment(comment.id);
      onDeleted(comment.id);
    } catch (err) {
      setError(errorMessage(err, "Could not delete this comment."));
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <article className="rounded-2xl border border-border-subtle bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
        <span className="font-semibold text-fg">
          {comment.author_display_name || comment.author_username}
        </span>
        <span aria-hidden>·</span>
        <span>{relativeTime(comment.created_at)}</span>
        <span aria-hidden>·</span>
        <span>
          on{" "}
          <Link
            href={`/videos/${comment.video_id}`}
            className="focus-ring rounded underline underline-offset-2 transition-colors hover:text-fg"
          >
            {comment.video_title || "a video"}
          </Link>
        </span>
      </div>

      <p className="mt-2 text-sm whitespace-pre-wrap text-fg">{comment.body}</p>

      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}

      <div className="mt-3 flex items-center gap-2">
        {confirming ? (
          <>
            <Button
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? "Deleting…" : "Confirm delete"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="focus-ring inline-flex items-center justify-center rounded-full border border-danger-border px-3.5 py-1.5 text-[13px] font-semibold text-danger transition-colors hover:bg-danger/10"
          >
            Delete
          </button>
        )}
      </div>
    </article>
  );
}
