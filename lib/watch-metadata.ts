// Watch-page metadata builder (config-parity W15, completing W4's og:image
// precedence). app/videos/[id]/page.tsx calls buildWatchMetadata from its
// generateMetadata; Next.js merges metadata per route segment KEY, so every
// key emitted here replaces the root layout's instance default wholesale and
// every key omitted keeps it. The rules:
//
//  - video not found (private/password/unknown → the public GET 404s, or the
//    backend is unreachable): emit NOTHING — the layout's instance metadata
//    stands and the page never errors;
//  - og:image precedence (W4): the video's thumbnail wins over the instance
//    opengraph logo; without a thumbnail the instance opengraph logo is
//    re-emitted (openGraph replaces as a whole key, so the fallback must be
//    carried explicitly);
//  - twitter:site (the operator handle) is likewise re-emitted so the video
//    card keeps the instance attribution.

import type { Metadata } from "next";

import type { Video } from "@/lib/api/types";
import { watchPath } from "@/lib/watch-path";
import { brandingAssetUrl, twitterSiteHandle } from "@/lib/branding";
import { apiBaseUrl } from "@/lib/config";
import type { InstanceConfigSnapshot } from "@/lib/instance-config.server";

// Social-card description cap (og/twitter recommendations sit around 200).
const DESCRIPTION_MAX = 200;

/** The public thumbnail URL for social cards, or null when the video has none. */
export function watchThumbnailUrl(video: Video): string | null {
  if (video.has_thumbnail !== true) return null;
  return `${apiBaseUrl}/api/v1/videos/${encodeURIComponent(video.id)}/thumbnail`;
}

/** First-line, length-capped plain description for meta tags ("" when empty). */
export function metaDescription(raw: string | undefined | null): string {
  const firstLine = (raw ?? "").trim().split("\n", 1)[0]?.trim() ?? "";
  if (firstLine.length <= DESCRIPTION_MAX) return firstLine;
  return `${firstLine.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…`;
}

/** The oembed discovery href for a local watch URL (Wave F F3), or null. */
export function oembedDiscoveryUrl(video: Video, origin: string | null | undefined): string | null {
  if (!origin) return null;
  // The SAME url the page declares canonical — an unfurler passes this href
  // back verbatim, so the two must not disagree. vidra-core#154 taught
  // parseLocalVideoURL the 11-character form, so /v/{code} resolves there; a
  // video with no code still yields /videos/{uuid}, which it has always parsed.
  const canonical = `${origin}${watchPath(video)}`;
  return `${apiBaseUrl}/services/oembed?url=${encodeURIComponent(canonical)}&format=json`;
}

export function buildWatchMetadata(
  video: Video | null,
  instance: InstanceConfigSnapshot | null,
  origin?: string | null,
): Metadata {
  if (video === null) return {};

  const title = video.title.trim() !== "" ? video.title.trim() : null;
  if (title === null) return {};

  const description = metaDescription(video.description);
  const image = watchThumbnailUrl(video) ?? brandingAssetUrl(instance?.branding?.logos?.opengraph);

  const metadata: Metadata = { title };
  if (description !== "") metadata.description = description;

  // With the same-origin relative API base (""), the thumbnail/oembed URLs
  // built above are root-relative; anchoring metadataBase to the request origin
  // makes Next emit them absolute — og:image and the oembed href must be
  // absolute for crawlers. Already-absolute URLs (dev/e2e) pass through as-is.
  if (origin) metadata.metadataBase = new URL(origin);

  // oembed auto-discovery (rel="alternate" type="application/json+oembed"): only
  // when we know the request origin AND the video resolved public (a null video
  // returned {} above, so private/unknown videos never advertise an oembed).
  const oembed = oembedDiscoveryUrl(video, origin);
  // The canonical is the short form when the video has a code, and BARE — no
  // `?t=`, which names a moment in a video rather than a different video. Note
  // the address-bar rewrite keeps `?t=` while this strips it; the two rules are
  // easy to invert and mean opposite things.
  //
  // Relative on purpose: metadataBase (set above from the request origin, which
  // honours x-forwarded-host) resolves it to an absolute URL. A canonical
  // carrying the wrong host is worse than none at all — a crawler silently
  // ignores it.
  const canonical = watchPath(video);
  metadata.alternates = {
    canonical,
    ...(oembed !== null ? { types: { "application/json+oembed": [{ url: oembed, title }] } } : {}),
  };

  metadata.openGraph = {
    title,
    type: "video.other",
    url: canonical,
    ...(description !== "" ? { description } : {}),
    ...(image !== null ? { images: [{ url: image }] } : {}),
  };

  const site = twitterSiteHandle(instance?.social?.twitter_username);
  metadata.twitter = {
    card: image !== null ? "summary_large_image" : "summary",
    title,
    ...(description !== "" ? { description } : {}),
    ...(site !== null ? { site } : {}),
    ...(image !== null ? { images: [image] } : {}),
  };

  return metadata;
}
