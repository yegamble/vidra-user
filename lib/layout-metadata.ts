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

// The pre-W4 hardcoded values — still the fallback floor for these two fields.
// There is deliberately NO FALLBACK_TITLE here any more: the title's floor is the
// software's name, and that name has exactly ONE spelling in this codebase,
// SOFTWARE_NAME in lib/software-brand.ts. A second literal beside it is how the
// two drift.
export const FALLBACK_DESCRIPTION = "A federated, PeerTube-inspired video platform.";
export const FALLBACK_ICON = "/icon.svg";
export const NEUTRAL_ICON = "/neutral-icon.svg";
// The product Apple touch icon is only used when software branding is visible.
// Hidden instances use an operator image or a neutral PNG; Safari cannot use SVG.
export const APPLE_TOUCH_ICON = "/apple-touch-icon.png";
export const NEUTRAL_APPLE_TOUCH_ICON = "/neutral-apple-touch-icon.png";

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

function installedIcon(instance: InstanceConfigSnapshot | null): string | null {
  return (
    brandingAssetUrl(instance?.branding?.logos?.header_square) ??
    brandingAssetUrl(instance?.branding?.avatar) ??
    brandingAssetUrl(instance?.branding?.logos?.favicon)
  );
}

export function buildRootMetadata(instance: InstanceConfigSnapshot | null): Metadata {
  const title = siteTitle(instance);
  const description = siteDescription(instance);

  const metadata: Metadata = { title, description };

  // Prefer the operator's SET (non-fallback) favicon and use the built-in
  // public asset otherwise. Keep this config-based: an app/icon file would
  // take precedence over generateMetadata and hide the uploaded favicon.
  const favicon = brandingAssetUrl(instance?.branding?.logos?.favicon);
  const hidden = hideSoftwareName(instance);
  const apple = hidden ? installedIcon(instance) ?? NEUTRAL_APPLE_TOUCH_ICON : APPLE_TOUCH_ICON;
  metadata.icons = {
    icon: favicon ?? (hidden ? NEUTRAL_ICON : FALLBACK_ICON),
    apple,
  };

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
 * app/globals.css) for a flash-free splash. Hidden instances use their operator
 * image followed by neutral raster fallbacks instead of the product marks.
 */
export function buildWebManifest(
  instance: InstanceConfigSnapshot | null,
): MetadataRoute.Manifest {
  const name = siteTitle(instance);
  const operatorIcon = installedIcon(instance);
  return {
    name,
    short_name: name,
    description: siteDescription(instance),
    start_url: "/",
    display: "standalone",
    background_color: "#f5f5f7",
    theme_color: "#ffffff",
    icons: hideSoftwareName(instance) ? [
      // An operator favicon may be tiny: always retain installable raster sizes.
      ...(operatorIcon !== null ? [{ src: operatorIcon, purpose: "any" as const }] : []),
      { src: "/neutral-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/neutral-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/neutral-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ] : [
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
