"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { EncryptedThreadView } from "@/components/e2ee/EncryptedThreadView";
import { LinkPreviewCard } from "@/components/messaging/LinkPreviewCard";
import { MessageAttachments } from "@/components/messaging/MessageAttachments";
import { ReportButton } from "@/components/ReportButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { EncryptedMessage, Message } from "@/lib/api";
import { formatBytes, relativeTime } from "@/lib/format";

const MAX_MESSAGE_LEN = 5000;
const MAX_ATTACHMENTS = 4;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MiB, matching the backend cap.

type Status = "loading" | "error" | "ready";

// A file is allowed if it is an image, video, audio clip, or PDF (the backend
// attachment allowlist). Checked client-side for an instant error; the backend
// re-checks (415) authoritatively.
function isAllowedAttachment(file: File): boolean {
  const t = file.type;
  return (
    t.startsWith("image/") || t.startsWith("video/") || t.startsWith("audio/") || t === "application/pdf"
  );
}

// ConversationView renders a single 1:1 thread: the messages (oldest → newest,
// chat-style) plus a compose box. A non-participant or unknown conversation is a
// 404 from the backend, which we surface as a "conversation not found" state.
export function ConversationView({
  conversationId,
  recipientHint,
}: {
  conversationId: string;
  recipientHint?: string;
}) {
  const { status } = useSession();

  if (status !== "authed") {
    return (
      <EmptyState
        title="Sign in to see this conversation"
        message={
          <>
            <Link href="/login" className="underline hover:text-zinc-700 dark:hover:text-zinc-200">
              Sign in
            </Link>{" "}
            to read and send direct messages.
          </>
        }
      />
    );
  }

  return <Thread conversationId={conversationId} recipientHint={recipientHint} />;
}

function Thread({
  conversationId,
  recipientHint,
}: {
  conversationId: string;
  recipientHint?: string;
}) {
  const { user } = useSession();
  const [status, setStatus] = useState<Status>("loading");
  const [notFound, setNotFound] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  // The peer's read watermark (last message id they've read), for a "Seen"
  // marker. Undefined when they've read nothing or disabled read receipts.
  const [peerReadId, setPeerReadId] = useState<string | undefined>(undefined);
  // Non-null once the conversation is detected as encrypted (envelopes, not
  // plaintext bodies). The backend fixes the type at creation; we branch on the
  // shape of the messages response rather than assuming it.
  const [envelopes, setEnvelopes] = useState<EncryptedMessage[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getConversationMessages(conversationId, { limit: 100 }, controller.signal)
      .then((res) => {
        if ("messages" in res) {
          // The API returns newest-first; show oldest-first so the latest is at the bottom.
          setMessages([...res.messages].reverse());
          setPeerReadId(res.peer_last_read_message_id);
          setEnvelopes(null);
          // Mark the conversation read on view (idempotent, advance-only). Best
          // effort — a failure never blocks reading the thread.
          void api.markConversationRead(conversationId).catch(() => {});
        } else {
          setEnvelopes(res.envelopes);
        }
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        setStatus("error");
      });
    return () => controller.abort();
  }, [conversationId, reloadKey]);

  function retry() {
    setStatus("loading");
    setNotFound(false);
    setReloadKey((k) => k + 1);
  }

  // The other participant is whoever sent a plaintext message that isn't me.
  const other = messages.find((m) => m.sender_id !== user?.id);
  const otherName = other?.sender_display_name || other?.sender_username || "Conversation";
  const encrypted = status === "ready" && envelopes !== null;

  // Locally tombstone a message the sender just deleted (idempotent 204 already
  // returned); a later refetch confirms persistence.
  function onDeleted(id: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, deleted: true, body: "[deleted]", attachments: undefined, preview: undefined } : m,
      ),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link
          href="/messages"
          className="text-sm text-zinc-500 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          ← Messages
        </Link>
        <h1 className="truncate text-xl font-semibold tracking-tight">
          {encrypted ? "Encrypted conversation" : otherName}
        </h1>
      </div>

      {status === "loading" ? (
        <div className="flex justify-center py-24">
          <Spinner label="Loading conversation" />
        </div>
      ) : status === "error" ? (
        <ErrorState
          title={notFound ? "Conversation not found" : "Something went wrong"}
          message={
            notFound
              ? "This conversation doesn't exist, or you're not a participant."
              : "Could not load this conversation."
          }
          onRetry={notFound ? undefined : retry}
        />
      ) : envelopes !== null ? (
        <EncryptedThreadView
          conversationId={conversationId}
          initialEnvelopes={envelopes}
          recipientId={recipientHint}
          myUserId={user?.id ?? ""}
        />
      ) : (
        <>
          <MessageList
            messages={messages}
            meId={user?.id}
            peerReadId={peerReadId}
            onDeleted={onDeleted}
          />
          <Composer
            conversationId={conversationId}
            onSent={(m) => setMessages((prev) => [...prev, m])}
          />
        </>
      )}
    </div>
  );
}

