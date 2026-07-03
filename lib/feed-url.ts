import type { FeedSort } from "@/lib/api";

/** The URL-reflected browse-feed filters (home + /trending). */
export interface FeedFilters {
  tag?: string;
  category?: string;
  language?: string;
}

/**
 * feedHref builds the canonical browse URL for a sort mode + filters, keeping
 * every active filter in the query string so filtered views are shareable and
 * back/forward friendly. Recent/Popular live on the home route (?sort= only
 * when not the default), Trending on /trending.
 */
export function feedHref(sort: FeedSort, filters: FeedFilters = {}): string {
  const path = sort === "trending" ? "/trending" : "/";
  const params = new URLSearchParams();
  if (sort === "popular") params.set("sort", "popular");
  if (filters.category) params.set("category", filters.category);
  if (filters.language) params.set("language", filters.language);
  if (filters.tag) params.set("tag", filters.tag);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * readFeedFilters extracts the filter params from a page's searchParams,
 * normalizing empty strings to "unset".
 */
export function readFeedFilters(sp: {
  tag?: string;
  category?: string;
  language?: string;
}): FeedFilters {
  return {
    tag: sp.tag?.trim() || undefined,
    category: sp.category?.trim() || undefined,
    language: sp.language?.trim() || undefined,
  };
}
