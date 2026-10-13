"use client";

import Link from "next/link";
import { useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import {
  FlagIcon,
  GlobeIcon,
  MessageCircleIcon,
  ShareIcon,
  ShieldIcon,
  UserIcon,
  UsersIcon,
  VideoIcon,
} from "@/components/icons";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ListTail } from "@/components/ui/ListTail";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import type { Notification } from "@/lib/api";
import { cn } from "@/lib/cn";
import { relativeTime } from "@/lib/format";
import { useAppendingList } from "@/lib/use-appending-list";
import { useBrowseAutoLoad } from "@/lib/use-browse-auto-load";
import { SignInGate } from "@/components/SignInGate";

// NotificationTypeIcon maps each notification type to a design-set glyph, rendered
// inside the round leading chip. The design's Inbox uses message-circle for
// comment/reply and message events, a shield for moderation outcomes (held /
// rejected / report resolved), and the user glyph for follows. Purely decorative
// (the shared <Icon> is aria-hidden by default; the chip's <span> is too).
export function NotificationTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "comment":
    case "comment_held":
    case "comment_reply":
    case "comment_mention":
    case "message":
    case "report_message":
      return <MessageCircleIcon size={16} />;
    case "video_rejected":
    case "video_blocked":
    case "video_unblocked":
    case "report_resolved":
      return <ShieldIcon size={16} />;
    case "new_report":
      return <FlagIcon size={16} />;
    case "new_registration_request":
      return <UsersIcon size={16} />;
    case "upload_quarantined":
      return <ShieldIcon size={16} />;
    case "federation_follower_request":
      return <GlobeIcon size={16} />;
    case "new_video":
      return <VideoIcon size={16} />;
    case "video_ownership_request":
      return <ShareIcon size={16} />;
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
  comment_reply: "bg-accent/12 text-accent",
  comment_mention: "bg-accent/12 text-accent",
  message: "bg-tile-green/12 text-tile-green",
  video_rejected: "bg-tile-red/12 text-tile-red",
  video_blocked: "bg-tile-red/12 text-tile-red",
  // The restoration is the one piece of GOOD moderation news, so it takes the
  // shield in green rather than the take-down's red. Without an entry here it
  // fell through to the follow glyph in the neutral chip — caught in Chromium,
  // and the same failure class as a missing describeNotification case.
  video_unblocked: "bg-tile-green/12 text-tile-green",
  report_resolved: "bg-tile-orange/12 text-tile-orange",
  report_message: "bg-tile-orange/12 text-tile-orange",
  new_report: "bg-tile-red/12 text-tile-red",
  new_video: "bg-accent/12 text-accent",
  // Staff approval-queue signals: the amber/orange family reads as "needs a
  // decision", distinct from a report's red.
  new_registration_request: "bg-tile-orange/12 text-tile-orange",
  upload_quarantined: "bg-tile-orange/12 text-tile-orange",
  federation_follower_request: "bg-tile-orange/12 text-tile-orange",
  // An offer waiting on the reader's decision, but good news rather than a
  // queue: the accent family, like a comment.
  video_ownership_request: "bg-accent/12 text-accent",
  comment_held: "bg-tile-orange/12 text-tile-orange",
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

