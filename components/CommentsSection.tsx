"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { MessageButton } from "@/components/MessageButton";
import { ReportButton } from "@/components/ReportButton";
import { Avatar } from "@/components/ui/Avatar";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api, userAvatarUrl } from "@/lib/api";
import type { Comment } from "@/lib/api";
import { relativeTime } from "@/lib/format";

const MAX_COMMENT_LEN = 2000;

type Status = "loading" | "error" | "ready";

// CommentsSection loads a public video's comments client-side and lets an
// authenticated viewer post and delete their own. Mutations update the in-memory
// list optimistically-on-success (the server is the source of truth: a new
// comment is prepended from the API response, a deleted one is filtered out).
export function CommentsSection({ videoId }: { videoId: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [comments, setComments] = useState<Comment[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getVideoComments(videoId, { limit: 100 }, controller.signal)
      .then((res) => {
        setComments(res.comments);
        setStatus("ready");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [videoId, reloadKey]);

  function retry() {
    setStatus("loading");
    setComments([]);
    setReloadKey((k) => k + 1);
  }

  return (
    <section aria-label="Comments" className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold tracking-tight">
        {status === "ready" ? `Comments (${comments.length})` : "Comments"}
      </h2>

      <CommentForm videoId={videoId} onPosted={(c) => setComments((prev) => [c, ...prev])} />

      {status === "loading" ? (
        <div className="flex justify-center py-8">
          <Spinner label="Loading comments" />
        </div>
      ) : status === "error" ? (
        <ErrorState message="Could not load comments." onRetry={retry} />
      ) : comments.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No comments yet. Be the first to comment.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              onDeleted={() => setComments((prev) => prev.filter((x) => x.id !== c.id))}
              onEdited={(updated) =>
                setComments((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
              }
              onMutedAuthor={(authorId) =>
                setComments((prev) => prev.filter((x) => x.author_id !== authorId))
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// CommentForm posts a new comment. Anonymous viewers see a sign-in prompt instead.
function CommentForm({
  videoId,
  onPosted,
}: {
  videoId: string;
  onPosted: (c: Comment) => void;
}) {
  const { status } = useSession();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status !== "authed") {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        <Link
          href="/login"
          className="font-medium text-zinc-900 underline hover:no-underline dark:text-zinc-100"
        >
          Sign in
        </Link>{" "}
        to leave a comment.
      </p>
    );
  }

  async function submit() {
    const trimmed = body.trim();
    if (trimmed === "") return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.postComment(videoId, trimmed);
      onPosted(created);
      setBody("");
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : "Could not post your comment.");
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
      <textarea
        aria-label="Add a comment"
        placeholder="Add a comment…"
        rows={3}
        maxLength={MAX_COMMENT_LEN}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={busy || body.trim() === ""}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Post
        </button>
      </div>
    </form>
  );
}

// CommentItem renders one comment. Its author gets Edit + Delete controls; any
// other signed-in viewer gets Mute (hide this account's comments) + Report.
function CommentItem({
  comment,
  onDeleted,
  onEdited,
  onMutedAuthor,
}: {
  comment: Comment;
  onDeleted: () => void;
  onEdited: (updated: Comment) => void;
  onMutedAuthor: (authorId: string) => void;
}) {
  const { user, status } = useSession();
  const [busy, setBusy] = useState(false);
  const [muting, setMuting] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const isAuthor = user?.username === comment.author_username;
  const when = relativeTime(comment.created_at);

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
      const updated = await api.editComment(comment.id, trimmed);
      onEdited(updated);
      setEditing(false);
    } catch (err: unknown) {
      setEditError(err instanceof ApiError ? err.message : "Could not save your edit.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.deleteComment(comment.id);
      onDeleted();
    } catch {
      // Leave the comment in place on failure.
      setBusy(false);
    }
  }

  async function mute() {
    setMuting(true);
    try {
      await api.muteAccount(comment.author_id);
      onMutedAuthor(comment.author_id);
    } catch {
      // Leave the comment in place on failure.
      setMuting(false);
    }
  }

  async function block() {
    setBlocking(true);
    try {
      await api.blockUser(comment.author_id);
      setBlocked(true); // a block doesn't hide content, so keep the comment; reflect the state
    } catch {
      // Leave things as-is on failure.
    } finally {
      setBlocking(false);
    }
  }

  return (
    <li className="flex gap-3">
      {/* Comments carry author_id, not a has_avatar flag: always point at the
          public avatar URL and let a 404 fall back to the initial-letter block
          via onError — the fixed-size block keeps the row layout stable. */}
      <Avatar
        src={userAvatarUrl(comment.author_id)}
        name={comment.author_display_name || comment.author_username}
        className="mt-0.5 h-8 w-8 text-sm"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium text-zinc-900 dark:text-zinc-100">
          {comment.author_display_name || comment.author_username}
        </span>
        {when ? <span className="text-zinc-500 dark:text-zinc-400">{when}</span> : null}
        {comment.edited ? (
          <span className="text-xs text-zinc-400 dark:text-zinc-500">(edited)</span>
        ) : null}
        {isAuthor ? (
          <span className="ml-auto flex items-center gap-3">
            {!editing ? (
              <button
                type="button"
                onClick={startEdit}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                Edit
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              className="text-xs font-medium text-zinc-500 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:text-zinc-400 dark:hover:text-red-400"
            >
              Delete
            </button>
          </span>
        ) : status === "authed" ? (
          <span className="ml-auto flex items-center gap-3">
            <button
              type="button"
              disabled={muting}
              onClick={() => void mute()}
              className="text-xs font-medium text-zinc-500 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              {muting ? "Muting…" : "Mute"}
            </button>
            <MessageButton recipientId={comment.author_id} />
            <button
              type="button"
              disabled={blocking || blocked}
              onClick={() => void block()}
              className="text-xs font-medium text-zinc-500 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              {blocked ? "Blocked" : blocking ? "Blocking…" : "Block"}
            </button>
            <ReportButton kind="account" targetId={comment.author_id} variant="link" />
            <ReportButton kind="comment" targetId={comment.id} variant="link" />
          </span>
        ) : null}
      </div>
      {editing ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void saveEdit();
          }}
        >
          <textarea
            aria-label="Edit comment"
            rows={3}
            maxLength={MAX_COMMENT_LEN}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          {editError ? <p className="text-sm text-red-600 dark:text-red-400">{editError}</p> : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || draft.trim() === ""}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      ) : (
        <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{comment.body}</p>
      )}
      </div>
    </li>
  );
}
