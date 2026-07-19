"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { MessageCircleIcon, ShieldIcon, UserIcon } from "@/components/icons";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import type { Notification } from "@/lib/api";
import { cn } from "@/lib/cn";
import { relativeTime } from "@/lib/format";

type Status = "loading" | "error" | "ready";

// NotificationTypeIcon maps each notification type to a design-set glyph, rendered
// inside the round leading chip. The design's Inbox uses message-circle for
// comment/reply and message events, a shield for moderation outcomes (held /
// rejected / report resolved), and the user glyph for follows. Purely decorative
// (the shared <Icon> is aria-hidden by default; the chip's <span> is too).
export function NotificationTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "comment":
    case "message":
      return <MessageCircleIcon size={16} />;
    case "video_rejected":
    case "report_resolved":
      return <ShieldIcon size={16} />;
    default:
      return <UserIcon size={16} />;
  }
}

// The tinted circle each notification leads with — an Apple-style
// icon-in-tinted-circle keyed to the notification kind (Messages green, new
// follows blue, comments the indigo accent, moderation red/orange), leaving a
// neutral fallback for unknown kinds. The tint is supporting decoration (the
// row's text carries the meaning), so the whole chip — glyph included — stays
// aria-hidden. Shared with the header bell popover so the two surfaces match.
const NOTIF_CHIP: Record<string, string> = {
  follow: "bg-tile-blue/12 text-tile-blue",
  comment: "bg-accent/12 text-accent",
  message: "bg-tile-green/12 text-tile-green",
  video_rejected: "bg-tile-red/12 text-tile-red",
  report_resolved: "bg-tile-orange/12 text-tile-orange",
};
const NOTIF_CHIP_DEFAULT = "bg-surface-muted text-fg-muted";

export function NotificationIconChip({ type }: { type: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
        NOTIF_CHIP[type] ?? NOTIF_CHIP_DEFAULT,
      )}
    >
      <NotificationTypeIcon type={type} />
    </span>
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
              <NotificationIconChip type={n.type} />
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
                  className="mt-2 h-[7px] w-[7px] shrink-0 rounded-full bg-accent"
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
