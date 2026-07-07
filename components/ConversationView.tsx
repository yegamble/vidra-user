"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { EncryptedThreadView } from "@/components/e2ee/EncryptedThreadView";
import { MessageTimeline } from "@/components/messaging/MessageTimeline";
import { ThreadHeader } from "@/components/messaging/ThreadHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api } from "@/lib/api";
import type { EncryptedMessage, Message } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import type { DisplayMessage } from "@/lib/messaging/grouping";

const MAX_MESSAGE_LEN = 5000;
const MAX_ATTACHMENTS = 4;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MiB, matching the backend cap.
const POLL_INTERVAL_MS = 10_000;
const INITIAL_LIMIT = 100;
const POLL_LIMIT = 50;

type Status = "loading" | "error" | "ready";

// A local, optimistic message: the DisplayMessage plus the attachment ids we
// need to re-post it on retry (never surfaced to the timeline).
interface PendingMessage extends DisplayMessage {
  clientId: string;
  attachmentIds: string[];
}

// A file is allowed if it is an image, video, audio clip, or PDF (the backend
// attachment allowlist). Checked client-side for an instant error; the backend
// re-checks (415) authoritatively.
function isAllowedAttachment(file: File): boolean {
  const t = file.type;
  return (
    t.startsWith("image/") || t.startsWith("video/") || t.startsWith("audio/") || t === "application/pdf"
  );
}

