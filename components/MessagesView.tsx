"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { LockIcon } from "@/components/e2ee/LockIcon";
import { NewMessageButton } from "@/components/NewMessageButton";
import { Avatar } from "@/components/ui/Avatar";
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
    <ul className="flex flex-col">
      {items.map((c) => {
        const name = c.other_display_name || c.other_username;
        return (
          <li key={c.id}>
            <Link
              // Encrypted threads carry the peer id so the encrypted composer can
              // fan out without a participant lookup (previews are always empty —
              // the server can't read the ciphertext).
              href={c.encrypted ? `/messages/${c.id}?to=${encodeURIComponent(c.other_user_id)}` : `/messages/${c.id}`}
              className="focus-ring flex items-center gap-3 rounded-xl px-1 py-3 transition-colors hover:bg-surface-muted"
            >
              <Avatar src={null} name={name} className="h-11 w-11 text-base" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[14.5px] font-semibold text-fg">{name}</span>
                  {c.encrypted ? (
                    <span
                      className="shrink-0 text-fg-muted"
                      aria-label="Encrypted conversation"
                      title="Encrypted conversation"
                    >
                      <LockIcon className="h-3 w-3" />
                    </span>
                  ) : null}
                  <span className="ml-auto shrink-0 text-[11.5px] text-fg-muted">
                    {relativeTime(c.last_message_at)}
                  </span>
                </span>
                <span
                  className={
                    "mt-0.5 truncate text-[13px] " +
                    (c.unread_count && c.unread_count > 0
                      ? "font-medium text-fg"
                      : "text-fg-muted")
                  }
                >
                  {c.encrypted
                    ? "Encrypted conversation"
                    : c.last_message_body || "No messages yet"}
                </span>
              </div>
              {c.unread_count && c.unread_count > 0 ? (
                <span
                  className="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-fg px-[5px] text-[11px] font-bold tabular-nums text-canvas"
                  aria-label={`${c.unread_count} unread ${c.unread_count === 1 ? "message" : "messages"}`}
                >
                  {c.unread_count > 99 ? "99+" : c.unread_count}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
