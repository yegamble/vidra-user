"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { Avatar } from "@/components/ui/Avatar";
import { api, channelAvatarUrl } from "@/lib/api";
import type { FollowedChannel } from "@/lib/api";

// SidebarFollowing renders the "FOLLOWING" group of the desktop sidebar (backport
// W0.2 template): the local channels the signed-in user follows, each an avatar +
// display name linking to the channel. It reads ONLY the contract that exists
// (GET /me/subscriptions → listFollowedChannels); it is quiet by design and
// renders nothing when signed out, still loading, on error, or with no follows —
// so it never adds a landmark, an empty heading, or an error surface to the shell.
//
// The template also shows a per-channel unread/live dot. The public contract
// carries no such signal (the Channel payload has no live/unread field, and live
// listings are owner-only — see ChannelLiveBadge), so the dot is deliberately NOT
// rendered here rather than faked. Wiring it is a tracked backend dependency
// (fix_plan W0.2 note): a followed-channel "has unread" / "is live" flag.
export function SidebarFollowing({ collapsed }: { collapsed: boolean }) {
  const { status } = useSession();
  const headingId = useId();
  const [channels, setChannels] = useState<FollowedChannel[]>([]);

  useEffect(() => {
    if (status !== "authed") return;
    const controller = new AbortController();
    // A modest page is plenty for a sidebar rail; the full list lives on
    // /subscriptions. Any failure (no backend, transient error) stays silent —
    // the group simply doesn't render, exactly like a signed-out shell.
    api
      .listFollowedChannels({ limit: 15 }, controller.signal)
      .then((res) => setChannels(res.channels))
      .catch(() => {
        if (!controller.signal.aborted) setChannels([]);
      });
    return () => controller.abort();
  }, [status]);

  // Guarded on status too, so a signed-out shell renders nothing even if a
  // previous session left channels in state (the render never leaks them).
  if (status !== "authed" || channels.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <p
        id={headingId}
        className={`px-3 text-[11px] font-semibold uppercase tracking-wider text-fg-muted ${
          collapsed ? "sr-only" : "pb-0.5"
        }`}
      >
        Following
      </p>
      <ul aria-labelledby={headingId} className="flex flex-col gap-0.5">
        {channels.map((channel) => (
          <li key={channel.id}>
            <Link
              href={`/channels/${encodeURIComponent(channel.handle)}`}
              title={collapsed ? channel.display_name : undefined}
              className={`focus-ring flex items-center gap-3 rounded-[9px] py-1.5 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg ${
                collapsed ? "justify-center px-1.5" : "px-3"
              }`}
            >
              <Avatar
                src={channel.has_avatar ? channelAvatarUrl(channel.handle) : null}
                name={channel.display_name}
                className="h-6 w-6 text-[11px]"
              />
              <span className={collapsed ? "sr-only" : "truncate"}>
                {channel.display_name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
