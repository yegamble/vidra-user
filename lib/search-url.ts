/**
 * The URL-reflected search-page state: the query, which kind of result is being
 * listed, and the facets GET /videos/search accepts. Kept in the query string so
 * a sorted, filtered search is shareable and back/forward friendly, mirroring
 * lib/feed-url.ts for the browse feed.
 *
 * Two of the facets are stored as BUCKETS rather than as the numbers the API
 * takes. `duration` is a short/medium/long choice the UI offers, `published` is
 * a "last N days" choice; both expand to the API's range parameters at fetch
 * time (`searchApiFilters`). Storing the bucket, not the expansion, is what
 * makes a shared link keep meaning: `?published=7d` still means "the last week"
 * tomorrow, where a baked `published_after=2026-08-18T…` would quietly become
 * "the eight days before you opened this".
 *
 * Four facets PeerTube offers are deliberately absent — original publication
 * year, live-vs-VOD, licence, and instance host. None of them is answerable from
 * what vidra stores (there is no originally_published_at column, live streams
 * are a disjoint table from videos, licence is never projected into the search
 * index, and the index knows only local/remote). A control that silently does
 * nothing is worse than its absence, so they are not rendered at all.
 */

import type { SearchVideosParams } from "@/lib/api";

/**
 * The result kind the page is listing. Each is a separate endpoint with its own
 * pagination and count; "videos" is the default and stays out of the URL.
 */
export type SearchResultType = "videos" | "channels" | "accounts";

/**
 * Result ordering. A subset of the five spellings the endpoint accepts: the two
 * ascending forms (`published_at`, `views`) are omitted because "the oldest
 * match" and "the least watched match" are not questions a search box is asked,
 * and each extra option costs every user a decision.
 */
export type SearchSort = "relevance" | "-published_at" | "-views";

/** The length buckets the panel offers, over the API's seconds range. */
export type SearchDuration = "short" | "medium" | "long";

/** The recency buckets the panel offers, over the API's `published_after`. */
export type SearchPublished = "today" | "7d" | "30d" | "365d";

export interface SearchFilters {
  /** Taxonomy category id (GET /videos/config). */
  category?: string;
  /** Taxonomy language id (GET /videos/config). */
  language?: string;
  /** A single free-form tag — the chip a tag link lands on. */
  tag?: string;
  /** Ordering; "relevance" is the default and is never written to the URL. */
  sort?: SearchSort;
  duration?: SearchDuration;
  published?: SearchPublished;
  /** Every one of these tags must be present. */
  tagsAll?: string[];
  /** At least one of these tags must be present. */
  tagsOne?: string[];
}

/** The sort options, in the order the picker lists them. */
export const SEARCH_SORTS: readonly { value: SearchSort; label: string }[] = [
  { value: "relevance", label: "Relevance" },
  { value: "-published_at", label: "Publish date" },
  { value: "-views", label: "Views" },
];

/**
 * The duration buckets and the inclusive second bounds they expand to. The
 * boundaries partition the line rather than overlapping it (both API bounds are
 * inclusive), so a 600-second video is "4 – 10 minutes" and nothing else.
 */
export const SEARCH_DURATIONS: readonly {
  value: SearchDuration;
  label: string;
  min?: number;
  max?: number;
}[] = [
  { value: "short", label: "Under 4 minutes", max: 239 },
  { value: "medium", label: "4 – 10 minutes", min: 240, max: 600 },
  { value: "long", label: "Over 10 minutes", min: 601 },
];

/** The recency buckets and the window, in days, each looks back over. */
export const SEARCH_PUBLISHED: readonly {
  value: SearchPublished;
  label: string;
  days: number;
}[] = [
  { value: "today", label: "Today", days: 1 },
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "365d", label: "Last 365 days", days: 365 },
];

const RESULT_TYPES: readonly SearchResultType[] = ["videos", "channels", "accounts"];

function pick<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  const trimmed = value?.trim();
  return allowed.includes(trimmed as T) ? (trimmed as T) : undefined;
}

/**
 * Split a comma-joined tag list from the URL. Tags are lowercased and de-duped
 * so `?tags_all=Cats,cats` is one filter, not a query that can never match twice.
 */
