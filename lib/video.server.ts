// Server-side public-video fetch (config-parity W15, completing W4's watch-page
// og:image precedence). Mirrors lib/instance-config.server.ts: React cache()
// deduplicates within one render pass, the Next data cache revalidates across
// requests, and every failure resolves to null — a missing/private/password
// video (the public GET answers 404) or an unreachable backend degrades to the
// layout's instance metadata defaults without erroring the page.

import { cache } from "react";

import type { Video } from "@/lib/api/types";
import { serverJson } from "@/lib/server-json";

// Watch metadata may lag a title/thumbnail edit by up to a minute — the same
// freshness window the instance-config snapshot accepts.
export const PUBLIC_VIDEO_REVALIDATE_SECONDS = 60;

/**
 * Fetch one video's public detail document server-side (anonymous — no bearer
 * token, so it sees exactly what a link-preview crawler sees). Never throws.
 */
export const getPublicVideo = cache(
  async (id: string): Promise<Video | null> =>
    serverJson<Video>(`/api/v1/videos/${encodeURIComponent(id)}`, {
      freshness: { revalidateSeconds: PUBLIC_VIDEO_REVALIDATE_SECONDS },
    }),
);
