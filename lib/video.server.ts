// Server-side public-video fetch (config-parity W15, completing W4's watch-page
// og:image precedence). Mirrors lib/instance-config.server.ts: React cache()
// deduplicates within one render pass, the Next data cache revalidates across
// requests, and every failure resolves to null — a missing/private/password
// video (the public GET answers 404) or an unreachable backend degrades to the
// layout's instance metadata defaults without erroring the page.

import { cache } from "react";

import type { Video } from "@/lib/api/types";
import { serverJson } from "@/lib/server-json";

// UNCACHED, deliberately. These three reads used to revalidate on a 60-second
// window, accepting that "watch metadata may lag a title/thumbnail edit by up to
// a minute". A moderation hide is not a lag: Next's data cache does not replace
// a cached successful body with a FAILED revalidation, so the last good copy is
// served indefinitely. A16 slice 2 measured a blocked video's title, og:*,
// canonical og:url, og:image, an <h1> and the whole serialized video document
// coming back for 30 requests over 175 seconds while GET /api/v1/videos/{id}
// answered 404 to the same anonymous caller throughout — a URL never rendered
// before the block was clean, which is what identifies the mechanism. A
// JavaScript visitor still ended on "Video not found" because the client
// re-fetches; a crawler, a link-preview unfurler or a no-JS reader got the video
// back. Blocks, privacy changes (public -> private/unlisted) and deletion all
// share this path.
//
// Shortening the window would have fixed nothing — once revalidation starts
// failing, ANY window leaks forever — and tag-based invalidation would need
// vidra-core to call back into the frontend, which it has no way to do. So the
// document is read with no-store, exactly as lib/server-json.ts describes the
// freshness knob: "a document whose staleness is a correctness bug".
//
// The cost, stated plainly: one uncached GET /api/v1/videos/{id} per watch-page
// RENDER (not two — React cache() still deduplicates generateMetadata and the
// page body within one pass), where before, concurrent views of the same video
// could share one backend read for up to a minute. On a hot video that is the
// difference between ~1 request/minute and one per view. WatchView's own client
// fetch is unchanged.
export const PUBLIC_VIDEO_FRESHNESS = "no-store" as const;

/**
 * Fetch one video's public detail document server-side (anonymous — no bearer
 * token, so it sees exactly what a link-preview crawler sees). Never throws.
 */
export const getPublicVideo = cache(
  async (id: string): Promise<Video | null> =>
    serverJson<Video>(`/api/v1/videos/${encodeURIComponent(id)}`, {
      freshness: PUBLIC_VIDEO_FRESHNESS,
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
      freshness: PUBLIC_VIDEO_FRESHNESS,
    }),
);

/**
 * Resolve a uuid from an OLDER public URL to the video it now names,
 * server-side and anonymous. Never throws.
 *
 * Two namespaces reach this and both are uuids, so core serves them with one
 * lookup: this instance's own id (the /videos/watch/{uuid} form remote
 * ActivityPub servers still hold) and the SOURCE uuid of a video imported from
 * a PeerTube instance, which is what its /w/{shortUUID} links decode to.
 */
export const getPublicVideoByLegacyUUID = cache(
  async (uuid: string): Promise<Video | null> =>
    serverJson<Video>(`/api/v1/videos/resolve?legacy_uuid=${encodeURIComponent(uuid)}`, {
      freshness: PUBLIC_VIDEO_FRESHNESS,
    }),
);
