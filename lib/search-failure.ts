// The shared vocabulary for "a search-backed route did not answer".
//
// vidra-search is an OPTIONAL component: an instance that never runs it is a
// supported configuration and every other surface degrades silently. Core's
// searchHistoryGate() (vidra-core internal/httpapi/search.go) therefore answers
// such an instance with 503 search_unavailable FOREVER — the response is not a
// passing outage. Copy that says "temporarily unavailable, try again in a
// little while" over it is simply false, and a bare retry button beside it can
// never succeed.
//
// Both surfaces that speak to the search service through core — the moderator
// autosuggest-ban list and the per-user search settings — share these two
// sentences so the two can never drift into different stories about the same
// HTTP response.

/**
 * Names BOTH causes the 503 admits (offline OR never configured) and promises
 * nothing about time.
 */
export const SEARCH_SERVICE_DOWN =
  "Vidra could not reach the search service. It may be offline, or not configured on this instance.";

/**
 * Qualifies a retry that may never succeed, and names who can actually fix the
 * permanent case.
 */
export const SEARCH_RETRY_QUALIFIER =
  "Retrying helps only if this is a passing outage; an administrator can check the search service configuration.";
