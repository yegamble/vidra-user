"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { CloseIcon, SearchIcon } from "@/components/icons";
import { searchHref, type SearchFilters } from "@/lib/search-url";

// The search page's inline search field (design "Vidra App" SEARCH screen): a
// quiet field on the muted surface with a search glyph and a clear (×) button.
// This is the ONLY search input on phones — the header search box is desktop-only
// (sm+), so the Search tab lands here and the query is typed in this field.
// Submitting navigates to /search, preserving the active category/language/tag
// filters (the server page re-reads searchParams and remounts the results).
export function SearchField({
  query,
  filters = {},
}: {
  query: string;
  filters?: SearchFilters;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(query);

  // Re-seed the editable draft when the committed query changes (deep link,
  // header search, or the clear button navigating to a blank query). Adjusting
  // state during render — not in an effect — avoids a cascading re-render.
  const [committed, setCommitted] = useState(query);
  if (query !== committed) {
    setCommitted(query);
    setValue(query);
  }

  function submit(next: string) {
    router.push(searchHref(next.trim(), filters));
  }

  function clear() {
    setValue("");
    inputRef.current?.focus();
    // If a query was committed, clear the results too (back to the prompt).
    if (query) submit("");
  }

  return (
    <form
      role="search"
      // The desktop header also exposes a search landmark; label this one so the
      // two remain distinguishable (unique landmarks) on the search page.
      aria-label="Search"
      onSubmit={(e) => {
        e.preventDefault();
        submit(value);
      }}
    >
      <div className="flex items-center gap-2.5 rounded-xl bg-surface-muted px-3.5 py-2.5 transition-colors focus-within:bg-surface-strong/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus">
        <SearchIcon size={17} strokeWidth={2} className="shrink-0 text-fg-muted" />
        <input
          ref={inputRef}
          type="search"
          name="q"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search videos, channels, tags"
          aria-label="Search videos"
          // Hide the native WebKit clear affordance — we render our own × button.
          className="w-full bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-muted [&::-webkit-search-cancel-button]:appearance-none"
        />
        {value ? (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="focus-ring -mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:text-fg"
          >
            <CloseIcon size={16} strokeWidth={2} />
          </button>
        ) : null}
      </div>
    </form>
  );
}
