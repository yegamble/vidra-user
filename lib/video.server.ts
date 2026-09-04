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

/**
 * Fetch one video by its opaque short code, server-side and anonymous. Never
 * throws; a locked, private or unknown video resolves to null exactly as the
 * by-id fetch does.
 *
 * The code is the identifier the /v/{code} route carries, and core answers it
 * through the same visibility and detail path as GET /videos/{id} — so a page
 * built on this sees precisely what the by-id page sees.
 */
export const getPublicVideoByCode = cache(
  async (code: string): Promise<Video | null> =>
    serverJson<Video>(`/api/v1/videos/resolve?code=${encodeURIComponent(code)}`, {
      freshness: { revalidateSeconds: PUBLIC_VIDEO_REVALIDATE_SECONDS },
    }),
);
