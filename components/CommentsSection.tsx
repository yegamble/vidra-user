"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { StartEncryptedButton } from "@/components/e2ee/StartEncryptedButton";
import { MessageButton } from "@/components/MessageButton";
import { ProtocolBadge } from "@/components/ProtocolBadge";
import { ReportButton } from "@/components/ReportButton";
import { Avatar } from "@/components/ui/Avatar";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api, userAvatarUrl } from "@/lib/api";
import type { Comment } from "@/lib/api";
import { buildCommentTree } from "@/lib/comments";
import { relativeTime } from "@/lib/format";

const MAX_COMMENT_LEN = 2000;

type Status = "loading" | "error" | "ready";

// CommentsSection loads a public video's comments client-side and lets an
// authenticated viewer post, reply, edit, and delete. The flat list the API
// returns is the source of truth; `buildCommentTree` turns it into PeerTube-style
// threads (top-level newest-first, replies flattened one level under their
// top-level ancestor, oldest-first). Every mutation edits the flat list and the
// tree is rebuilt on render: a new top-level comment is prepended, a reply is
// appended (the tree places it under its parent), an edit maps in place, a delete
// or mute filters out. Federated (remote-authored) comments render with the
// author-name snapshot, an origin-domain badge, and the ActivityPub protocol
// label; they have no local account, so the account controls (Message/Mute/Block/
// Report user) are replaced by Mute instance + Report comment.
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

  // Shared mutations over the flat list (work identically for a top-level comment
  // or a reply, since the tree is derived, not stored).
  const onPosted = (c: Comment) => setComments((prev) => [c, ...prev]);
  const onReplied = (c: Comment) => setComments((prev) => [...prev, c]);
  const onEdited = (updated: Comment) =>
    setComments((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
  const onDeleted = (id: string) => setComments((prev) => prev.filter((x) => x.id !== id));
  const onMutedAuthor = (authorId: string) =>
    setComments((prev) => prev.filter((x) => x.author_id !== authorId));
  // An instance mute hides ALL of that origin's comments for the caller.
  const onMutedInstance = (domain: string) =>
    setComments((prev) => prev.filter((x) => x.author_domain !== domain));

  const threads = buildCommentTree(comments);

  return (
    <section aria-label="Comments" className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold tracking-tight">
        {status === "ready" ? `Comments (${comments.length})` : "Comments"}
      </h2>

      <CommentForm videoId={videoId} onPosted={onPosted} />

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
          {threads.map(({ root, replies }) => (
            <CommentItem
              key={root.id}
              comment={root}
              replies={replies}
              videoId={videoId}
              onReplied={onReplied}
              onDeleted={onDeleted}
              onEdited={onEdited}
              onMutedAuthor={onMutedAuthor}
              onMutedInstance={onMutedInstance}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// CommentForm posts a new top-level comment. Anonymous viewers see a sign-in
// prompt instead.
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

// ReplyComposer posts a reply to `parentId` on the same video. It only renders
// for an authenticated viewer (the Reply control shows a sign-in prompt to
// anonymous viewers instead), so it always sends a `parent_id`.
function ReplyComposer({
  videoId,
  parentId,
  onReplied,
  onCancel,
}: {
  videoId: string;
  parentId: string;
  onReplied: (c: Comment) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmed = body.trim();
    if (trimmed === "" || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.postComment(videoId, trimmed, parentId);
      onReplied(created);
      setBody("");
      onCancel();
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : "Could not post your reply.");
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
        aria-label="Write a reply"
        placeholder="Write a reply…"
        rows={2}
        maxLength={MAX_COMMENT_LEN}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || body.trim() === ""}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {busy ? "Posting…" : "Post reply"}
        </button>
      </div>
    </form>
  );
}

// CommentItem renders one comment (top-level or reply) plus, for a top-level
// comment, its flattened list of replies. Every viewer gets a Reply control:
// authed → an inline reply composer; anonymous → the sign-in prompt. Its author
// gets Edit + Delete; any other signed-in viewer gets Mute (hide this account's
// comments) + Message + Block + Report. A remote-authored comment has no local
// account: it shows the origin badge and swaps the account controls for Mute
// instance + Report comment.
function CommentItem({
  comment,
  replies,
  videoId,
  onReplied,
  onDeleted,
  onEdited,
  onMutedAuthor,
  onMutedInstance,
}: {
  comment: Comment;
  replies: Comment[];
  videoId: string;
  onReplied: (c: Comment) => void;
  onDeleted: (id: string) => void;
  onEdited: (updated: Comment) => void;
  onMutedAuthor: (authorId: string) => void;
  onMutedInstance: (domain: string) => void;
}) {
  const { user, status } = useSession();
  const [busy, setBusy] = useState(false);
  const [muting, setMuting] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const isRemote = comment.remote === true;
  // The local author's account id; null on federated comments (no local account).
  const authorId = !isRemote && comment.author_id ? comment.author_id : null;
  // A remote author-name snapshot can collide with a local username — never
  // treat a remote comment as the viewer's own.
  const isAuthor = !isRemote && user?.username === comment.author_username;
  const when = relativeTime(comment.created_at);

  function startEdit() {
    setDraft(comment.body);
    setEditError(null);
    setReplying(false);
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
      onDeleted(comment.id);
    } catch {
      // Leave the comment in place on failure.
      setBusy(false);
    }
  }

  async function mute() {
    if (!authorId) return;
    setMuting(true);
    try {
      await api.muteAccount(authorId);
      onMutedAuthor(authorId);
    } catch {
      // Leave the comment in place on failure.
      setMuting(false);
    }
  }

  async function muteInstance() {
    if (!comment.author_domain) return;
    setMuting(true);
    try {
      await api.muteInstance(comment.author_domain);
      onMutedInstance(comment.author_domain);
    } catch {
      // Leave the comment in place on failure.
      setMuting(false);
    }
  }

  async function block() {
    if (!authorId) return;
    setBlocking(true);
    try {
      await api.blockUser(authorId);
      setBlocked(true); // a block doesn't hide content, so keep the comment; reflect the state
    } catch {
      // Leave things as-is on failure.
    } finally {
      setBlocking(false);
    }
  }

  return (
    <li className="flex flex-col gap-3">
      <div className="flex gap-3">
        {/* Local comments carry author_id, not a has_avatar flag: point at the
            public avatar URL and let a 404 fall back to the initial-letter block
            via onError — the fixed-size block keeps the row layout stable.
            Remote authors have no local account/avatar: initial-letter directly. */}
        <Avatar
          src={authorId ? userAvatarUrl(authorId) : null}
          name={comment.author_display_name || comment.author_username}
          className="mt-0.5 h-8 w-8 text-sm"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {comment.author_display_name || comment.author_username}
            </span>
            {isRemote && comment.author_domain ? (
              // Origin badge: the author lives on another instance (no local
              // profile to link), plus the shared protocol label.
              <>
                <span
                  className="inline-flex max-w-full items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  title={`Federated comment from ${comment.author_domain}`}
                >
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3 w-3 shrink-0"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  <span className="sr-only">From </span>
                  <span className="truncate">{comment.author_domain}</span>
                </span>
                <ProtocolBadge protocol="activitypub" />
              </>
            ) : null}
            {when ? <span className="text-zinc-500 dark:text-zinc-400">{when}</span> : null}
            {comment.edited ? (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">(edited)</span>
            ) : null}
            <span className="ml-auto flex items-center gap-3">
              {!editing ? (
                <button
                  type="button"
                  aria-expanded={replying}
                  onClick={() => setReplying((v) => !v)}
                  className="text-xs font-medium text-zinc-500 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  Reply
                </button>
              ) : null}
              {isAuthor ? (
                <>
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
                </>
              ) : status === "authed" && isRemote ? (
                // Remote author: no local account to message/mute/block/report —
                // the viewer can mute the whole origin instance or report the comment.
                <>
                  {comment.author_domain ? (
                    <button
                      type="button"
                      disabled={muting}
                      aria-label={`Mute instance ${comment.author_domain}`}
                      onClick={() => void muteInstance()}
                      className="text-xs font-medium text-zinc-500 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:text-zinc-400 dark:hover:text-zinc-100"
                    >
                      {muting ? "Muting…" : "Mute instance"}
                    </button>
                  ) : null}
                  <ReportButton kind="comment" targetId={comment.id} variant="link" />
                </>
              ) : status === "authed" && authorId ? (
                <>
                  <button
                    type="button"
                    disabled={muting}
                    onClick={() => void mute()}
                    className="text-xs font-medium text-zinc-500 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:text-zinc-400 dark:hover:text-zinc-100"
                  >
                    {muting ? "Muting…" : "Mute"}
                  </button>
                  <MessageButton recipientId={authorId} />
                  <StartEncryptedButton recipientId={authorId} />
                  <button
                    type="button"
                    disabled={blocking || blocked}
                    onClick={() => void block()}
                    className="text-xs font-medium text-zinc-500 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:text-zinc-400 dark:hover:text-zinc-100"
                  >
                    {blocked ? "Blocked" : blocking ? "Blocking…" : "Block"}
                  </button>
                  <ReportButton kind="account" targetId={authorId} variant="link" />
                  <ReportButton kind="comment" targetId={comment.id} variant="link" />
                </>
              ) : null}
            </span>
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
              {editError ? (
                <p className="text-sm text-red-600 dark:text-red-400">{editError}</p>
              ) : null}
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
            <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
              {comment.body}
            </p>
          )}
        </div>
      </div>

      {/* Inline reply composer / sign-in prompt, aligned under the comment body. */}
      {replying ? (
        <div className="ml-11">
          {status === "authed" ? (
            <ReplyComposer
              videoId={videoId}
              parentId={comment.id}
              onReplied={onReplied}
              onCancel={() => setReplying(false)}
            />
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              <Link
                href="/login"
                className="font-medium text-zinc-900 underline hover:no-underline dark:text-zinc-100"
              >
                Sign in
              </Link>{" "}
              to reply.
            </p>
          )}
        </div>
      ) : null}

      {/* Flattened replies (one visual level, PeerTube-style). */}
      {replies.length > 0 ? (
        <div className="ml-11 flex flex-col gap-3">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {replies.length === 1 ? "1 reply" : `${replies.length} replies`}
          </p>
          <ul
            aria-label="Replies"
            className="flex flex-col gap-3 border-l border-zinc-200 pl-4 dark:border-zinc-800"
          >
            {replies.map((r) => (
              <CommentItem
                key={r.id}
                comment={r}
                replies={[]}
                videoId={videoId}
                onReplied={onReplied}
                onDeleted={onDeleted}
                onEdited={onEdited}
                onMutedAuthor={onMutedAuthor}
                onMutedInstance={onMutedInstance}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}
