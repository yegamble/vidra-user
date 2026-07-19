"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AdminSearch } from "@/components/admin/AdminControls";
import { RoleGate } from "@/components/RoleGate";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { api, errorMessage } from "@/lib/api";
import type { AdminComment } from "@/lib/api";
import { relativeTime } from "@/lib/format";

type Status = "loading" | "error" | "ready";

// AdminCommentsView is the moderator/admin comments overview: browse every
// comment and delete any of them. Role-gated by RoleGate (an under-privileged/
// anonymous viewer sees the shared permission prompt and nothing fetches).
export function AdminCommentsView() {
  return (
    <RoleGate minRole="moderator" action="review comments">
      <CommentsList />
    </RoleGate>
  );
}

function CommentsList() {
  const [status, setStatus] = useState<Status>("loading");
  const [comments, setComments] = useState<AdminComment[]>([]);
  const [query, setQuery] = useState("");
  const [input, setInput] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getAdminComments({ q: query || undefined, limit: 100 }, controller.signal)
      .then((res) => {
        setComments(res.comments);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [query, reloadKey]);

  const retry = useCallback(() => {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  }, []);

  const submitSearch = useCallback(
    (next: string) => {
      if (next === query) return;
      setStatus("loading");
      setQuery(next);
    },
    [query],
  );

  // Drop a deleted comment from the list.
  const onDeleted = useCallback((id: string) => {
    setComments((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <AdminSearch
        label="Search comments"
        placeholder="Search by text"
        value={input}
        onChange={setInput}
        onSubmit={() => submitSearch(input.trim())}
        onClear={() => {
          setInput("");
          submitSearch("");
        }}
        hasQuery={Boolean(query)}
      />

      {status === "loading" ? (
        <div className="flex justify-center py-24">
          <Spinner label="Loading comments" />
        </div>
      ) : status === "error" ? (
        <ErrorState message="Could not load comments." onRetry={retry} />
      ) : comments.length === 0 ? (
        <EmptyState
          title={query ? "No matching comments" : "No comments yet"}
          message={query ? "Try a different search term." : "Comments will appear here as viewers post them."}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((c) => (
            <li key={c.id}>
              <CommentRow comment={c} onDeleted={onDeleted} />
            </li>
          ))}
        </ul>
      )}
    </div>
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
