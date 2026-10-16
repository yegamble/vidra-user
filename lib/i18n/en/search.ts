export const search = {
  // Search & discovery (search-service W4). A11y-facing strings for the
  // autocomplete combobox, the results personalization hint, and the settings
  // surface. Kept plain so the whole catalog stays swappable per-locale.
  "search.inputLabel": "Search videos",
  "search.placeholder": "Search videos, channels, tags",
  // Exactly one role="search" landmark app-wide now — the header box does all
  // searching. The landmark is "Search" and the input's own name is "Search
  // videos", so getByLabel("Search videos") resolves unambiguously to the field.
  "search.landmark": "Search",
  // Phone affordances: the header search icon button and the sheet's back button.
  "search.open": "Search",
  "search.close": "Close search",
  "search.clear": "Clear search",
  "search.suggestionsLabel": "Search suggestions",
  "search.suggestions": { one: "{count} suggestion available", other: "{count} suggestions available" },
  "search.removeHistory": "Remove “{query}” from your search history",
  // Grouped-section headers and per-row type labels in the suggestion panel.
  "search.groupVideos": "Videos",
  "search.groupChannels": "Channels",
  "search.groupTags": "Tags",
  "search.typeVideo": "Video",
  "search.typeChannel": "Channel",
  "search.typeTag": "Tag",
  "search.personalizedHint": "Results are personalized for you.",
  "search.personalizedManage": "Manage",
} as const;
