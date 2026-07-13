"use client";

import { SearchAutocomplete } from "@/components/SearchAutocomplete";
import { t } from "@/lib/i18n";
import type { InstanceSearchBlock } from "@/lib/instance-config.server";
import type { SearchFilters } from "@/lib/search-url";

// The search page's inline search field (design "Vidra App" SEARCH screen): the
// SearchAutocomplete combobox in its "field" variant — a quiet field on the
// muted surface with a search glyph and a clear (×) button. This is the ONLY
// search input on phones (the header search box is desktop-only), so the Search
// tab lands here and the query is typed in this field. Submitting navigates to
// /search, preserving the active category/language/tag filters (the server page
// re-reads searchParams and remounts the results); an empty submit clears the
// results back to the prompt.
//
// This landmark is labelled distinctly from the desktop header's search landmark
// so the two role="search" regions stay unique.
export function SearchField({
  query,
  filters = {},
  search,
}: {
  query: string;
  filters?: SearchFilters;
  search?: InstanceSearchBlock;
}) {
  return (
    <SearchAutocomplete
      variant="field"
      landmarkLabel={t("search.landmarkPage")}
      initialQuery={query}
      filters={filters}
      submitEmpty
      suggestionsEnabled={search?.suggestions_enabled !== false}
    />
  );
}
