import { SearchResults } from "@/components/SearchResults";
import { getInstanceConfig } from "@/lib/instance-config.server";
import {
  readSearchFilters,
  readSearchType,
  type SearchParamValue,
} from "@/lib/search-url";

// The search page. The query, the result type (videos / channels / accounts)
// and every facet live in the URL so a sorted, filtered search is shareable and
// back-button friendly; the controls push a new URL and this server page
// re-reads searchParams.
//
// There is no remount key here any more. The results component derives its
// loading state from the query signature (lib/use-appending-list), so a filter
// change swaps to the skeleton and resets to page one on its own — and the
// filter panel, which used to be remounted (and so collapsed) by every change
// it made, stays open.
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchParamValue>>;
}) {
  const sp = await searchParams;
  // A repeated ?q= arrives as an array; take the last, never `.trim()` an array.
  const query = (Array.isArray(sp.q) ? sp.q.at(-1) ?? "" : sp.q ?? "").trim();
  const filters = readSearchFilters(sp);
  const type = readSearchType(sp.type);
  // The SSR snapshot's search{} block: the W13 remote-URI gates drive the
  // results component's URL/handle help text; the search-service W4 gates drive
  // the autocomplete (suggestions_enabled) and the personalization hint (mode).
  // Absent on an older backend / when the fetch fails — every feature then stays
  // dark.
  const search = (await getInstanceConfig())?.search;
  // max-w-4xl: search results are a dense list (thumbnail-left rows), so the
  // page keeps a comfortable reading measure instead of the grid pages' 7xl.
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-4 sm:py-6">
      {/* There is no inline search field: the app header owns the single site
          search box (it reflects this page's `q` and threads these filters onto
          every navigation). The page title stays for the accessibility tree
          only. */}
      <h1 className="sr-only">{query ? `Search results for “${query}”` : "Search"}</h1>
      <SearchResults query={query} filters={filters} type={type} remoteSearch={search} />
    </main>
  );
}
