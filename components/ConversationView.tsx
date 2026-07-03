"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { EncryptedThreadView } from "@/components/e2ee/EncryptedThreadView";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api } from "@/lib/api";
import type { EncryptedMessage, Message } from "@/lib/api";
import { relativeTime } from "@/lib/format";

const MAX_MESSAGE_LEN = 5000;

type Status = "loading" | "error" | "ready";

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
          setEnvelopes(null);
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
          <MessageList messages={messages} meId={user?.id} />
          <Composer
            conversationId={conversationId}
            onSent={(m) => setMessages((prev) => [...prev, m])}
          />
        </>
      )}
    </div>
  );
}

function MessageList({ messages, meId }: { messages: Message[]; meId?: string }) {
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

  return (
    <ul className="flex flex-col gap-2">
      {messages.map((m) => {
        const mine = m.sender_id === meId;
        return (
          <li key={m.id} className={"flex " + (mine ? "justify-end" : "justify-start")}>
            <div
              className={
                "max-w-[75%] rounded-2xl px-3 py-2 text-sm " +
                (mine
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100")
              }
            >
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <span
                className={
                  "mt-1 block text-right text-[10px] " +
                  (mine ? "text-zinc-300 dark:text-zinc-500" : "text-zinc-500 dark:text-zinc-400")
                }
              >
                {relativeTime(m.created_at)}
              </span>
            </div>
          </li>
        );
      })}
      <div ref={bottomRef} />
    </ul>
  );
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

  async function submit() {
    const trimmed = body.trim();
    if (trimmed === "") return;
    setBusy(true);
    setError(null);
    try {
      const sent = await api.sendMessage(conversationId, trimmed);
      onSent(sent);
      setBody("");
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : "Could not send your message.");
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
        aria-label="Write a message"
        placeholder="Write a message…"
        rows={2}
        maxLength={MAX_MESSAGE_LEN}
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
          {busy ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}
