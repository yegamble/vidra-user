"use client";

import { useEffect, useState } from "react";

import { VideoCard } from "@/components/VideoCard";
import { api } from "@/lib/api";
import type { Video } from "@/lib/api";

const RELATED_COUNT = 6;

// RelatedVideos composes a small "watch next" rail for the watch page from the
// existing public endpoints (no dedicated related-videos contract). Same-channel
// videos come first: the detail response now carries `channel_handle` (Wave A
// contract gap closed), so we can list the channel directly via GET
// /channels/{handle}/videos instead of scanning a recent feed page for a
// channel_id match. Same-category videos (GET /videos?category=) fill the rest.
// The current video is excluded and results deduped, capped at 6 cards. The
// section hides itself while loading, on failure, and when nothing relates — it
// is pure polish and must never break the watch page.
export function RelatedVideos({ video }: { video: Video }) {
  const [related, setRelated] = useState<Video[] | null>(null);

  const { id, channel_handle: channelHandle, channel_id: channelId, category } = video;

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      const [sameChannel, sameCategory] = await Promise.all([
        // Prefer the channel's own listing (detail now carries channel_handle);
        // fall back to an empty list if the handle is absent (e.g. a remote card).
        channelHandle
          ? api
              .listChannelVideos(channelHandle, undefined, controller.signal)
              .then((r) => r.videos)
              .catch(() => [] as Video[])
          : Promise.resolve([] as Video[]),
        category
          ? api
              .getFeed({ sort: "recent", category, limit: 20 }, controller.signal)
              .then((r) => r.videos)
              .catch(() => [] as Video[])
          : Promise.resolve([] as Video[]),
      ]);
      // Guard the channel listing against a stale/mismatched channel_id too.
      const channelPicks = sameChannel.filter((v) => !channelId || v.channel_id === channelId);
      const seen = new Set([id]);
      const picks: Video[] = [];
      for (const v of [...channelPicks, ...sameCategory]) {
        if (seen.has(v.id)) continue;
        seen.add(v.id);
        picks.push(v);
        if (picks.length === RELATED_COUNT) break;
      }
      if (!cancelled) setRelated(picks);
    }

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id, channelHandle, channelId, category]);

  if (!related || related.length === 0) return null;

  return (
    <aside aria-label="Related videos" className="flex w-full shrink-0 flex-col gap-4 lg:w-80">
      <h2 className="text-lg font-semibold tracking-tight">Related videos</h2>
      <ul className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-1">
        {related.map((v) => (
          <li key={v.id}>
            <VideoCard video={v} />
          </li>
        ))}
      </ul>
    </aside>
  );
}
