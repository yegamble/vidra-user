import { SearchField } from "@/components/SearchField";
import { SearchFilters } from "@/components/SearchFilters";
import { SearchResults } from "@/components/SearchResults";
import { readSearchFilters } from "@/lib/search-url";

// The search page. The query AND the category/language/tag filters (the same
// controls the home feed exposes) live in the URL so a filtered search is
// shareable and back-button friendly; the controls push a new URL and this
// server page re-reads searchParams and remounts the results.
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; language?: string; tag?: string }>;
}) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const filters = readSearchFilters(sp);
  const resultsKey = [query, filters.category ?? "", filters.language ?? "", filters.tag ?? ""].join(
    "|",
  );
  // max-w-4xl: search results are a dense list (thumbnail-left rows), so the
  // page keeps a comfortable reading measure instead of the grid pages' 7xl.
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-4 sm:py-6">
      {/* The inline search field is the page's primary control (and the only
          search input on phones); the visible heading is redundant with it, so
          the page title stays for the accessibility tree only. */}
      <h1 className="sr-only">{query ? `Search results for “${query}”` : "Search"}</h1>
      <div className="mb-3">
        <SearchField query={query} filters={filters} />
      </div>
      <div className="mb-3 sm:mb-4">
        <SearchFilters query={query} filters={filters} />
      </div>
      <SearchResults key={resultsKey} query={query} filters={filters} />
    </main>
  );
}
