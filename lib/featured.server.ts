// Server-side resolver for the admin featured banner (spec: WAVE C3). The public
// /instance snapshot carries only the RAW admin knobs (lib/instance-config.server
// InstanceFeaturedBlock); THIS resolves the picked video before the home HTML
// streams so the banner never pops in, and it is FAIL-SAFE: any problem — feature
// off, no pick, fetch error, non-OK, non-public/unpublished, or a remote video —
// resolves to null and the home page simply renders no banner.
//
// The fetch is anonymous (no caller cookie, like lib/feed.server.ts), so an
// unlisted/private/password pick is never resolvable to the public banner. The
// video-field/override merge is resolved in the component, not here — this only
// gates visibility and forwards the admin overrides.

import type { Video } from "@/lib/api";
import type { InstanceFeaturedBlock } from "@/lib/instance-config.server";
import { getPublicVideo } from "@/lib/video.server";

/** A resolved, renderable featured banner: the public video plus the admin overrides. */
export type ResolvedFeatured = {
  video: Video;
  /** Title override, or "" to fall back to the video's title. */
  title: string;
  /** Description override, or "" to fall back to the video's description. */
  description: string;
  /** CTA label override, or "" to use the frontend default. */
  ctaLabel: string;
  label: "featured" | "sponsored";
};

/**
 * Resolve the featured banner from the instance snapshot's `featured` block.
 * Returns null on ANY failure or when the picked video is not a public, published
 * LOCAL video — the caller then renders nothing (the banner is silently absent).
 */
export async function resolveFeatured(
  featured: InstanceFeaturedBlock | undefined | null,
): Promise<ResolvedFeatured | null> {
  if (!featured?.enabled) return null;
  const id = (featured.video_id ?? "").trim();
  if (id === "") return null;

  // The same anonymous public-detail read the watch-page metadata does, on the
  // same ~60s revalidation window: a settings change (or the picked video going
  // private/unpublished) reflects within about a minute. Sharing it also means
  // a home render that already resolved this video pays for one fetch, not two.
  const video: Video | null = await getPublicVideo(id);
  if (!video) return null;
  // v1 is local-only, public + published. The detail endpoint carries
  // privacy/state on local videos (omitted on remote cards), so a remote pick
  // — or anything not publicly live — fails the gate.
  if (video.remote === true) return null;
  if (video.privacy !== "public" || video.state !== "published") return null;
  return {
    video,
    title: featured.title ?? "",
    description: featured.description ?? "",
    ctaLabel: featured.cta_label ?? "",
    label: featured.label === "sponsored" ? "sponsored" : "featured",
  };
}
