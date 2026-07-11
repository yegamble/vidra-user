// Server-side instance-config fetch (config-parity W2; contract:
// .ralph/specs/config-parity/instance-contract.md). One shared prerequisite for
// generateMetadata (favicon/og/twitter:site), the flash-free default-theme
// bootstrap, the broadcast banner, custom CSS/JS injection, and the '/'
// landing switch — later waves consume the snapshot, they never re-fetch.
//
// Every contract block is OPTIONAL: W1 (vidra-core) lands them incrementally
// and an absent field means "feature not yet shipped". A failed or non-OK
// fetch resolves to null — consumers MUST fall back to today's hardcoded
// behavior, so a missing/old backend can never break rendering (the mocked
// e2e suite runs with no backend at all).

import { cache } from "react";

import type { InstanceResponse } from "@/lib/api/types";
import { apiBaseUrl } from "@/lib/config";

/** One branding asset slot: "" + is_fallback=true when unset. */
export type BrandingAsset = {
  url: string;
  is_fallback: boolean;
};

/** W1 shape, W4 populates. */
export type InstanceBrandingBlock = {
  avatar?: BrandingAsset;
  banner?: BrandingAsset;
  logos?: {
    favicon?: BrandingAsset;
    header_wide?: BrandingAsset;
    header_square?: BrandingAsset;
    opengraph?: BrandingAsset;
  };
  hide_instance_name?: boolean;
};

/** W1 shape; W5/W9 populate. */
export type InstanceDefaultsBlock = {
  feed_sort?: "recent" | "popular" | "trending";
  feed_scope?: "local" | "all";
  landing_page?: "home-recent" | "trending" | "local" | "home";
  theme?: "system" | "light" | "dark";
  player_autoplay?: boolean;
  miniature_prefer_author_display_name?: boolean;
  publish?: {
    privacy?: string;
    licence?: number;
    comment_policy?: "enabled" | "disabled";
    download_enabled?: boolean;
  };
};

/** W3. */
export type InstanceBroadcastBlock = {
  enabled?: boolean;
  /** Markdown. */
  message?: string;
  level?: "info" | "warning" | "error";
  dismissable?: boolean;
};

/** W6. Documents are referenced by hash, never inlined. */
export type InstanceCustomizationBlock = {
  /** sha256 of the custom_css document; "" = none. */
  css_hash?: string;
  js_hash?: string;
  /** "#rrggbb" or "". */
  primary_color?: string;
};

/** W4. Distinct from social_links.x (the About-page link). */
export type InstanceSocialBlock = {
  twitter_username?: string;
};

/** W6. */
export type InstanceHomepageBlock = {
  enabled?: boolean;
  hash?: string;
};

/**
 * GET /instance with the additive config-parity blocks. All new blocks are
 * optional (absent until the matching vidra-core wave lands).
 */
export type InstanceConfigSnapshot = InstanceResponse & {
  branding?: InstanceBrandingBlock;
  defaults?: InstanceDefaultsBlock;
  broadcast?: InstanceBroadcastBlock;
  customization?: InstanceCustomizationBlock;
  social?: InstanceSocialBlock;
  homepage?: InstanceHomepageBlock;
};

// The backend serves Cache-Control: s-maxage=60 on this document; the Next
// data-cache revalidation window matches so a settings change shows within
// about a minute on server-rendered surfaces too.
export const INSTANCE_CONFIG_REVALIDATE_SECONDS = 60;

/**
 * Fetch the public instance config server-side. React cache() deduplicates
 * within one render pass (layout + metadata + slots share one fetch); the
 * Next data cache revalidates it every ~60s across requests. Never throws:
 * any failure (backend down, non-JSON, non-2xx) resolves to null and the
 * caller falls back to the hardcoded defaults.
 */
export const getInstanceConfig = cache(async (): Promise<InstanceConfigSnapshot | null> => {
  try {
    const res = await fetch(`${apiBaseUrl}/api/v1/instance`, {
      headers: { Accept: "application/json" },
      next: { revalidate: INSTANCE_CONFIG_REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    return (await res.json()) as InstanceConfigSnapshot;
  } catch {
    return null;
  }
});
