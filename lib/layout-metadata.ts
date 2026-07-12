// Root-layout metadata builder seam (config-parity W2, populated by W4
// branding & social identity). app/layout.tsx calls buildRootMetadata(snapshot)
// from generateMetadata and never grows metadata logic of its own — metadata
// waves extend THIS module only.
//
// W4 behavior: the SSR instance snapshot drives title/description (instance
// name + short description), the favicon (branding.logos.favicon), the
// og:image / twitter:image social-card default (branding.logos.opengraph),
// and twitter:site (social.twitter_username). Every field falls back to
// today's hardcoded behavior when the snapshot is null (backend unreachable),
// the block is absent (pre-W1 backend), or the slot reports is_fallback —
// the fallback favicon behavior is "no icons entry" (vidra ships no static
// app/icon asset today).
//
// og:image precedence: Next.js merges metadata per route segment, and a page
// segment's `openGraph` replaces the layout's wholesale — so any page that
// supplies its own image (e.g. a video thumbnail) automatically wins over the
// instance opengraph default. As of W15 (b216134) the watch page does exactly
// this: app/videos/[id]/page.tsx has a server-side generateMetadata (via
// lib/video.server.ts + lib/watch-metadata.ts) whose og:image prefers the
// video thumbnail and falls back to this instance opengraph logo — so the
// instance default built here is the floor for watch pages, not the ceiling.

import type { Metadata } from "next";

import { brandingAssetUrl, twitterSiteHandle } from "@/lib/branding";
import type { InstanceConfigSnapshot } from "@/lib/instance-config.server";

/** The pre-W4 hardcoded values — the fallback floor for every field. */
export const FALLBACK_TITLE = "Vidra";
export const FALLBACK_DESCRIPTION = "A federated, PeerTube-inspired video platform.";

export function buildRootMetadata(instance: InstanceConfigSnapshot | null): Metadata {
  const name = typeof instance?.name === "string" ? instance.name.trim() : "";
  const shortDescription =
    typeof instance?.short_description === "string" ? instance.short_description.trim() : "";
  const title = name !== "" ? name : FALLBACK_TITLE;
  const description = shortDescription !== "" ? shortDescription : FALLBACK_DESCRIPTION;

  const metadata: Metadata = { title, description };

  // Favicon: only a SET (non-fallback) favicon slot emits an icons entry;
  // the fallback keeps today's behavior (no icon metadata at all).
  const favicon = brandingAssetUrl(instance?.branding?.logos?.favicon);
  if (favicon !== null) {
    metadata.icons = { icon: favicon };
  }

  // Social cards: the opengraph logo slot is the instance-wide og:image /
  // twitter:image default (a page-supplied image wins via segment merging,
  // see the precedence note above); twitter:site is emitted when the operator
  // set a handle. No block is emitted when there is nothing to say.
  const ogImage = brandingAssetUrl(instance?.branding?.logos?.opengraph);
  if (ogImage !== null) {
    metadata.openGraph = {
      title,
      description,
      siteName: title,
      images: [{ url: ogImage }],
    };
  }
  const site = twitterSiteHandle(instance?.social?.twitter_username);
  if (site !== null || ogImage !== null) {
    metadata.twitter = {
      card: ogImage !== null ? "summary_large_image" : "summary",
      ...(site !== null ? { site } : {}),
      ...(ogImage !== null ? { images: [ogImage] } : {}),
    };
  }

  return metadata;
}
