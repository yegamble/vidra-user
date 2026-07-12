"use client";

import { useRouter } from "next/navigation";

import type { FeedSort } from "@/lib/api";
import { feedHref, type FeedFilters, type FeedUrlDefaults } from "@/lib/feed-url";

const OPTIONS: { sort: FeedSort; label: string }[] = [
  { sort: "recent", label: "Recent" },
  { sort: "popular", label: "Popular" },
  { sort: "trending", label: "Trending" },
];

// FeedSortTabs is the browse feed's sort switcher (segmented buttons with
// aria-pressed), shared by the home page and /trending. The active mode lives
// in the URL so it is shareable and back/forward friendly: Recent/Popular are
// home-feed modes (/, /?sort=popular) and Trending is its own route
// (/trending; the home page still honours a ?sort=trending deep link). Active
// tag/category/language filters ride along on a mode switch (feedHref keeps
// them in the query string). Clicking pushes a history entry and the server
// page re-renders the heading + remounts the feed; this control itself never
// remounts, so focus stays on the pressed button.
export function FeedSortTabs({
  active,
  filters = {},
  urlDefaults,
}: {
  active: FeedSort;
  filters?: FeedFilters;
  /**
   * The instance's effective feed defaults (config-parity W5) — the URL
   * baseline: a pick matching the default keeps the pretty bare URL, a pick
   * differing from it stays explicit so it wins over the operator default.
   */
  urlDefaults?: FeedUrlDefaults;
}) {
  const router = useRouter();
  return (
    <div
      role="group"
      aria-label="Sort videos"
      className="grid w-full grid-cols-3 items-center gap-2 sm:inline-flex sm:w-auto"
    >
      {OPTIONS.map(({ sort, label }) => (
        <button
          key={sort}
          type="button"
          aria-pressed={active === sort}
          onClick={() => {
            if (sort !== active) router.push(feedHref(sort, filters, urlDefaults));
          }}
          className={
            active === sort
              ? "focus-ring min-h-11 rounded-full border border-accent bg-accent px-3 py-1.5 text-[13px] font-semibold text-accent-fg shadow-[0_2px_10px_rgba(0,0,0,0.14)] transition-[background-color,color,box-shadow] sm:min-h-9 sm:px-4"
              : "focus-ring min-h-11 rounded-full border border-border bg-canvas/65 px-3 py-1.5 text-[13px] font-semibold text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg sm:min-h-9 sm:px-4"
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}
