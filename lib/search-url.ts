/**
 * The URL-reflected search-page state: the query plus the same taxonomy/tag
 * filters the home feed exposes (category/language ids from GET /videos/config,
 * a free-form tag). Kept in the query string so a filtered search is shareable
 * and back/forward friendly, mirroring lib/feed-url.ts for the browse feed.
 */
export interface SearchFilters {
  category?: string;
  language?: string;
  tag?: string;
}

/**
 * searchHref builds the canonical /search URL for a query + filters, keeping the
 * query first (`q`) and every active filter in the query string. An empty query
 * is preserved (the page shows its prompt) so the controls can render before a
 * term is entered.
 */
export function searchHref(query: string, filters: SearchFilters = {}): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (filters.category) params.set("category", filters.category);
  if (filters.language) params.set("language", filters.language);
  if (filters.tag) params.set("tag", filters.tag);
  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
}

/**
 * readSearchFilters extracts the filter params from the page's searchParams,
 * normalizing empty strings to "unset".
 */
export function readSearchFilters(sp: {
  category?: string;
  language?: string;
  tag?: string;
}): SearchFilters {
  return {
    category: sp.category?.trim() || undefined,
    language: sp.language?.trim() || undefined,
    tag: sp.tag?.trim() || undefined,
  };
}
