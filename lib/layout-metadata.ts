// Root-layout metadata builder seam (config-parity W2, populated by W4
// branding & social identity). app/layout.tsx calls buildRootMetadata(snapshot)
// from generateMetadata and never grows metadata logic of its own — metadata
// waves extend THIS module only.
//
// Two sibling builders live here for the same reason, and share its naming
// rules so the three can never disagree about what this site is called:
// buildWebManifest (app/manifest.ts — the PWA name) and buildNotFoundMetadata
// (app/not-found.tsx — the 404 title).
//
// W4 behavior: the SSR instance snapshot drives title/description (instance
// name + short description), the favicon (branding.logos.favicon), the
// og:image / twitter:image social-card default (branding.logos.opengraph),
// and twitter:site (social.twitter_username). Every field falls back to
// today's hardcoded behavior when the snapshot is null (backend unreachable),
// the block is absent (pre-W1 backend), or the slot reports is_fallback —
// the fallback favicon behavior is the built-in Vidra icon. It lives in
// public/ rather than app/: Next.js file-based icon metadata has higher
// priority and would otherwise mask an operator-uploaded favicon.
//
// og:image precedence: Next.js merges metadata per route segment, and a page
// segment's `openGraph` replaces the layout's wholesale — so any page that
// supplies its own image (e.g. a video thumbnail) automatically wins over the
// instance opengraph default. As of W15 (b216134) the watch page does exactly
// this: app/videos/[id]/page.tsx has a server-side generateMetadata (via
// lib/video.server.ts + lib/watch-metadata.ts) whose og:image prefers the
// video thumbnail and falls back to this instance opengraph logo — so the
// instance default built here is the floor for watch pages, not the ceiling.

import type { Metadata, MetadataRoute } from "next";

import { brandingAssetUrl, twitterSiteHandle } from "@/lib/branding";
import type { InstanceConfigSnapshot } from "@/lib/instance-config.server";
import {
  NEUTRAL_DESCRIPTION,
  NEUTRAL_SITE_TITLE,
  brandName,
  hideSoftwareName,
} from "@/lib/software-brand";

/** The pre-W4 hardcoded values — the fallback floor for every field. */
export const FALLBACK_TITLE = "Vidra";
export const FALLBACK_DESCRIPTION = "A federated, PeerTube-inspired video platform.";
export const FALLBACK_ICON = "/icon.svg";
// The committed PWA apple-touch icon (Wave F, scripts/generate-icons.mjs). It is
// a SEPARATE metadata slot from `icon`, so wiring it never masks an operator's
// uploaded favicon — there is no operator apple-touch slot, so the product mark
// is the floor for the iOS home-screen icon regardless of branding.
export const APPLE_TOUCH_ICON = "/apple-touch-icon.png";

/**
 * The site's NAME for a document/app slot (root <title>, PWA name): the
 * instance's own name, the software's name, or — when white-labelled with no
 * instance name — a neutral word. Never a literal "Vidra" while hidden.
 */
function siteTitle(instance: InstanceConfigSnapshot | null): string {
  return brandName(instance?.name, hideSoftwareName(instance)) ?? NEUTRAL_SITE_TITLE;
}

/**
 * The site DESCRIPTION floor. The shipped fallback names both this software and
 * PeerTube, so a white-labelled instance with no short_description of its own
 * gets a neutral sentence instead of either product's name.
 */
function siteDescription(instance: InstanceConfigSnapshot | null): string {
  const shortDescription =
    typeof instance?.short_description === "string" ? instance.short_description.trim() : "";
  if (shortDescription !== "") return shortDescription;
  return hideSoftwareName(instance) ? NEUTRAL_DESCRIPTION : FALLBACK_DESCRIPTION;
}

export function buildRootMetadata(instance: InstanceConfigSnapshot | null): Metadata {
  const title = siteTitle(instance);
  const description = siteDescription(instance);

  const metadata: Metadata = { title, description };

  // Prefer the operator's SET (non-fallback) favicon and use the built-in
  // public asset otherwise. Keep this config-based: an app/icon file would
  // take precedence over generateMetadata and hide the uploaded favicon.
  const favicon = brandingAssetUrl(instance?.branding?.logos?.favicon);
  metadata.icons = { icon: favicon ?? FALLBACK_ICON, apple: APPLE_TOUCH_ICON };

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

/**
 * The web app manifest (Wave F PWA floor), served by app/manifest.ts at
 * /manifest.webmanifest with the <link rel="manifest"> injected automatically.
 *
 * It used to be a STATIC route naming the product unconditionally, on the
 * reasoning that a build-time route cannot read a per-request snapshot. The
 * white-label switch makes that a leak an operator cannot close — the installed
 * app's name and the manifest JSON are both public — so the route is now async
 * and force-dynamic, and the naming follows the same rules as the root
 * metadata: instance name → software name → neutral word.
 *
 * theme_color mirrors the light theme-color emitted by the root viewport
 * (app/layout.tsx); background_color is the light canvas token (--canvas in
 * app/globals.css) for a flash-free splash. Icons are the committed product
 * marks — textless, so they carry no software name to hide.
 */
export function buildWebManifest(
  instance: InstanceConfigSnapshot | null,
): MetadataRoute.Manifest {
  const name = siteTitle(instance);
  return {
    name,
    short_name: name,
    description: siteDescription(instance),
    start_url: "/",
    display: "standalone",
    background_color: "#f5f5f7",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

/**
 * The catch-all 404's title (app/not-found.tsx). The site name is a SUFFIX
 * here, so a white-labelled instance with no name of its own drops the suffix
 * and its separator rather than substituting a neutral word — "Page not found"
 * is a complete title, where "Page not found — Video" would be noise.
 */
export function buildNotFoundMetadata(instance: InstanceConfigSnapshot | null): Metadata {
  const name = brandName(instance?.name, hideSoftwareName(instance));
  return { title: name !== null ? `Page not found — ${name}` : "Page not found" };
}
