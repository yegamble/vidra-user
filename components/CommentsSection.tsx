"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { ChevronDownIcon } from "@/components/icons";
import { StartEncryptedButton } from "@/components/e2ee/StartEncryptedButton";
import { MessageButton } from "@/components/MessageButton";
import { ProtocolBadge } from "@/components/ProtocolBadge";
import { ReportButton } from "@/components/ReportButton";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { api, errorMessage, userAvatarUrl } from "@/lib/api";
import type { Comment } from "@/lib/api";
import { buildCommentTree, replyMention } from "@/lib/comments";
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
export function CommentsSection({
  videoId,
  commentsEnabled = true,
}: {
  videoId: string;
  /**
   * The EFFECTIVE comment availability from the video detail payload
   * (config-parity W9: instance comments_enabled AND the video's
   * comments_policy). When false the composer is replaced by a quiet note;
   * existing comments keep rendering (reading stays open server-side too).
   */
  commentsEnabled?: boolean;
}) {
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
  // The same flat list keyed by id: `CommentItem` resolves each reply's target
  // handle from it (via `replyMention`) so the replied-to author is derived, not
  // fetched — no backend field, no fabrication when the parent isn't loaded.
  const byId = new Map(comments.map((c) => [c.id, c] as const));

  return (
    <section aria-label="Comments" className="flex flex-col gap-4">
      <h2 className="text-[15px] font-bold tracking-tight">
        {status === "ready" ? `Comments (${comments.length})` : "Comments"}
      </h2>

      {commentsEnabled ? (
        <CommentForm videoId={videoId} onPosted={onPosted} />
      ) : (
        <p className="rounded-2xl bg-surface-muted px-4 py-3 text-sm text-fg-muted">
          Comments are turned off for this video.
        </p>
      )}

      {status === "loading" ? (
        <div className="flex justify-center py-8">
          <Spinner label="Loading comments" />
        </div>
      ) : status === "error" ? (
        <ErrorState message="Could not load comments." onRetry={retry} />
      ) : comments.length === 0 ? (
        <p className="text-sm text-fg-muted">
          No comments yet. Be the first to comment.
        </p>
      ) : (
        <ul className="flex flex-col gap-5">
          {threads.map(({ root, replies }) => (
            <CommentItem
              key={root.id}
              comment={root}
              replies={replies}
              byId={byId}
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
      <p className="text-sm text-fg-muted">
        <Link
          href="/login"
          className="focus-ring rounded font-semibold text-fg underline hover:no-underline"
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
      setError(errorMessage(err, "Could not post your comment."));
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
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={busy || body.trim() === ""}>
          Post
        </Button>
      </div>
    </form>
  );
}

// ReplyComposer posts a reply to `parentId` on the same video. It only renders
// for an authenticated viewer (the Reply control shows a sign-in prompt to
// anonymous viewers instead), so it always sends a `parent_id`. A visible,
// non-editable "Replying to @username" chip names the target (never prefilled
// into the textarea the user would have to delete); the textarea's accessible
// name carries the same target so the change is announced without a live region.
function ReplyComposer({
  videoId,
  parentId,
  parentUsername,
  onReplied,
  onCancel,
}: {
  videoId: string;
  parentId: string;
  parentUsername?: string;
  onReplied: (c: Comment) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chipId = useId();
  // A tombstoned/absent parent has no handle to show — the composer names it
  // neutrally rather than rendering a broken "@". (In practice the Reply control
  // is absent on a tombstone, so this is a defensive fallback.)
  const target = parentUsername ? `@${parentUsername}` : "a deleted comment";
  const replyLabel = `Write a reply to ${target}`;

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
      setError(errorMessage(err, "Could not post your reply."));
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
      <span
        id={chipId}
        className="inline-flex w-fit items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-fg-muted"
      >
        {parentUsername ? (
          <>
            Replying to <span className="font-semibold text-fg">@{parentUsername}</span>
          </>
        ) : (
          "Replying to a deleted comment"
        )}
      </span>
      <Textarea
        aria-label={replyLabel}
        aria-describedby={chipId}
        placeholder="Write a reply…"
        rows={2}
        maxLength={MAX_COMMENT_LEN}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        error={error ?? undefined}
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={busy || body.trim() === ""}>
          {busy ? "Posting…" : "Post reply"}
        </Button>
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
  byId,
  mentionUsername,
  videoId,
  onReplied,
  onDeleted,
  onEdited,
  onMutedAuthor,
  onMutedInstance,
}: {
  comment: Comment;
  replies: Comment[];
  // The whole loaded list keyed by id, so this item can resolve each of its
  // replies' target handles (via `replyMention`) as it renders them.
  byId: Map<string, Comment>;
  // The "@username" this comment (a reply) answers, when it targets another
  // reply — plain leading text; unset for a top-level comment or a direct reply.
  mentionUsername?: string;
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
  // Reply threads are collapsed by default (design): a "View N replies" toggle
  // reveals them. Posting a reply from this thread auto-expands it so the new
  // reply is visible.
  const [repliesOpen, setRepliesOpen] = useState(false);
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
      setEditError(errorMessage(err, "Could not save your edit."));
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

  // Posting a reply from within this thread reveals it (so the new reply is
  // seen) and appends to the shared flat list.
  function handleReplied(c: Comment) {
    onReplied(c);
    setRepliesOpen(true);
  }

  // Collapsed-by-default reply thread (design): a "View N replies" / "Hide
  // replies" toggle with a chevron that rotates when open, over the border-l
  // rail. Shared by the normal and tombstone renderings (replies survive a
  // tombstoned parent).
  const repliesBlock =
    replies.length > 0 ? (
      <div className="ml-[46px] flex flex-col gap-3">
        <button
          type="button"
          aria-expanded={repliesOpen}
          onClick={() => setRepliesOpen((v) => !v)}
          className="focus-ring flex w-fit items-center gap-1.5 rounded text-xs font-semibold text-fg-muted transition-colors hover:text-fg"
        >
          <ChevronDownIcon
            size={14}
            strokeWidth={2.4}
            className={repliesOpen ? "rotate-180 transition-transform" : "transition-transform"}
          />
          {repliesOpen
            ? "Hide replies"
            : replies.length === 1
              ? "View 1 reply"
              : `View ${replies.length} replies`}
        </button>
        {repliesOpen ? (
          <ul
            aria-label="Replies"
            className="flex flex-col gap-4 border-l-2 border-border-subtle pl-4"
          >
            {replies.map((r) => (
              <CommentItem
                key={r.id}
                comment={r}
                replies={[]}
                byId={byId}
                mentionUsername={replyMention(r, byId)?.username}
                videoId={videoId}
                onReplied={handleReplied}
                onDeleted={onDeleted}
                onEdited={onEdited}
                onMutedAuthor={onMutedAuthor}
                onMutedInstance={onMutedInstance}
              />
            ))}
          </ul>
        ) : null}
      </div>
    ) : null;

  // Tombstone (design): a comment whose author's account was permanently deleted
  // renders as a de-emphasised "[deleted]" placeholder — no controls — with its
  // reply thread preserved. fg-muted (not fg-subtle) keeps it AA-legible.
  if (comment.deleted) {
    return (
      <li className="flex flex-col gap-3">
        <div className="flex gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-surface-muted text-fg-subtle"
          >
            ·
          </span>
          <p className="pt-1 text-sm italic text-fg-muted">[deleted]</p>
        </div>
        {repliesBlock}
      </li>
    );
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
          className="mt-0.5 h-[34px] w-[34px] text-[13px]"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2 text-footnote">
            <span className="text-subhead font-semibold text-fg">
              {comment.author_display_name || comment.author_username}
            </span>
            {isRemote && comment.author_domain ? (
              // Origin badge: the author lives on another instance (no local
              // profile to link), plus the shared protocol label.
              <>
                <span
                  className="inline-flex max-w-full items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-fg-muted"
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
            {when ? <span className="text-fg-muted">{when}</span> : null}
            {comment.edited ? (
              <span className="text-xs text-fg-muted">(edited)</span>
            ) : null}
            <span className="ml-auto flex items-center gap-3">
              {!editing ? (
                <button
                  type="button"
                  aria-expanded={replying}
                  onClick={() => setReplying((v) => !v)}
                  className="focus-ring rounded text-xs font-semibold text-fg-muted transition-colors hover:text-fg"
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
                      className="focus-ring rounded text-xs font-semibold text-fg-muted transition-colors hover:text-fg disabled:opacity-60"
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
                    className="focus-ring rounded text-xs font-semibold text-fg-muted transition-colors hover:text-fg disabled:opacity-60"
                  >
                    {muting ? "Muting…" : "Mute"}
                  </button>
                  <MessageButton recipientId={authorId} />
                  <StartEncryptedButton recipientId={authorId} />
                  <button
                    type="button"
                    disabled={blocking || blocked}
                    onClick={() => void block()}
                    className="focus-ring rounded text-xs font-semibold text-fg-muted transition-colors hover:text-fg disabled:opacity-60"
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
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">
              {mentionUsername ? (
                // Leading "@username" naming the replied-to author (YouTube
                // parity) — plain non-link text in the same <p>, so it is part
                // of the reply's accessible content. It has no profile route
                // (username ≠ channel handle), matching the non-link author name.
                <span className="font-semibold text-fg">@{mentionUsername} </span>
              ) : null}
              {comment.body}
            </p>
          )}
        </div>
      </div>

      {/* Inline reply composer / sign-in prompt, aligned under the comment body. */}
      {replying ? (
        <div className="ml-[46px]">
          {status === "authed" ? (
            <ReplyComposer
              videoId={videoId}
              parentId={comment.id}
              parentUsername={comment.author_username}
              onReplied={handleReplied}
              onCancel={() => setReplying(false)}
            />
          ) : (
            <p className="text-sm text-fg-muted">
              <Link
                href="/login"
                className="focus-ring rounded font-semibold text-fg underline hover:no-underline"
              >
                Sign in
              </Link>{" "}
              to reply.
            </p>
          )}
        </div>
      ) : null}

      {/* Flattened replies (one visual level, PeerTube-style), collapsed behind
          the "View N replies" toggle. */}
      {repliesBlock}
    </li>
  );
}
