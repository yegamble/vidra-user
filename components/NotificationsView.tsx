"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import type { Notification } from "@/lib/api";
import { relativeTime } from "@/lib/format";

type Status = "loading" | "error" | "ready";

// A minified Feather-style glyph per notification type (24x24 stroke grid),
// rendered inside the round leading icon chip. Purely decorative (aria-hidden).
const TYPE_ICON: Record<string, string> = {
  comment:
    "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z",
  message: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6",
  video_rejected:
    "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
  report_resolved: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4",
  follow: "M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 8v6M23 11h-6",
};

export function NotificationTypeIcon({ type }: { type: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d={TYPE_ICON[type] ?? TYPE_ICON.follow} />
    </svg>
  );
}

// describeNotification renders a notification as a human message plus the link
// to its target. `lead` is the bold opening (actor / "A moderator") and `rest`
// the remainder — concatenated they read exactly as before. Shared with the
// header bell popover (NotificationsBell) so the two surfaces never drift.
export function describeNotification(n: Notification): {
  lead: string;
  rest: string;
  href: string;
} {
  const actor = n.actor?.display_name || n.actor?.username || "Someone";
  if (n.type === "comment") {
    return {
      lead: actor,
      rest: ` commented on ${n.video_title || "your video"}`,
      href: n.video_id ? `/videos/${n.video_id}` : "#",
    };
  }
  if (n.type === "message") {
    return {
      lead: actor,
      rest: " sent you a message",
      href: n.conversation_id ? `/messages/${n.conversation_id}` : "#",
    };
  }
  if (n.type === "video_rejected") {
    // A moderator rejected the quarantined upload. The moderator's identity and
    // the rejection reason are never exposed by the contract — the honest copy
    // says what happened and points at the studio, where the failed row lives.
    const upload = n.video_title ? `your upload “${n.video_title}”` : "your upload";
    return {
      lead: "A moderator",
      rest: ` rejected ${upload} — it was not published`,
      href: "/studio",
    };
  }
  if (n.type === "report_resolved") {
    const outcome =
      n.report_status === "accepted" || n.report_status === "rejected"
        ? n.report_status
        : "resolved";
    const target = n.report_target_type ? `${n.report_target_type} report` : "report";
    return { lead: "A moderator", rest: ` ${outcome} your ${target}`, href: "#" };
  }
  // follow
  const channel = n.channel_display_name || n.channel_handle || "your channel";
  return {
    lead: actor,
    rest: ` started following ${channel}`,
    href: n.channel_handle ? `/channels/${n.channel_handle}` : "#",
  };
}

// NotificationsView shows the signed-in user's notifications with per-item and
// bulk "mark read" controls. The session lives in memory, so a hard reload lands
// here signed out — we prompt to sign in.
export function NotificationsView() {
  const { status } = useSession();

  if (status !== "authed") {
    return (
      <EmptyState
        title="Sign in to see your notifications"
        message={
          <>
            <Link
              href="/login"
              className="focus-ring rounded font-semibold text-fg underline transition-colors hover:text-fg-muted"
            >
              Sign in
            </Link>{" "}
            to see when people follow your channel or comment on your videos.
          </>
        }
      />
    );
  }

  return <Notifications />;
}

function Notifications() {
  const [status, setStatus] = useState<Status>("loading");
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getNotifications({}, controller.signal)
      .then((res) => {
        setItems(res.notifications);
        setUnread(res.unread_count);
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

  async function markRead(id: string) {
    const target = items.find((i) => i.id === id);
    if (!target || target.read) return;
    setItems((list) => list.map((i) => (i.id === id ? { ...i, read: true } : i))); // optimistic
    setUnread((n) => Math.max(0, n - 1));
    try {
      await api.markNotificationRead(id);
    } catch {
      setReloadKey((k) => k + 1); // resync on failure
    }
  }

  async function markAll() {
    if (unread === 0) return;
    setItems((list) => list.map((i) => ({ ...i, read: true }))); // optimistic
    setUnread(0);
    try {
      await api.markAllNotificationsRead();
    } catch {
      setReloadKey((k) => k + 1);
    }
  }

  if (status === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Loading your notifications" />
      </div>
    );
  }
  if (status === "error") {
    return <ErrorState message="Could not load your notifications." onRetry={retry} />;
  }
  if (items.length === 0) {
    return (
      <EmptyState
        title="No notifications yet"
        message="When someone follows your channel or comments on your video, you'll see it here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void markAll()}
          disabled={unread === 0}
          className="focus-ring rounded-full px-3 py-2 text-[13px] font-semibold text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg disabled:opacity-50"
        >
          Mark all as read
        </button>
      </div>
      <ul className="flex flex-col">
        {items.map((n) => {
          const { lead, rest, href } = describeNotification(n);
          return (
            <li
              key={n.id}
              className={
                "flex items-start gap-3.5 rounded-xl py-3.5 " +
                (n.read ? "px-1" : "bg-surface-muted px-3")
              }
            >
              <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-fg-muted"
              >
                <NotificationTypeIcon type={n.type} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <Link
                  href={href}
                  onClick={() => void markRead(n.id)}
                  className="focus-ring rounded text-sm leading-normal text-fg hover:underline"
                >
                  <span className="font-semibold">{lead}</span>
                  {rest}
                </Link>
                <span className="mt-0.5 text-xs text-fg-muted">{relativeTime(n.created_at)}</span>
              </div>
              {n.read ? null : (
                <button
                  type="button"
                  onClick={() => void markRead(n.id)}
                  aria-label="Mark as read"
                  className="focus-ring mt-1 shrink-0 rounded-full text-xs font-semibold text-fg-muted transition-colors hover:text-fg"
                >
                  Mark read
                </button>
              )}
              {n.read ? null : (
                <span
                  aria-hidden
                  className="mt-2 h-[7px] w-[7px] shrink-0 rounded-full bg-fg"
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
