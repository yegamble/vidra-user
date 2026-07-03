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
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">
        {query ? `Results for “${query}”` : "Search"}
      </h1>
      <div className="mb-6">
        <SearchFilters query={query} filters={filters} />
      </div>
      <SearchResults key={resultsKey} query={query} filters={filters} />
    </main>
  );
}
