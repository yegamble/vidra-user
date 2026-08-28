"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { EncryptedThreadView } from "@/components/e2ee/EncryptedThreadView";
import { Composer } from "@/components/messaging/Composer";
import { MessageTimeline } from "@/components/messaging/MessageTimeline";
import { ThreadHeader } from "@/components/messaging/ThreadHeader";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api } from "@/lib/api";
import type { EncryptedMessage, Message } from "@/lib/api";
import type { DisplayMessage } from "@/lib/messaging/grouping";
import { SignInGate } from "@/components/SignInGate";

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

// mergeEnvelopes upserts a poll page into the loaded envelope list, preserving the
// API's newest-first order. Like mergeMessages it never drops what is already
// loaded, so a short poll page cannot truncate history. It returns the SAME array
// when the page brings nothing new, which lets the encrypted view skip a decrypt.
function mergeEnvelopes(
  prev: EncryptedMessage[] | null,
  incoming: EncryptedMessage[],
): EncryptedMessage[] {
  if (prev === null) return incoming;
  const known = new Set(prev.map((e) => e.id));
  if (incoming.every((e) => known.has(e.id))) return prev;
  const map = new Map<string, EncryptedMessage>(prev.map((e) => [e.id, e]));
  for (const e of incoming) map.set(e.id, e);
  return Array.from(map.values()).sort((a, b) => {
    const t = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (t !== 0) return t;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
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
        <SignInGate title="Sign in to see this conversation">
          to read and send direct messages.
        </SignInGate>
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
          // An encrypted thread carries an unread badge like any other — the
          // server counts envelopes, not plaintext — so its read watermark has to
          // advance here too, or the badge sticks until a plaintext DM arrives.
          void api.markConversationRead(conversationId).catch(() => {});
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
  // Encrypted threads poll on the SAME cadence — their envelopes are just as live
  // as plaintext messages, and without this an inbound encrypted message stayed
  // invisible until a manual reload.
  const poll = useCallback(async () => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    if (inFlightSendsRef.current > 0) return;
    try {
      const res = await api.getConversationMessages(conversationId, { limit: POLL_LIMIT });
      if (!mountedRef.current) return;
      pollFailuresRef.current = 0;
      setOffline(false);
      if (!("messages" in res)) {
        // Encrypted: hand the merged envelopes down. mergeEnvelopes keeps the same
        // array when nothing is new, so the decrypt path only re-runs on real news.
        // The encrypted view reports its own at-bottom state (onAtBottomChange),
        // so the watermark advances under exactly the plaintext rule below.
        setEnvelopes((prev) => mergeEnvelopes(prev, res.envelopes));
        if (atBottomRef.current && document.hasFocus()) {
          void api.markConversationRead(conversationId).catch(() => {});
        }
        return;
      }
      setMessages((prev) => mergeMessages(prev, [...res.messages].reverse()));
      setPeerReadId(res.peer_last_read_message_id);
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
    if (status !== "ready") return;
    const interval = setInterval(() => void poll(), POLL_INTERVAL_MS);
    const onFocus = () => void poll();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [status, poll]);

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
              envelopes={envelopes}
              recipientId={recipientHint}
              myUserId={meId ?? ""}
              onAtBottomChange={setAtBottom}
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
