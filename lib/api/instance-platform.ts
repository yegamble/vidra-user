// Instance platform info helpers (spec: .ralph/specs/instance-platform-info.md).
// The contract types are generated from vidra-core's OpenAPI spec; this module
// only keeps the shared empty document, compatibility wrappers, and the cached
// instance fetch used by sensitive-content presentation.

import { api } from "./endpoints";
import type {
  InstanceAboutResponse,
  InstanceContactRequest,
  InstanceResponse,
  SensitiveContentPolicy,
  SensitiveVideoFields,
} from "./types";

export type { InstanceAboutResponse, InstanceContactRequest, SensitiveContentPolicy };
export type ExtendedInstanceResponse = InstanceResponse;
export type ContactInstanceRequest = InstanceContactRequest;
export type InstancePlatformExtras = Pick<
  InstanceResponse,
  | "short_description"
  | "default_language"
  | "categories"
  | "moderator_languages"
  | "server_country"
  | "is_sensitive"
  | "sensitive_content_policy"
  | "contact_form_enabled"
  | "social_links"
>;

/** The all-empty about document — what a 404 (backend not landed / nothing set) maps to. */
export const EMPTY_INSTANCE_ABOUT: InstanceAboutResponse = {
  description: "",
  terms: "",
  code_of_conduct: "",
  moderation_info: "",
  administrator_info: "",
  creation_reason: "",
  maintenance_lifetime: "",
  business_model: "",
  hardware_info: "",
  support_text: "",
};

/**
 * GET /api/v1/instance/about — the public long-form instance texts (raw
 * markdown strings, "" when unset). Public, unauthenticated.
 */
export function getInstanceAbout(signal?: AbortSignal): Promise<InstanceAboutResponse> {
  return api.getInstanceAbout(signal);
}

/**
 * POST /api/v1/instance/contact — write to the instance admin (public). 202 on
 * success; 409 `contact_form_disabled` when the form is unavailable; 422 with
 * FieldErrors (from_name/from_email/subject/body); 429 when the 1-per-IP-per-hour
 * limit denies.
 */
export function contactInstance(body: ContactInstanceRequest): Promise<void> {
  return api.contactInstance(body);
}

// --- Video-level sensitive flag ----------------------------------------------

export type { SensitiveVideoFields };

/** True when a video carries the sensitive flag (absent field = false). */
export function isSensitiveVideo(video: object): boolean {
  return (video as SensitiveVideoFields).is_sensitive === true;
}

// --- Cached instance document -------------------------------------------------
// Cross-cutting consumers (VideoCard blur/warn treatment, the watch-page scrim)
// need the instance's sensitive_content_policy without an N-per-grid fetch.
// Same module-level promise-cache pattern as lib/api/video-config.ts: one fetch
// per page load, a failure clears the cache so the next caller retries.

let cachedInstance: Promise<InstanceResponse> | null = null;

/** getInstanceCached returns GET /api/v1/instance, fetching at most once per load. */
export function getInstanceCached(): Promise<InstanceResponse> {
  if (!cachedInstance) {
    cachedInstance = api.getInstance().catch((err: unknown) => {
      cachedInstance = null;
      throw err;
    });
  }
  return cachedInstance;
}

/**
 * Forget the cached public instance document. Runtime admin-setting updates use
 * this before refetching so capability consumers never keep a pre-save gate for
 * the rest of a client-side navigation session.
 */
export function invalidateInstanceCache(): void {
  cachedInstance = null;
}

/** Test-only alias kept for existing callers. */
export function resetInstanceCacheForTests(): void {
  invalidateInstanceCache();
}
