"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import type { LiveStreamUpcomingCard } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

// ChannelUpcomingBadge announces a channel's next scheduled live on its public
// page. Unlike ChannelLiveBadge (owner-only, because the per-channel live list
// is), the Upcoming listing is public and visibility-filtered server-side, so
// every visitor can see it. It links to the watch page, which carries the
// countdown. A failure or an empty list renders nothing — never an error surface
// on a public channel page — and this is announcement only: it says nothing
// about whether the stream will actually start.
export function ChannelUpcomingBadge({ handle }: { handle: string }) {
  const [next, setNext] = useState<LiveStreamUpcomingCard | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .listUpcomingLiveStreams({ channel: handle, limit: 1 }, controller.signal)
      .then((res) => setNext(res.live_streams[0] ?? null))
      .catch(() => {
        if (!controller.signal.aborted) setNext(null);
      });
    return () => controller.abort();
  }, [handle]);

  if (!next) return null;

  return (
    <Link
      href={`/live/${encodeURIComponent(next.id)}`}
      className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-muted"
    >
      Upcoming
      <span className="font-normal text-fg-muted">{formatDateTime(next.scheduled_start_at)}</span>
      <span className="sr-only">: {next.title}</span>
    </Link>
  );
}