function MessageList({
  messages,
  meId,
  peerReadId,
  onDeleted,
}: {
  messages: Message[];
  meId?: string;
  peerReadId?: string;
  onDeleted: (id: string) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
        No messages yet. Say hello.
      </p>
    );
  }

  // "Seen" watermark: the peer has read up to peerReadId. If my most-recent
  // message sits at or before that watermark, show "Seen" beneath it.
  const peerReadIndex = peerReadId ? messages.findIndex((m) => m.id === peerReadId) : -1;
  let lastMineIndex = -1;
  for (let i = 0; i < messages.length; i += 1) {
    if (messages[i].sender_id === meId) lastMineIndex = i;
  }
  const seenIndex = lastMineIndex >= 0 && peerReadIndex >= lastMineIndex ? lastMineIndex : -1;

  return (
    <ul className="flex flex-col gap-2">
      {messages.map((m, i) => {
        const mine = m.sender_id === meId;
        return (
          <li key={m.id} className={"flex flex-col " + (mine ? "items-end" : "items-start")}>
            <div
              className={
                "max-w-[75%] rounded-2xl px-3 py-2 text-sm " +
                (mine
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100")
              }
            >
              {m.deleted ? (
                <p className="text-sm italic opacity-70">[deleted]</p>
              ) : (
                <>
                  {m.body ? <p className="whitespace-pre-wrap break-words">{m.body}</p> : null}
                  <MessageAttachments attachments={m.attachments} />
                  {m.preview ? <LinkPreviewCard preview={m.preview} /> : null}
                </>
              )}
              <span
                className={
                  "mt-1 block text-right text-[10px] " +
                  (mine ? "text-zinc-300 dark:text-zinc-500" : "text-zinc-500 dark:text-zinc-400")
                }
              >
                {relativeTime(m.created_at)}
              </span>
            </div>
            {!m.deleted ? (
              <MessageControls message={m} mine={mine} onDeleted={onDeleted} />
            ) : null}
            {i === seenIndex ? (
              <span className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">Seen</span>
            ) : null}
          </li>
        );
      })}
      <div ref={bottomRef} />
    </ul>
  );
}

// MessageControls renders the per-message affordance: Delete on your own
// messages (sender-only tombstone), Report on the peer's (kind=message). Both
// stay subtle beneath the bubble.
function MessageControls({
  message,
  mine,
  onDeleted,
}: {
  message: Message;
  mine: boolean;
  onDeleted: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function del() {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteMessage(message.id);
      onDeleted(message.id);
    } catch {
      setError("Could not delete.");
      setDeleting(false);
    }
  }

  if (mine) {
    return (
      <span className="mt-0.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void del()}
          disabled={deleting}
          aria-label="Delete this message"
          className="text-[11px] font-medium text-zinc-400 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:text-zinc-500 dark:hover:text-red-400"
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
        {error ? <span className="text-[11px] text-red-600 dark:text-red-400">{error}</span> : null}
      </span>
    );
  }

  return (
    <span className="mt-0.5">
      <ReportButton kind="message" targetId={message.id} variant="link" />
    </span>
  );
}

