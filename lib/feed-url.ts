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
  /** "all" mixes in federated remote videos; unset means the default (local). */
  scope?: FeedScope;
}

/**
 * feedHref builds the canonical browse URL for a sort mode + filters, keeping
 * every active filter in the query string so filtered views are shareable and
 * back/forward friendly. Recent/Popular live on the home route (?sort= only
 * when not the default), Trending on /trending. scope=all is kept explicit;
 * the default local scope stays out of the URL.
 */
export function feedHref(sort: FeedSort, filters: FeedFilters = {}): string {
  const path = sort === "trending" ? "/trending" : "/";
  const params = new URLSearchParams();
  if (sort === "popular") params.set("sort", "popular");
  if (filters.scope === "all") params.set("scope", "all");
  if (filters.category) params.set("category", filters.category);
  if (filters.language) params.set("language", filters.language);
  if (filters.tag) params.set("tag", filters.tag);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * readFeedFilters extracts the filter params from a page's searchParams,
 * normalizing empty strings to "unset". Unknown ?scope= values fall back to
 * the default local scope, mirroring the backend's normalisation.
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
    scope: sp.scope === "all" ? "all" : undefined,
  };
}