// The reporter's page for a report (My reports), or nowhere when the row
// carries no report id.
function myReportHref(n: Notification): string {
  return n.report_id ? `/settings/reports/${encodeURIComponent(n.report_id)}` : "#";
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
  if (n.type === "comment_reply") {
    // Someone answered a comment the recipient WROTE — a different event from
    // "commented on your video", and usually on someone else's video, so the
    // copy names the thread's video rather than implying ownership. The link
    // goes to that video: comment-level anchors do not exist yet (replies are
    // collapsed behind "View N replies"), so a #comment-… fragment would be a
    // promise the watch page cannot keep.
    const where = n.video_title ? ` on “${n.video_title}”` : "";
    return {
      lead: actor,
      rest: ` replied to your comment${where}`,
      href: n.video_id ? `/videos/${n.video_id}` : "#",
    };
  }
  if (n.type === "comment_held") {
    // A comment on a requires_approval video the recipient manages is waiting
    // for them (core 0161); the row opens the Studio review queue. A federated
    // commenter has no local account, hence the "Someone" fallback.
    const where = n.video_title ? ` on “${n.video_title}”` : "";
    return {
      lead: actor,
      rest: `’s comment${where} is awaiting your approval`,
      href: "/studio/comments",
    };
  }
  if (n.type === "comment_mention") {
    // A comment @-mentioned the recipient. The actor is absent when the comment
    // came from another instance, hence the "Someone" fallback. Like the reply
    // above, the link goes to the video: comment-level anchors do not exist yet.
    const where = n.video_title ? ` on “${n.video_title}”` : "";
    return {
      lead: actor,
      rest: ` mentioned you in a comment${where}`,
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
    // A moderator rejected the quarantined upload. The moderator's identity is
    // never exposed, but the REASON now is (migration 0130): the reject dialog
    // has always collected one and it used to be discarded, so the creator was
    // told their upload was refused and never why. When the moderator wrote
    // nothing the copy is exactly what it was.
    const upload = n.video_title ? `your upload “${n.video_title}”` : "your upload";
    const note = n.moderation_note?.trim();
    return {
      lead: "A moderator",
      rest: ` rejected ${upload} — it was not published${note ? `: ${note}` : ""}`,
      href: "/studio",
    };
  }
  if (n.type === "video_blocked") {
    // Distinct from video_rejected in every way that matters to the person
    // reading it: this video WAS published, it is now hidden from everyone
    // including its owner, and a moderator can lift the block. The A16 ruling
    // settled what slice 2 left open — the moderator's reason is now shown to
    // the creator, because someone told only that their work was taken down can
    // neither appeal it nor avoid repeating it. When the moderator wrote nothing
    // (or the block has since been lifted, which deletes the reason) the copy is
    // exactly the neutral notice it was. The link goes to the Studio list, the
    // one place the creator can still see the video (badged "blocked"); the
    // watch page 404s for them like it does for everyone else.
    const what = n.video_title ? `“${n.video_title}”` : "one of your videos";
    const why = n.moderation_note?.trim();
    return {
      lead: "A moderator",
      rest: ` blocked ${what} — it is no longer available to viewers${why ? `: ${why}` : ""}`,
      href: "/studio/content",
    };
  }
  if (n.type === "video_unblocked") {
    // The other half of video_blocked, and the reason it is its own type: a
    // second video_blocked would read as a SECOND takedown in an inbox that
    // renders by type. There is no prose — nothing needs explaining about a
    // restoration — and the link goes to the video itself, which works again.
    const what = n.video_title ? `“${n.video_title}”` : "one of your videos";
    return {
      lead: "A moderator",
      rest: ` restored ${what} — it is available to viewers again`,
      href: n.video_id ? `/videos/${n.video_id}` : "/studio/content",
    };
  }
  if (n.type === "report_resolved") {
    const outcome =
      n.report_status === "accepted" || n.report_status === "rejected"
        ? n.report_status
        : "resolved";
    const target = n.report_target_type ? `${n.report_target_type} report` : "report";
    return { lead: "A moderator", rest: ` ${outcome} your ${target}`, href: myReportHref(n) };
  }
  if (n.type === "report_message") {
    // A new message on a report's thread (core 0163). It has two audiences:
    // with an actor, the REPORTER wrote and this recipient is staff, so the
    // row links to the queue that holds the thread; without one, staff wrote
    // to the reporter, and the server never names which moderator. The body is
    // never carried — the thread is the only place it is read.
    const target = n.report_target_type ? `${n.report_target_type.replaceAll("_", " ")} report` : "report";
    if (n.actor) return { lead: actor, rest: ` sent a message about their ${target}`, href: "/moderation" };
    return { lead: "A moderator", rest: ` sent you a message about your ${target}`, href: myReportHref(n) };
  }
  if (n.type === "new_report") {
    // Staff-only: a user filed an abuse report (the moderation queue's push
    // signal). The actor is the reporter — staff see the reporter in the queue
    // anyway — and the row links straight to the queue.
    const target = n.report_target_type
      ? n.report_target_type.replaceAll("_", " ")
      : "piece of content";
    return { lead: actor, rest: ` reported a ${target}`, href: "/admin" };
  }
  // The three staff approval-queue signals (core migration 0157). Each links
  // straight to the queue it announces.
  if (n.type === "new_registration_request") {
    return {
      lead: "A new sign-up request",
      rest: " is waiting for approval",
      href: "/admin/registration-requests",
    };
  }
  if (n.type === "upload_quarantined") {
    const title = n.video_title ? `“${n.video_title}”` : "an upload";
    return {
      lead: actor,
      rest: ` uploaded ${title} — it is waiting in the quarantine queue`,
      href: "/moderation/quarantine",
    };
  }
  if (n.type === "federation_follower_request") {
    const channel = n.channel_display_name || n.channel_handle || "a channel";
    return {
      lead: "A remote account",
      rest: ` asked to follow ${channel} — it needs your approval`,
      href: "/admin/federation/follower-requests",
    };
  }
  if (n.type === "caption_ready") {
    // Previously unhandled, so it fell through to the follow copy below — the
    // same failure class as new_video once rendering "started following".
    const what = n.video_title ? `“${n.video_title}”` : "your video";
    return {
      lead: "Captions",
      rest: ` are ready for ${what}`,
      href: n.video_id ? `/videos/${n.video_id}` : "#",
    };
  }
  if (n.type === "new_video") {
    // A channel the recipient follows published a new public video.
    const channelName = n.channel_display_name || n.channel_handle || actor;
    const title = n.video_title ? `“${n.video_title}”` : "a new video";
    return {
      lead: channelName,
      rest: ` published ${title}`,
      href: n.video_id ? `/videos/${n.video_id}` : "#",
    };
  }
  if (n.type === "video_ownership_request") {
    // Another local user offered the reader one of their videos (core 0165).
    // The link goes to where it can be answered, not to the watch page: the
    // offered video may be private, and the reader does not own it yet.
    const what = n.video_title ? `“${n.video_title}”` : "a video";
    return {
      lead: actor,
      rest: ` offered you ${what} — accept or refuse it in Studio`,
      href: "/studio/ownership",
    };
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
      <SignInGate title="Sign in to see your notifications">
        to see when people follow your channel, comment on your videos, or reply
        to you.
      </SignInGate>
    );
  }

  return <Notifications />;
}

