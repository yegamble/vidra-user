"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { RemoteCommentDeliveryBadge } from "@/components/RemoteCommentDeliveryBadge";
import { RemoteVideoThread } from "@/components/RemoteVideoThread";
import { Alert } from "@/components/ui/Alert";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { ApiError, api, errorMessage, userAvatarUrl } from "@/lib/api";
import type { AuthoredRemoteComment, RemoteVideoComment } from "@/lib/api";
import { FULL_LIST_LIMIT } from "@/lib/api/pagination";
import { relativeTime } from "@/lib/format";
import { useSettledSession } from "@/lib/use-settled-session";

const MAX_COMMENT_LEN = 2000;

type Status = "loading" | "error" | "ready";

// RemoteVideoComments is the comment surface for a FEDERATED video. It owns the
// single request that returns BOTH the mirrored origin thread (read-only,
// rendered by RemoteVideoThread) and the `authored` set — the comments LOCAL
// users have written here and this instance has federated to the origin
// (migration 0147: the home instance hosts and moderates them).
//
// A signed-in viewer can author, edit and delete their own comment; each
// authored comment wears a delivery-state badge reporting whether the
// Create/Update/Delete{Note} reached the origin. The comment is hosted and
// shown here regardless of that federation status — the badge never gates the
// content, only reports it.
//
// The mirrored thread and the authored set are kept visually distinct: they
// live under different headings ("Replies from this instance" vs "Comments from
// the origin"), and only authored rows carry the delivery badge.
//
// The fetch waits for the session to settle (useSettledSession): both arrays
// are filtered for the CALLER's mutes/blocks, and firing before the token is
// restored would ask the server anonymously and leak past the viewer's own
// filters — the class of bug that seam exists to close.
export function RemoteVideoComments({ videoId, domain }: { videoId: string; domain: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [mirrored, setMirrored] = useState<RemoteVideoComment[]>([]);
  const [authored, setAuthored] = useState<AuthoredRemoteComment[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const { settled, viewerKey } = useSettledSession();

  useEffect(() => {
    if (!settled) return;
    const controller = new AbortController();
    api
      .getRemoteVideoComments(videoId, { limit: FULL_LIST_LIMIT }, controller.signal)
      .then((res) => {
        setMirrored(res.comments);
        setAuthored(res.authored);
        setStatus("ready");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [videoId, reloadKey, settled, viewerKey]);

  function retry() {
    setStatus("loading");
    setMirrored([]);
    setAuthored([]);
    setReloadKey((k) => k + 1);
  }

  // Mutations over the authored set. A new comment is prepended (newest-first),
  // an edit maps in place, a delete filters out — the mirrored thread is never
  // touched by these (this instance never mirrors a comment it authored).
  const onPosted = (c: AuthoredRemoteComment) => setAuthored((prev) => [c, ...prev]);
  const onEdited = (updated: AuthoredRemoteComment) =>
    setAuthored((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
  const onDeleted = (id: string) => setAuthored((prev) => prev.filter((x) => x.id !== id));

  return (
    <section aria-label="Comments" className="flex flex-col gap-4">
      <RemoteCommentForm videoId={videoId} domain={domain} onPosted={onPosted} />

      {status === "loading" ? (
        <div className="flex justify-center py-8">
          <Spinner label="Loading comments" />
        </div>
      ) : status === "error" ? (
        <ErrorState message="Could not load the comments for this video." onRetry={retry} />
      ) : (
        <>
          {authored.length > 0 ? (
            <section
              aria-labelledby="authored-remote-heading"
              className="flex flex-col gap-3"
            >
              <h2
                id="authored-remote-heading"
                className="text-[15px] font-bold tracking-[-0.01em]"
              >
                Replies from this instance
              </h2>
              <ul className="flex flex-col divide-y divide-border-subtle">
                {authored.map((comment) => (
                  <AuthoredCommentItem
                    key={comment.id}
                    comment={comment}
                    onEdited={onEdited}
                    onDeleted={onDeleted}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          <RemoteVideoThread comments={mirrored} />
        </>
      )}
    </section>
  );
}

// RemoteCommentForm authors a new comment on the remote video. Anonymous
// viewers get a sign-in prompt (no composer). The server is the authority on
// whether authoring is allowed: a 403 (comments disabled on this instance) is
// surfaced inline rather than pre-guessed, since a remote video carries no
// comments-enabled flag.
function RemoteCommentForm({
  videoId,
  domain,
  onPosted,
}: {
  videoId: string;
  domain: string;
  onPosted: (c: AuthoredRemoteComment) => void;
}) {
  const { status } = useSession();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status !== "authed") {
    return (
      <p className="text-sm text-fg-muted">
        <Link
          href="/login"
          className="focus-ring rounded font-semibold text-fg underline hover:no-underline"
        >
          Sign in
        </Link>{" "}
        to reply to this federated video. Your reply is hosted here and sent to {domain}.
      </p>
    );
  }

  async function submit() {
    const trimmed = body.trim();
    if (trimmed === "" || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.createRemoteVideoComment(videoId, trimmed);
      onPosted(created);
      setBody("");
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 403) {
        setError("New comments are turned off on this instance.");
      } else {
        setError(errorMessage(err, "Could not post your comment."));
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
      <Textarea
        aria-label="Add a comment"
        placeholder="Add a comment…"
        rows={3}
        maxLength={MAX_COMMENT_LEN}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        error={error ?? undefined}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-fg-muted">
          Hosted here and sent to {domain}.
        </p>
        <Button type="submit" size="sm" disabled={busy || body.trim() === ""}>
          {busy ? "Posting…" : "Post"}
        </Button>
      </div>
    </form>
  );
}

// AuthoredCommentItem renders one locally-authored comment on the remote video,
// with its delivery-state badge. Its author gets Edit + Delete; a moderator/
// admin gets Delete (the home instance owns moderation — the ruling). The server
// re-checks both, so this gating never hides a control the server would accept
// from someone else.
function AuthoredCommentItem({
  comment,
  onEdited,
  onDeleted,
}: {
  comment: AuthoredRemoteComment;
  onEdited: (updated: AuthoredRemoteComment) => void;
  onDeleted: (id: string) => void;
}) {
  const { user } = useSession();
  const isAuthor = user?.id === comment.author_id;
  const isModerator = user?.role === "moderator" || user?.role === "admin";
  const canDelete = isAuthor || isModerator;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function startEdit() {
    setDraft(comment.body);
    setEditError(null);
    setEditing(true);
  }

  async function saveEdit() {
    const trimmed = draft.trim();
    if (trimmed === "" || saving) return;
    setSaving(true);
    setEditError(null);
    try {
      const updated = await api.updateRemoteVideoComment(comment.id, trimmed);
      onEdited(updated);
      setEditing(false);
    } catch (err: unknown) {
      setEditError(errorMessage(err, "Could not save your edit."));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setDeleteError(null);
    try {
      await api.deleteRemoteVideoComment(comment.id);
      onDeleted(comment.id);
    } catch (err: unknown) {
      // Keep the comment until deletion is confirmed; retry is explicit.
      setDeleteError(errorMessage(err, "Could not delete this comment. Please try again."));
      setBusy(false);
    }
  }

  const when = relativeTime(comment.created_at);

  return (
    <li className="flex gap-3 py-3">
      <Avatar
        src={userAvatarUrl(comment.author_id)}
        name={comment.author_display_name || comment.author_username}
        className="mt-0.5 h-[34px] w-[34px] text-[13px]"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          <span className="font-semibold text-fg">
            {comment.author_display_name || comment.author_username}
          </span>
          {when ? <span className="text-fg-muted">{when}</span> : null}
          {comment.edited ? <span className="text-fg-muted">(edited)</span> : null}
          <RemoteCommentDeliveryBadge
            state={comment.delivery_state}
            lastError={comment.last_error}
            className="ml-auto"
          />
        </div>

        {editing ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void saveEdit();
            }}
          >
            <Textarea
              aria-label="Edit comment"
              rows={3}
              maxLength={MAX_COMMENT_LEN}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              error={editError ?? undefined}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={saving || draft.trim() === ""}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">{comment.body}</p>
        )}

        {/* On a failed delivery, name the reason in words too (not only the
            badge's title) so it is legible without a hover / to AT. */}
        {comment.delivery_state === "failed" && comment.last_error && !editing ? (
          <p className="text-[13px] text-danger">
            Delivery to the origin failed: {comment.last_error}
          </p>
        ) : null}

        {deleteError ? <Alert>{deleteError}</Alert> : null}

        {canDelete && !editing ? (
          <div className="flex items-center gap-3">
            {isAuthor ? (
              <button
                type="button"
                onClick={startEdit}
                className="focus-ring rounded text-xs font-semibold text-fg-muted transition-colors hover:text-fg"
              >
                Edit
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              className="focus-ring rounded text-xs font-semibold text-fg-muted transition-colors hover:text-danger disabled:opacity-60"
            >
              Delete
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}
