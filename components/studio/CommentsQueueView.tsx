"use client";

import Link from "next/link";
import { useState } from "react";

import { ListBoundary } from "@/components/admin/ListBoundary";
import { PagedListShell } from "@/components/admin/PagedListShell";
import { UserText } from "@/components/UserText";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { ManagedComment } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { usePagedList } from "@/lib/use-paged-list";

type View = "held" | "all";

// CommentsQueueView is the Studio review queue (core 0161): comments on every
// video the caller manages — channels they own or edit — through the shared
// paged-list seam. It opens on the comments a requires_approval video is
// holding for them; "All comments" widens it to everything on their videos.
export function CommentsQueueView() {
  return (
    <ListBoundary label="comments">
      <Queue />
    </ListBoundary>
  );
}

function Queue() {
  const list = usePagedList<ManagedComment>({
    filterKeys: ["view"],
    load: (query, signal) =>
      api
        .listManagedComments(
          {
            held: query.filters.view === "all" ? undefined : true,
            limit: query.limit,
            offset: query.offset,
          },
          signal,
        )
        .then((res) => ({ items: res.comments, total: res.total, limit: res.limit, offset: res.offset })),
  });
  const view: View = list.filters.view === "all" ? "all" : "held";
  // Outlives the reload a stale approval (409) triggers, which remounts rows.
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <PagedListShell
      list={list}
      noun="comment"
      toolbar={
        <>
          <SegmentedControl<View>
            label="Show"
            size="sm"
            value={view}
            onChange={(next) => list.setFilter("view", next === "all" ? "all" : undefined)}
            options={[
              { value: "held", label: "Awaiting approval" },
              { value: "all", label: "All comments" },
            ]}
          />
          {notice ? (
            <p role="status" className="text-sm text-fg">
              {notice}
            </p>
          ) : null}
        </>
      }
      errorMessage="Could not load comments."
      emptyTitle={view === "held" ? "Nothing awaiting approval" : "No comments yet"}
      emptyMessage={
        view === "held"
          ? "Comments on videos set to “Require approval” wait here for you."
          : "Comments on your videos will appear here."
      }
    >
      <ul className="flex flex-col gap-3">
        {list.items.map((c) => (
          <li key={c.id}>
            <QueueRow
              comment={c}
              // Released (approved) or rejected: either way it leaves the
              // "awaiting" view; in "All" an approved row stays, unheld.
              onApproved={(updated) =>
                view === "held"
                  ? list.drop((x) => x.id !== c.id)
                  : list.patch((items) => items.map((x) => (x.id === c.id ? { ...x, ...updated } : x)))
              }
              onRejected={() => list.drop((x) => x.id !== c.id)}
              onChanged={() => {
                setNotice("A comment changed since you loaded it. Review it again.");
                list.reload();
              }}
            />
          </li>
        ))}
      </ul>
    </PagedListShell>
  );
}

function QueueRow({
  comment,
  onApproved,
  onRejected,
  onChanged,
}: {
  comment: ManagedComment;
  onApproved: (updated: Partial<ManagedComment>) => void;
  onRejected: () => void;
  // The comment was edited since the queue loaded (409): reload it.
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>, fallback: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) onChanged();
      else setError(errorMessage(err, fallback));
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
        {comment.held_for_review ? <Badge variant="warning">Pending approval</Badge> : null}
      </div>

      <UserText variant="comment" text={comment.body} timestamps={false} className="mt-2 text-sm text-fg" />

      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}

      {comment.held_for_review ? (
        <div className="mt-3 flex items-center gap-2">
          {confirming ? (
            <>
              <Button
                variant="danger"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api.deleteComment(comment.id);
                    onRejected();
                  }, "Could not reject this comment.")
                }
              >
                {busy ? "Rejecting…" : "Confirm reject"}
              </Button>
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    // Approve exactly the version shown (409 if edited since).
                    onApproved(await api.approveComment(comment.video_id, comment.id, comment.updated_at));
                    setBusy(false);
                  }, "Could not approve this comment.")
                }
              >
                Approve
              </Button>
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => setConfirming(true)}>
                Reject
              </Button>
            </>
          )}
        </div>
      ) : null}
    </article>
  );
}
