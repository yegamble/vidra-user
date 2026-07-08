"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { PlayIcon } from "@/components/icons";
import { api } from "@/lib/api";
import type { LiveStreamCard } from "@/lib/api";

// LiveNowRail is the home/feed "Live now" discovery surface (specs/design
// app+desktop templates): a horizontal rail of the currently-live PUBLIC streams
// (GET /api/v1/live, newest session first), each card linking to its
// /live/[id] watch page. It renders NOTHING while loading, on error, or when
// nothing is live — a quiet progressive-enhancement surface that never reserves
// space, and never shows an error UI on a public feed (matching ChannelLiveBadge
// / SidebarFollowing).
//
// Faithful to the contract's deliberate omissions (design-refresh spec §5.6):
//   • the design's "N watching" chip is NOT rendered — there is no server-side
//     viewer counter yet (a W4 dependency), so it is omitted, never faked;
//   • live streams have no server-generated poster yet, so each card is a clean
//     surface-muted tile with a faint decorative play glyph and the LIVE badge —
//     no invented thumbnail.
export function LiveNowRail() {
  const [streams, setStreams] = useState<LiveStreamCard[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    api
      .listLivePublicStreams({ limit: 20 }, controller.signal)
      .then((res) => setStreams(res.live_streams))
      .catch(() => {
        // A miss simply shows no rail — never an error surface on the public feed.
        if (!controller.signal.aborted) setStreams([]);
      });
    return () => controller.abort();
  }, []);

  if (streams.length === 0) return null;

  return (
    <section aria-label="Live now" className="mb-8">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-bold tracking-[-0.01em]">Live now</h2>
        <span className="shrink-0 text-[13px] tabular-nums text-fg-muted">
          {streams.length} {streams.length === 1 ? "stream" : "streams"}
        </span>
      </div>
      {/* Horizontal scroll rail: 240px cards, hidden scrollbar (the row scrolls
          on touch / trackpad; focus order still reaches each card). */}
      <ul className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {streams.map((stream) => {
          const channel = stream.channel_display_name || stream.channel_handle;
          return (
            <li key={stream.id} className="w-60 flex-none">
              <Link
                href={`/live/${encodeURIComponent(stream.id)}`}
                aria-label={`${stream.title}, live now — ${channel}`}
                className="focus-ring group block rounded-[14px]"
              >
                <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-[14px] bg-surface-muted">
                  {/* No server poster for live streams yet: a faint decorative
                      play glyph signals a watchable stream (fg-subtle is the
                      decorative-only token) — never a fabricated thumbnail. */}
                  <PlayIcon size={30} className="text-fg-subtle" />
                  {/* Media-overlay LIVE badge — the sanctioned theme-invariant
                      dark pill on media, with the pulsing live dot (globally
                      neutralized under prefers-reduced-motion). */}
                  <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold uppercase leading-none tracking-[0.04em] text-white backdrop-blur">
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 rounded-full bg-live animate-[live-pulse_1.6s_ease-in-out_infinite]"
                    />
                    Live
                  </span>
                </div>
                <div className="mt-2 line-clamp-1 px-0.5 text-sm font-semibold leading-snug tracking-[-0.01em] text-fg">
                  {stream.title}
                </div>
                <div className="mt-0.5 line-clamp-1 px-0.5 text-[12.5px] text-fg-muted">
                  {channel}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
