"use client";

import { SearchAutocomplete } from "@/components/SearchAutocomplete";
import { t } from "@/lib/i18n";
import type { InstanceSearchBlock } from "@/lib/instance-config.server";

// Header search box (design template: a quiet pill on the muted surface).
// Submitting navigates to /search?q=… (the results page reads the query from the
// URL). This is the SearchAutocomplete combobox in its "header" variant: quiet
// pill, no empty submit. Autocomplete fetches only when the instance's search
// block advertises suggestions_enabled (undefined on an older backend → the
// combobox degrades to a plain search field). The `search` gates ride down from
// the SSR instance snapshot via the Header.
export function SearchBox({ search }: { search?: InstanceSearchBlock }) {
  return (
    <SearchAutocomplete
      variant="header"
      landmarkLabel={t("search.landmarkHeader")}
      suggestionsEnabled={search?.suggestions_enabled !== false}
    />
  );
}
