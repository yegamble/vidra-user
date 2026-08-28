// Server-side public feed fetch for the streamed home-page first page. Unlike
// metadata, feeds should be current on each navigation, so this read bypasses
// the Next data cache. Failures return null and let the client VideoFeed retain
// its existing route-mockable retry path.

import type { FeedParams, VideoFeedResponse } from "@/lib/api";
import { serverJson } from "@/lib/server-json";

export async function getPublicFeed(
  params: FeedParams,
): Promise<VideoFeedResponse | null> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }

  const feed = await serverJson<VideoFeedResponse>(`/api/v1/videos?${query.toString()}`, {
    freshness: "no-store",
    // The viewer's IP rides along so vidra-core's per-IP limiter buckets this
    // read under the viewer rather than under the frontend container — this
    // is the single hottest server-side read on the instance (one per home
    // page render). Safe to attach here because the fetch is uncached.
    forwardClientIp: true,
  });
  // A body without a videos array is a wrong shape, not an empty feed.
  return feed && Array.isArray(feed.videos) ? feed : null;
}
