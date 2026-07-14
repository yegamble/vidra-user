// Server-side public feed fetch for the streamed home-page first page. Unlike
// metadata, feeds should be current on each navigation, so this read bypasses
// the Next data cache. Failures return null and let the client VideoFeed retain
// its existing route-mockable retry path.

import type { FeedParams, VideoFeedResponse } from "@/lib/api";
import { internalApiBaseUrl } from "@/lib/config";

export async function getPublicFeed(
  params: FeedParams,
): Promise<VideoFeedResponse | null> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }

  try {
    const res = await fetch(`${internalApiBaseUrl}/api/v1/videos?${query.toString()}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const feed = (await res.json()) as VideoFeedResponse;
    return Array.isArray(feed.videos) ? feed : null;
  } catch {
    return null;
  }
}