function readTags(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const tags = [
    ...new Set(
      value
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  return tags.length > 0 ? tags : undefined;
}

/** The result kind a `?type=` param asks for; anything unknown means videos. */
export function readSearchType(value: string | undefined): SearchResultType {
  return pick(value, RESULT_TYPES) ?? "videos";
}

/**
 * readSearchFilters extracts the filter params from a page's searchParams (or
 * any string bag — the header combobox passes `Object.fromEntries(searchParams)`),
 * normalizing empty and unrecognised values to "unset". An unknown enum value is
 * dropped rather than forwarded: the backend answers an unrecognised sort with a
 * 400, and a hand-edited URL should degrade to the default view, not to an error.
 */
export function readSearchFilters(sp: Record<string, string | undefined>): SearchFilters {
  return {
    category: sp.category?.trim() || undefined,
    language: sp.language?.trim() || undefined,
    tag: sp.tag?.trim() || undefined,
    sort: pick(sp.sort, ["-published_at", "-views"] as const),
    duration: pick(sp.duration, ["short", "medium", "long"] as const),
    published: pick(sp.published, ["today", "7d", "30d", "365d"] as const),
    tagsAll: readTags(sp.tags_all),
    tagsOne: readTags(sp.tags_one),
  };
}

/**
 * searchHref builds the canonical /search URL for a query + result type +
 * filters. The query stays first and every active facet follows in a fixed
 * order, so the same search always produces the same link. Defaults (relevance
 * sort, the videos tab) are omitted — a plain search keeps a plain URL. An empty
 * query is preserved so the controls can render before a term is entered.
 */
export function searchHref(
  query: string,
  filters: SearchFilters = {},
  type: SearchResultType = "videos",
): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (type !== "videos") params.set("type", type);
  if (filters.category) params.set("category", filters.category);
  if (filters.language) params.set("language", filters.language);
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.sort && filters.sort !== "relevance") params.set("sort", filters.sort);
  if (filters.duration) params.set("duration", filters.duration);
  if (filters.published) params.set("published", filters.published);
  if (filters.tagsAll?.length) params.set("tags_all", filters.tagsAll.join(","));
  if (filters.tagsOne?.length) params.set("tags_one", filters.tagsOne.join(","));
  const qs = params.toString();
  return qs ? `/search?${qs}` : "/search";
}

/**
 * How many facets are narrowing the results — the count the Filters toggle
 * shows. A non-default SORT counts too: it lives inside the same collapsible
 * panel, and the badge answers "how much is this panel hiding from me", not
 * "how many predicates are applied".
 */
export function activeSearchFilterCount(filters: SearchFilters): number {
  return (
    (filters.category ? 1 : 0) +
    (filters.language ? 1 : 0) +
    (filters.tag ? 1 : 0) +
    (filters.sort && filters.sort !== "relevance" ? 1 : 0) +
    (filters.duration ? 1 : 0) +
    (filters.published ? 1 : 0) +
    (filters.tagsAll?.length ? 1 : 0) +
    (filters.tagsOne?.length ? 1 : 0)
  );
}

/**
 * The value identifying one search request — the query plus every facet that
 * rides on it. Changing it must reset the list to its first page, so the paged
 * list refetches on exactly this signature. The result TYPE is not part of it:
 * each tab holds its own list, keyed on its own endpoint.
 */
export function searchFilterKey(query: string, filters: SearchFilters): string {
  return searchHref(query, filters);
}

/**
 * Expand the URL-held buckets into the parameters GET /videos/search takes.
 * `now` is injectable so the mapping is testable without freezing the clock.
 *
 * `published_after` is computed here, at fetch time, from the stored bucket —
 * see the note at the top of this file on why the bucket, not the timestamp, is
 * what the URL holds.
 */
export function searchApiFilters(
  filters: SearchFilters,
  now: Date = new Date(),
): SearchVideosParams {
  const duration = SEARCH_DURATIONS.find((d) => d.value === filters.duration);
  const published = SEARCH_PUBLISHED.find((p) => p.value === filters.published);
  return {
    category: filters.category,
    language: filters.language,
    tag: filters.tag,
    // "relevance" is the endpoint's own default: send nothing rather than spell
    // it out, so a plain search is byte-identical to the request it was before
    // this endpoint learned to sort.
    sort: filters.sort && filters.sort !== "relevance" ? filters.sort : undefined,
    durationMin: duration?.min,
    durationMax: duration?.max,
    publishedAfter: published
      ? new Date(now.getTime() - published.days * 86_400_000).toISOString()
      : undefined,
    // Repeatable OR comma-separated, per the contract; the joined form travels
    // through the client's flat query bag without needing an array encoding.
    tagsAllOf: filters.tagsAll?.length ? filters.tagsAll.join(",") : undefined,
    tagsOneOf: filters.tagsOne?.length ? filters.tagsOne.join(",") : undefined,
  };
}
