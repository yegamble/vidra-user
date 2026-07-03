"use client";

import { useEffect, useState } from "react";

import { VideoCard } from "@/components/VideoCard";
import { api } from "@/lib/api";
import type { Video } from "@/lib/api";

const RELATED_COUNT = 6;

// RelatedVideos composes a small "watch next" rail for the watch page from the
// existing public feed endpoints (no dedicated related-videos contract):
// videos from the same channel first (matched by channel_id against a recent
// feed page — the detail response carries no channel_handle, so the channel's
// own listing endpoint is unreachable from here; recorded contract gap), then
// videos in the same category (GET /videos?category=), excluding the current
// video and deduping, capped at 6 cards. The section hides itself while
// loading, on failure, and when nothing relates — it is pure polish and must
// never break the watch page.
export function RelatedVideos({ video }: { video: Video }) {
  const [related, setRelated] = useState<Video[] | null>(null);

  const { id, channel_id: channelId, category } = video;

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      const [recent, sameCategory] = await Promise.all([
        api
          .getFeed({ sort: "recent", limit: 50 }, controller.signal)
          .then((r) => r.videos)
          .catch(() => [] as Video[]),
        category
          ? api
              .getFeed({ sort: "recent", category, limit: 20 }, controller.signal)
              .then((r) => r.videos)
              .catch(() => [] as Video[])
          : Promise.resolve([] as Video[]),
      ]);
      const sameChannel = [...recent, ...sameCategory].filter((v) => v.channel_id === channelId);
      const seen = new Set([id]);
      const picks: Video[] = [];
      for (const v of [...sameChannel, ...sameCategory]) {
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
  }, [id, channelId, category]);

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
