"use client";

import Link from "next/link";
import { useState } from "react";

import { ListBoundary } from "@/components/admin/ListBoundary";
import { ListSearch } from "@/components/admin/ListToolbar";
import { PagedListShell } from "@/components/admin/PagedListShell";
import { useT } from "@/components/I18nProvider";
import { RoleGate } from "@/components/RoleGate";
import { UserText } from "@/components/UserText";
import { Badge } from "@/components/ui/Badge";
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
  const t = useT();
  const list = usePagedList<AdminComment>({
    filterKeys: ["q", "auto_tag"],
    load: (query, signal) =>
      api
        .getAdminComments(
          { q: query.filters.q, auto_tag: query.filters.auto_tag, limit: query.limit, offset: query.offset },
          signal,
        )
        .then((res) => ({
          items: res.comments,
          total: res.total,
          limit: res.limit,
          offset: res.offset,
        })),
  });
  const searched = Boolean(list.filters.q || list.filters.auto_tag);
  const [notice, setNotice] = useState<string | null>(null);

  function onBulkRemoved(account: string, removed: number) {
    setNotice(
      `Removed ${removed} ${removed === 1 ? "comment" : "comments"} by @${account} (replies to them were removed too).`,
    );
    list.reload();
  }

  return (
    <PagedListShell
      list={list}
      noun="comment"
      toolbar={
        <>
          <ListSearch
            label="Search comments"
            placeholder="Search by text"
            value={list.filters.q ?? ""}
            onSubmit={(next) => list.setFilter("q", next)}
          />
          <ListSearch
            label={t("admin.comments.autoTag.label")}
            placeholder={t("admin.comments.autoTag.placeholder")}
            value={list.filters.auto_tag ?? ""}
            submitLabel={t("admin.comments.autoTag.submit")}
            clearLabel={t("admin.comments.autoTag.clear")}
            onSubmit={(next) => list.setFilter("auto_tag", next)}
          />
          {notice ? (
            <p role="status" className="text-sm text-fg">
              {notice}
            </p>
          ) : null}
        </>
      }
      errorMessage="Could not load comments."
      emptyTitle={searched ? "No matching comments" : "No comments yet"}
      emptyMessage={
        searched
          ? list.filters.auto_tag && !list.filters.q
            ? t("admin.comments.autoTag.empty")
            : "Try a different search term."
          : "Comments will appear here as viewers post them."
      }
    >
      <ul className="flex flex-col gap-3">
        {list.items.map((c) => (
          <li key={c.id}>
            <CommentRow
              comment={c}
              onDeleted={(id) => list.drop((x) => x.id !== id)}
              onBulkRemoved={onBulkRemoved}
            />
          </li>
        ))}
      </ul>
    </PagedListShell>
  );
}

function CommentRow({
  comment,
  onDeleted,
  onBulkRemoved,
}: {
  comment: AdminComment;
  onDeleted: (id: string) => void;
  onBulkRemoved: (account: string, removed: number) => void;
}) {
  // Bulk removal targets a LOCAL username; a remote author's comment carries no
  // actor URL in the list payload, so it gets no bulk action.
  const t = useT();
  const bulkAccount =
    !comment.remote && comment.author_username ? comment.author_username : null;
  const [bulkConfirming, setBulkConfirming] = useState(false);
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

  async function removeAll() {
    if (busy || !bulkAccount) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.bulkRemoveAdminComments(bulkAccount);
      onBulkRemoved(bulkAccount, res.removed);
    } catch (err) {
      setError(errorMessage(err, "Could not remove this account's comments."));
      setBusy(false);
      setBulkConfirming(false);
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

      <UserText variant="comment" text={comment.body} timestamps={false} className="mt-2 text-sm text-fg" />

      {comment.automatic_tags?.length ? (
        <ul aria-label={t("admin.comments.autoTag.listLabel")} className="mt-2 flex flex-wrap gap-1.5">
          {comment.automatic_tags.map((tag) => (
            <li key={tag}>
              <Badge>{tag}</Badge>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}

      <div className="mt-3 flex items-center gap-2">
        {bulkConfirming && bulkAccount ? (
          <>
            <span className="text-[13px] text-fg">
              Delete every comment by @{bulkAccount} on every video, and all replies to them?
            </span>
            <Button
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={() => void removeAll()}
            >
              {busy ? "Removing…" : "Confirm remove all"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => setBulkConfirming(false)}
            >
              Cancel
            </Button>
          </>
        ) : confirming ? (
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
        {bulkAccount && !confirming && !bulkConfirming ? (
          <button
            type="button"
            onClick={() => setBulkConfirming(true)}
            aria-label={`Remove all comments by @${bulkAccount}`}
            className="focus-ring inline-flex items-center justify-center rounded-full border border-danger-border px-3.5 py-1.5 text-[13px] font-semibold text-danger transition-colors hover:bg-danger/10"
          >
            Remove all by @{bulkAccount}
          </button>
        ) : null}
      </div>
    </article>
  );
}
