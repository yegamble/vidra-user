// Browse, landing & feed defaults resolution (config-parity W5; contract:
// .ralph/specs/config-parity/instance-contract.md `defaults{}`). Pure module —
// shared by the server pages ('/' landing switch, /trending scope fallback)
// and unit-testable in isolation.
//
// Precedence, everywhere: an explicit URL param always wins; then the
// operator-configured instance default (GET /instance defaults.*, absent when
// the backend predates W1 or is unreachable); then today's shipped hardcoded
// fallback — so a missing snapshot reproduces the pre-W5 behavior exactly.

import type { FeedScope, FeedSort } from "@/lib/api";
import type { InstanceDefaultsBlock } from "@/lib/instance-config.server";

/** The shipped fallbacks (pre-W5 behavior; also vidra-core's config defaults). */
export const FALLBACK_FEED_SORT: FeedSort = "recent";
export const FALLBACK_FEED_SCOPE: FeedScope = "local";

/** What "/" shows a visitor who expressed no preference of their own. */
export type LandingPage = "home-recent" | "trending" | "local" | "home";

function isFeedSort(value: unknown): value is FeedSort {
  return value === "recent" || value === "popular" || value === "trending";
}

function isFeedScope(value: unknown): value is FeedScope {
  return value === "local" || value === "all";
}

/**
 * The active feed sort: a valid explicit ?sort= wins, else the caller's
 * effective default (the landing-aware instance default), else recent —
 * unknown values fall back, mirroring the backend's normalisation.
 */
export function resolveFeedSort(
  urlSort: string | undefined,
  fallback: FeedSort = FALLBACK_FEED_SORT,
): FeedSort {
  return isFeedSort(urlSort) ? urlSort : fallback;
}

/**
 * The active feed scope: a valid explicit ?scope= wins, else the caller's
 * effective default, else local.
 */
export function resolveFeedScope(
  urlScope: string | undefined,
  fallback: FeedScope = FALLBACK_FEED_SCOPE,
): FeedScope {
  return isFeedScope(urlScope) ? urlScope : fallback;
}

/**
 * The operator's landing-page choice, normalized. Unknown/absent values (old
 * backend, no snapshot) mean home-recent — today's behavior.
 */
export function resolveLandingPage(defaults?: InstanceDefaultsBlock | null): LandingPage {
  const value = defaults?.landing_page;
  return value === "trending" || value === "local" || value === "home" || value === "home-recent"
    ? value
    : "home-recent";
}

/**
 * The effective feed defaults "/" applies when the URL specifies nothing:
 * the landing-page switch layered over the instance browse defaults.
 *
 *   home-recent → the operator's feed_sort/feed_scope (the plain default feed)
 *   trending    → the trending surface, rendered at "/" (no client redirect)
 *   local       → the feed pinned to this instance's own videos
 *   home        → the admin homepage document — W6 adds that branch in
 *                 app/page.tsx; until it ships (homepage.enabled) this maps to
 *                 home-recent so the option is never a dead end.
 *
 * These are DEFAULTS, not forces: explicit ?sort=/?scope= params still win in
 * the callers' resolve* step above.
 */
export function feedDefaultsForLanding(
  landing: LandingPage,
  defaults?: InstanceDefaultsBlock | null,
): { sort: FeedSort; scope: FeedScope } {
  const sort = isFeedSort(defaults?.feed_sort) ? defaults.feed_sort : FALLBACK_FEED_SORT;
  const scope = isFeedScope(defaults?.feed_scope) ? defaults.feed_scope : FALLBACK_FEED_SCOPE;
  switch (landing) {
    case "trending":
      return { sort: "trending", scope };
    case "local":
      return { sort, scope: "local" };
    case "home": // W6 renders the homepage document; the feed fallback is home-recent
    case "home-recent":
      return { sort, scope };
  }
}