function Notifications() {
  const autoLoad = useBrowseAutoLoad();
  // `unread_count` is the account-wide figure and rides on every page, so the
  // badge always shows the server's number, not a count of the loaded rows.
  const [unread, setUnread] = useState(0);
  const list = useAppendingList<Notification>({
    queryKey: "notifications",
    getId: (n) => n.id,
    load: (window, signal) =>
      api.getNotifications(window, signal).then((res) => {
        if (!signal.aborted) setUnread(res.unread_count);
        return { items: res.notifications, total: res.total };
      }),
  });
  const { status, items } = list;

  function retry() {
    list.reload();
  }

  async function markRead(id: string) {
    const target = items.find((i) => i.id === id);
    if (!target || target.read) return;
    list.patch((rows) => rows.map((i) => (i.id === id ? { ...i, read: true } : i))); // optimistic
    setUnread((n) => Math.max(0, n - 1));
    try {
      await api.markNotificationRead(id);
    } catch {
      list.reload(); // resync on failure
    }
  }

  async function markAll() {
    if (unread === 0) return;
    list.patch((rows) => rows.map((i) => ({ ...i, read: true }))); // optimistic
    setUnread(0);
    try {
      await api.markAllNotificationsRead();
    } catch {
      list.reload();
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
      <ListTail
        hasMore={list.hasMore}
        autoLoad={autoLoad}
        busy={list.moreStatus === "loading"}
        error={list.moreStatus === "error" ? "Could not load more notifications." : null}
        onLoadMore={list.loadMore}
      />
    </div>
  );
}
