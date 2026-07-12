// Instance branding helpers (config-parity W4). The GET /instance branding
// block carries per-slot {url, is_fallback} references (contract:
// .ralph/specs/config-parity/instance-contract.md); these helpers turn them
// into usable URLs and mirror the backend's upload validation so the admin
// manager can reject bad files inline before a request is made.
//
// No "use client": server metadata (lib/layout-metadata.ts) and client
// components (Header, InstanceAboutView, InstanceBrandingManager) both import
// from here.

import { apiBaseUrl } from "@/lib/config";
import type { BrandingAsset } from "@/lib/instance-config.server";

/**
 * The absolute URL of a SET branding asset, or null when the client should use
 * its built-in fallback (slot absent, is_fallback, or an empty url). Asset
 * URLs in the /instance payload are `/api/v1/...` paths on the API origin —
 * vidra-user is a separate origin, so they are resolved against apiBaseUrl.
 */
export function brandingAssetUrl(asset: BrandingAsset | null | undefined): string | null {
  if (!asset || asset.is_fallback || asset.url === "") return null;
  return /^https?:\/\//i.test(asset.url) ? asset.url : apiBaseUrl + asset.url;
}

/**
 * Normalizes social_meta_twitter_username for the twitter:site meta tag:
 * "@vidra" or "vidra" → "@vidra"; unset/blank → null (emit no tag).
 */
export function twitterSiteHandle(username: string | null | undefined): string | null {
  if (typeof username !== "string") return null;
  const trimmed = username.trim();
  if (trimmed === "") return null;
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

// --- Upload validation (mirrors the backend gates) --------------------------

// The backend accepts JPEG/PNG/WebP by file extension (415 otherwise — the
// same gate as user/channel avatars, vidra-core profileimage pipeline)…
const ACCEPTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

/** The file-picker accept attribute matching the backend's type gate. */
export const BRANDING_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

// …and bounds every request body by HTTP_BODY_LIMIT (vidra-core default "8M").
// Mirrored here so an oversized pick fails inline instead of as a 413.
export const BRANDING_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Inline validation for a picked branding image: null when fine, otherwise the
 * user-facing error. Mirrors the backend's extension gate and body limit.
 */
export function validateBrandingImage(file: Pick<File, "name" | "size">): string | null {
  const name = file.name.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    return "The image must be a JPEG, PNG, or WebP.";
  }
  if (file.size > BRANDING_IMAGE_MAX_BYTES) {
    return "The image must be 8 MiB or smaller.";
  }
  return null;
}
