"use client";

import Link from "next/link";

import { useFormat, useT } from "@/components/I18nProvider";
import { FollowButton } from "@/components/FollowButton";
import { RemoteInteractionButton } from "@/components/RemoteInteractionButton";
import { Avatar } from "@/components/ui/Avatar";
import { channelAvatarUrl } from "@/lib/api";
import type { NotificationSetting } from "@/lib/api";

// WatchChannelCard is the channel row under the watch metadata (DR5): the owning
// channel's avatar + name (a link to the channel) and its follower count, plus a
// Follow toggle on the right. Transparent on the page background (YouTube-style
// identity row) — a filled band here read as a heavy box between the title and
// the actions. The follower count is optional — it appears once the channel
// detail resolves and is omitted while it loads or if the read fails (never a
// fabricated number).
export function WatchChannelCard({
  handle,
  name,
  followerCount,
  isFollowing = false,
  notificationSetting,
  onDelta,
  videoId,
}: {
  handle: string;
  name: string;
  followerCount: number | null;
  isFollowing?: boolean;
  /** The caller's bell for this channel, straight off the channel payload. */
  notificationSetting?: NotificationSetting;
  onDelta?: (delta: number) => void;
  /** The local video being watched; enables the signed-out "interact from your instance" action. */
  videoId?: string;
}) {
  const t = useT();
  const { formatCount } = useFormat();
  return (
    <div className="flex items-center gap-3 py-1">
      <Link
        href={`/channels/${handle}`}
        className="focus-ring group flex min-w-0 flex-1 items-center gap-3 rounded-lg"
      >
        <Avatar src={channelAvatarUrl(handle)} name={name} className="h-10 w-10 text-[15px]" />
        <div className="min-w-0">
          <div className="truncate text-subhead font-semibold text-fg transition-colors group-hover:text-fg-muted">
            {name}
          </div>
          {followerCount !== null ? (
            <div className="text-footnote tabular-nums text-fg-muted">
              {t("watch.channel.followers", { count: formatCount(followerCount) })}
            </div>
          ) : null}
        </div>
      </Link>
      <FollowButton
        handle={handle}
        channelName={name}
        initialFollowing={isFollowing}
        initialNotificationSetting={notificationSetting}
        onDelta={onDelta}
        className="shrink-0 px-4"
      />
      {videoId ? <RemoteInteractionButton kind="video" id={videoId} className="shrink-0" /> : null}
    </div>
  );
}
