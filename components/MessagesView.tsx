"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { LockIcon } from "@/components/e2ee/LockIcon";
import { NewMessageButton } from "@/components/NewMessageButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import type { ConversationSummary } from "@/lib/api";
import { relativeTime } from "@/lib/format";

type Status = "loading" | "error" | "ready";

// MessagesView shows the signed-in user's direct-message inbox: one row per
// conversation with the other participant and a preview of the last message.
// The session lives in memory, so a hard reload lands here signed out — we prompt
// to sign in (mirroring the notifications/library pattern).
export function MessagesView() {
  const { status } = useSession();

  if (status !== "authed") {
    return (
      <EmptyState
        title="Sign in to see your messages"
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <NewMessageButton />
      </div>
      <Inbox />
    </div>
  );
}

function Inbox() {
  const [status, setStatus] = useState<Status>("loading");
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getConversations({}, controller.signal)
      .then((res) => {
        setItems(res.conversations);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [reloadKey]);

  function retry() {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  }

  if (status === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Loading your messages" />
      </div>
    );
  }
  if (status === "error") {
    return <ErrorState message="Could not load your messages." onRetry={retry} />;
  }
  if (items.length === 0) {
    return (
      <EmptyState
        title="No messages yet"
        message="Start one with New message above (or from someone's comment), and it'll show up here."
      />
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      {items.map((c) => (
        <li key={c.id}>
          <Link
            // Encrypted threads carry the peer id so the encrypted composer can
            // fan out without a participant lookup (previews are always empty —
            // the server can't read the ciphertext).
            href={c.encrypted ? `/messages/${c.id}?to=${encodeURIComponent(c.other_user_id)}` : `/messages/${c.id}`}
            className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:hover:bg-zinc-900/40"
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-1.5 truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {c.encrypted ? (
                  <span
                    className="text-emerald-600 dark:text-emerald-400"
                    aria-label="Encrypted conversation"
                    title="Encrypted conversation"
                  >
                    <LockIcon />
                  </span>
                ) : null}
                {c.other_display_name || c.other_username}
              </span>
              <span
                className={
                  "truncate text-sm " +
                  (c.unread_count && c.unread_count > 0
                    ? "font-medium text-zinc-900 dark:text-zinc-100"
                    : "text-zinc-500 dark:text-zinc-400")
                }
              >
                {c.encrypted
                  ? "Encrypted conversation"
                  : c.last_message_body || "No messages yet"}
              </span>
            </div>
            {c.unread_count && c.unread_count > 0 ? (
              <span
                className="inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-zinc-900 px-1.5 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
                aria-label={`${c.unread_count} unread ${c.unread_count === 1 ? "message" : "messages"}`}
              >
                {c.unread_count > 99 ? "99+" : c.unread_count}
              </span>
            ) : null}
            <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
              {relativeTime(c.last_message_at)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
