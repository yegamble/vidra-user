import type { FeedScope, FeedSort } from "@/lib/api";

/**
 * The URL-reflected browse-feed state beyond the sort mode (home + /trending):
 * taxonomy/tag filters plus the local/all federation scope. Scope rides the
 * same object so mode switches and filter changes keep it in the query string.
 */
export interface FeedFilters {
  tag?: string;
  category?: string;
  language?: string;
  /** "all"/"local" when the URL pins a scope; unset means the effective default. */
  scope?: FeedScope;
}

/**
 * The defaults a browse URL is built AGAINST (config-parity W5): params equal
 * to the effective default stay out of the URL, params that differ are kept
 * explicit so they win over the default on the next render. The server pages
 * derive this from the instance snapshot (landing-aware) and thread it to the
 * feed controls; omitted, it is the shipped recent/local pair — producing
 * exactly the pre-W5 URLs.
 */
export interface FeedUrlDefaults {
  sort: FeedSort;
  scope: FeedScope;
}

export const SHIPPED_FEED_URL_DEFAULTS: FeedUrlDefaults = { sort: "recent", scope: "local" };

/**
 * feedHref builds the canonical browse URL for a sort mode + filters, keeping
 * every active filter in the query string so filtered views are shareable and
 * back/forward friendly. Recent/Popular live on the home route, Trending on
 * /trending. The sort param appears only when it differs from the effective
 * default (?sort= was historically "not recent"; with an operator-configured
 * default_feed_sort the baseline is dynamic), and likewise a set scope is kept
 * explicit exactly when it differs from the effective default scope.
 */
export function feedHref(
  sort: FeedSort,
  filters: FeedFilters = {},
  defaults: FeedUrlDefaults = SHIPPED_FEED_URL_DEFAULTS,
): string {
  const path = sort === "trending" ? "/trending" : "/";
  const params = new URLSearchParams();
  if (sort !== "trending" && sort !== defaults.sort) params.set("sort", sort);
  if (filters.scope && filters.scope !== defaults.scope) params.set("scope", filters.scope);
  if (filters.category) params.set("category", filters.category);
  if (filters.language) params.set("language", filters.language);
  if (filters.tag) params.set("tag", filters.tag);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * readFeedFilters extracts the filter params from a page's searchParams,
 * normalizing empty strings to "unset". Both scope values are kept when
 * explicit — ?scope=local must beat an instance default of "all" (W5) —
 * while unknown ?scope= values fall back to the effective default.
 */
export function readFeedFilters(sp: {
  tag?: string;
  category?: string;
  language?: string;
  scope?: string;
}): FeedFilters {
  return {
    tag: sp.tag?.trim() || undefined,
    category: sp.category?.trim() || undefined,
    language: sp.language?.trim() || undefined,
    scope: sp.scope === "all" || sp.scope === "local" ? sp.scope : undefined,
  };
}