type PendingStatus = "uploading" | "ready" | "error";

interface PendingAttachment {
  localId: string;
  filename: string;
  size: number;
  status: PendingStatus;
  attachmentId?: string;
  error?: string;
}

// uploadErrorMessage maps a backend attachment-upload failure to friendly copy.
function uploadErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 413) return "That file is too large (max 25 MiB).";
    if (err.status === 415) return "That file type isn't supported.";
    if (err.status === 422) return "That file couldn't be attached.";
    if (err.status === 503) return "Attachments aren't available right now.";
  }
  return "Upload failed.";
}

function Composer({
  conversationId,
  onSent,
}: {
  conversationId: string;
  onSent: (m: Message) => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploading = pending.some((p) => p.status === "uploading");
  const readyIds = pending.filter((p) => p.status === "ready" && p.attachmentId).map((p) => p.attachmentId as string);
  const canSend = !busy && !uploading && (body.trim() !== "" || readyIds.length > 0);

  function updatePending(localId: string, patch: Partial<PendingAttachment>) {
    setPending((prev) => prev.map((p) => (p.localId === localId ? { ...p, ...patch } : p)));
  }

  function removePending(localId: string) {
    setPending((prev) => prev.filter((p) => p.localId !== localId));
  }

  function onFilesChosen(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const remaining = MAX_ATTACHMENTS - pending.length;
    if (remaining <= 0) {
      setError(`You can attach at most ${MAX_ATTACHMENTS} files.`);
      return;
    }
    for (const file of Array.from(files).slice(0, remaining)) {
      if (!isAllowedAttachment(file)) {
        setError("That file type isn't supported. Images, video, audio, and PDFs only.");
        continue;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError("That file is too large (max 25 MiB).");
        continue;
      }
      const localId = crypto.randomUUID();
      setPending((prev) => [
        ...prev,
        { localId, filename: file.name, size: file.size, status: "uploading" },
      ]);
      api
        .uploadDMAttachment(conversationId, file)
        .then((res) => updatePending(localId, { status: "ready", attachmentId: res.attachment_id }))
        .catch((err: unknown) => updatePending(localId, { status: "error", error: uploadErrorMessage(err) }));
    }
    // Reset the input so re-choosing the same file fires change again.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function submit() {
    const trimmed = body.trim();
    if (busy || uploading) return;
    if (trimmed === "" && readyIds.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const sent = await api.sendMessage(conversationId, trimmed, readyIds);
      onSent(sent);
      setBody("");
      setPending([]);
    } catch (err: unknown) {
      setError(errorMessage(err, "Could not send your message."));
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
      {pending.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Pending attachments">
          {pending.map((p) => (
            <li
              key={p.localId}
              className={
                "flex items-center gap-2 rounded-md border px-2 py-1 text-xs " +
                (p.status === "error"
                  ? "border-red-300 text-red-700 dark:border-red-800 dark:text-red-300"
                  : "border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-200")
              }
            >
              <span className="max-w-[10rem] truncate font-medium">{p.filename}</span>
              <span className="text-zinc-400 dark:text-zinc-500">{formatBytes(p.size)}</span>
              {p.status === "uploading" ? (
                <span className="text-zinc-400 dark:text-zinc-500">Uploading…</span>
              ) : null}
              {p.status === "error" ? <span>{p.error}</span> : null}
              <button
                type="button"
                onClick={() => removePending(p.localId)}
                aria-label={`Remove attachment ${p.filename}`}
                className="text-zinc-400 hover:text-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:text-zinc-500 dark:hover:text-zinc-200"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <textarea
        aria-label="Write a message"
        placeholder="Write a message…"
        rows={2}
        maxLength={MAX_MESSAGE_LEN}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <div className="flex items-center justify-between gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,audio/*,application/pdf"
          multiple
          onChange={(e) => onFilesChosen(e.target.files)}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={pending.length >= MAX_ATTACHMENTS}
          aria-label="Attach a file"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-300 text-zinc-600 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <button
          type="submit"
          disabled={!canSend}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {busy ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}