// mergeMessages upserts an incoming (server) batch into the loaded, oldest→newest
// list: server copies win on id overlap, brand-new ids are inserted, and nothing
// already loaded is dropped (so a short poll page never truncates history).
function mergeMessages(prev: DisplayMessage[], incoming: DisplayMessage[]): DisplayMessage[] {
  if (incoming.length === 0) return prev;
  const map = new Map<string, DisplayMessage>(prev.map((m) => [m.id, m]));
  for (const m of incoming) map.set(m.id, { ...map.get(m.id), ...m });
  return Array.from(map.values()).sort((a, b) => {
    const t = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (t !== 0) return t;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

// ConversationView renders a single 1:1 thread. A non-participant or unknown
// conversation is a 404 from the backend, surfaced as a "not found" state.
export function ConversationView({
  conversationId,
  recipientHint,
  unreadCount,
}: {
  conversationId: string;
  recipientHint?: string;
  unreadCount?: number;
}) {
  const { status } = useSession();

  if (status !== "authed") {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <EmptyState
          title="Sign in to see this conversation"
          message={
            <>
              <Link
                href="/login"
                className="focus-ring rounded font-semibold text-fg underline transition-colors hover:text-fg-muted"
              >
                Sign in
              </Link>{" "}
              to read and send direct messages.
            </>
          }
        />
      </div>
    );
  }

  // Key by id so navigating between threads remounts with fresh loading state.
  return (
    <Thread
      key={conversationId}
      conversationId={conversationId}
      recipientHint={recipientHint}
      unreadCount={unreadCount}
    />
  );
}

function Thread({
  conversationId,
  recipientHint,
  unreadCount,
}: {
  conversationId: string;
  recipientHint?: string;
  unreadCount?: number;
}) {
  const { user } = useSession();
  const meId = user?.id;
  const [status, setStatus] = useState<Status>("loading");
  const [notFound, setNotFound] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [peerReadId, setPeerReadId] = useState<string | undefined>(undefined);
  const [envelopes, setEnvelopes] = useState<EncryptedMessage[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [offline, setOffline] = useState(false);

  const mountedRef = useRef(true);
  const atBottomRef = useRef(true);
  const inFlightSendsRef = useRef(0);
  const pollFailuresRef = useRef(0);
  const pendingRef = useRef<PendingMessage[]>(pending);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Initial load (and manual retry — retry() resets loading state before bumping
  // reloadKey, so the effect body never calls setState directly).
  useEffect(() => {
    const controller = new AbortController();
    api
      .getConversationMessages(conversationId, { limit: INITIAL_LIMIT }, controller.signal)
      .then((res) => {
        if ("messages" in res) {
          setMessages(mergeMessages([], [...res.messages].reverse()));
          setPeerReadId(res.peer_last_read_message_id);
          setEnvelopes(null);
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

  // Poll page 1 every 10s while visible; merge by id (server wins), advance the
  // read watermark only when at the bottom and focused (never in the background).
  // Reads only refs + response data + stable setters, so it is a stable callback.
  const poll = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    if (inFlightSendsRef.current > 0) return;
    try {
      const res = await api.getConversationMessages(conversationId, { limit: POLL_LIMIT });
      if (!mountedRef.current) return;
      if (!("messages" in res)) return;
      setMessages((prev) => mergeMessages(prev, [...res.messages].reverse()));
      setPeerReadId(res.peer_last_read_message_id);
      pollFailuresRef.current = 0;
      setOffline(false);
      if (atBottomRef.current && document.hasFocus()) {
        void api.markConversationRead(conversationId).catch(() => {});
      }
    } catch {
      if (!mountedRef.current) return;
      pollFailuresRef.current += 1;
      if (pollFailuresRef.current >= 2) setOffline(true);
    }
  }, [conversationId]);

  useEffect(() => {
    if (status !== "ready" || envelopes !== null) return;
    const interval = setInterval(() => void poll(), POLL_INTERVAL_MS);
    const onFocus = () => void poll();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [status, envelopes, poll]);

  const setAtBottom = useCallback((atBottom: boolean) => {
    atBottomRef.current = atBottom;
  }, []);

  function retry() {
    setStatus("loading");
    setNotFound(false);
    setReloadKey((k) => k + 1);
  }

  // Optimistic send: append a pending bubble immediately, then reconcile.
  const dispatchSend = useCallback(
    (clientId: string, body: string, attachmentIds: string[]) => {
      inFlightSendsRef.current += 1;
      api
        .sendMessage(conversationId, body, attachmentIds)
        .then((sent: Message) => {
          if (!mountedRef.current) return;
          setPending((p) => p.filter((x) => x.clientId !== clientId));
          setMessages((prev) => mergeMessages(prev, [sent]));
        })
        .catch(() => {
          if (!mountedRef.current) return;
          setPending((p) =>
            p.map((x) => (x.clientId === clientId ? { ...x, sendState: "failed" } : x)),
          );
        })
        .finally(() => {
          inFlightSendsRef.current -= 1;
        });
    },
    [conversationId],
  );

  const onSend = useCallback(
    (body: string, attachmentIds: string[]) => {
      const clientId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `tmp-${Date.now()}-${Math.random()}`;
      const optimistic: PendingMessage = {
        id: clientId,
        clientId,
        attachmentIds,
        sendState: "sending",
        sender_id: meId ?? "",
        sender_display_name: user?.display_name,
        sender_username: user?.username,
        body,
        created_at: new Date().toISOString(),
      };
      setPending((p) => [...p, optimistic]);
      dispatchSend(clientId, body, attachmentIds);
    },
    [dispatchSend, meId, user?.display_name, user?.username],
  );

  const onRetry = useCallback(
    (clientId: string) => {
      const item = pendingRef.current.find((x) => x.clientId === clientId);
      if (!item) return;
      setPending((p) =>
        p.map((x) => (x.clientId === clientId ? { ...x, sendState: "sending" } : x)),
      );
      dispatchSend(clientId, item.body, item.attachmentIds);
    },
    [dispatchSend],
  );

  const onDiscard = useCallback((clientId: string) => {
    setPending((p) => p.filter((x) => x.clientId !== clientId));
  }, []);

  const onDeleted = useCallback((id: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id
          ? { ...m, deleted: true, body: "[deleted]", attachments: undefined, preview: undefined }
          : m,
      ),
    );
  }, []);

  const displayMessages = useMemo<DisplayMessage[]>(
    () => [...messages, ...pending],
    [messages, pending],
  );

  const encrypted = status === "ready" && envelopes !== null;
  const other = messages.find((m) => m.sender_id !== meId);
  const otherName = other?.sender_display_name || other?.sender_username || "Conversation";
  const otherUsername = other?.sender_username;
  const otherUserId = other?.sender_id ?? recipientHint;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ThreadHeader
        name={encrypted ? "Encrypted conversation" : otherName}
        username={otherUsername}
        otherUserId={otherUserId}
        encrypted={encrypted}
      />

      {offline ? (
        <div
          role="status"
          className="shrink-0 bg-warning/15 px-4 py-1.5 text-center text-[12px] font-semibold text-warning"
        >
          Connection lost — retrying…
        </div>
      ) : null}

      {status === "loading" ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <Spinner label="Loading conversation" />
        </div>
      ) : status === "error" ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4">
          <ErrorState
            title={notFound ? "Conversation not found" : "Something went wrong"}
            message={
              notFound
                ? "This conversation doesn't exist, or you're not a participant."
                : "Could not load this conversation."
            }
            onRetry={notFound ? undefined : retry}
          />
        </div>
      ) : envelopes !== null ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="mx-auto w-full max-w-3xl">
            <EncryptedThreadView
              conversationId={conversationId}
              initialEnvelopes={envelopes}
              recipientId={recipientHint}
              myUserId={meId ?? ""}
            />
          </div>
        </div>
      ) : (
        <>
          <MessageTimeline
            messages={displayMessages}
            meId={meId}
            peerReadId={peerReadId}
            unreadCount={unreadCount}
            otherName={otherName}
            onDeleted={onDeleted}
            onRetry={onRetry}
            onDiscard={onDiscard}
            onAtBottomChange={setAtBottom}
          />
          <Composer conversationId={conversationId} onSend={onSend} />
        </>
      )}
    </div>
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

// Composer stays usable while a send is in flight (optimistic send is handled by
// the parent). Auto-grow, Enter-to-send, and an icon send button are Composer v2
// (Messaging v2 slice S5) — this keeps the existing controls and labels.
function Composer({
  conversationId,
  onSend,
}: {
  conversationId: string;
  onSend: (body: string, attachmentIds: string[]) => void;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploading = pending.some((p) => p.status === "uploading");
  const readyIds = pending
    .filter((p) => p.status === "ready" && p.attachmentId)
    .map((p) => p.attachmentId as string);
  const canSend = !uploading && (body.trim() !== "" || readyIds.length > 0);

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
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function submit() {
    const trimmed = body.trim();
    if (uploading) return;
    if (trimmed === "" && readyIds.length === 0) return;
    onSend(trimmed, readyIds);
    setBody("");
    setPending([]);
  }

  return (
    <form
      className="flex shrink-0 flex-col gap-2 border-t border-border-subtle px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {pending.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Pending attachments">
          {pending.map((p) => (
            <li
              key={p.localId}
              className={
                "flex items-center gap-2 rounded-full border px-3 py-1 text-xs " +
                (p.status === "error"
                  ? "border-danger-border bg-danger-surface text-danger"
                  : "border-border text-fg")
              }
            >
              <span className="max-w-[10rem] truncate font-medium">{p.filename}</span>
              <span className={p.status === "error" ? "" : "text-fg-muted"}>
                {formatBytes(p.size)}
              </span>
              {p.status === "uploading" ? <span className="text-fg-muted">Uploading…</span> : null}
              {p.status === "error" ? <span>{p.error}</span> : null}
              <button
                type="button"
                onClick={() => removePending(p.localId)}
                aria-label={`Remove attachment ${p.filename}`}
                className="focus-ring rounded-full text-fg-muted transition-colors hover:text-fg"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div className="flex items-end gap-2.5">
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
          className="focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-muted text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
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
        <textarea
          aria-label="Write a message"
          placeholder="Write a message…"
          rows={2}
          maxLength={MAX_MESSAGE_LEN}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="focus-ring w-full min-w-0 flex-1 resize-none rounded-[22px] bg-surface-muted px-4 py-2.5 text-[14.5px] text-fg placeholder:text-fg-muted"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="focus-ring h-11 shrink-0 rounded-full bg-accent px-4 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent/90 disabled:opacity-60"
        >
          Send
        </button>
      </div>
    </form>
  );
}
