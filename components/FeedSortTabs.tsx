"use client";

import { useRouter } from "next/navigation";

import type { FeedSort } from "@/lib/api";
import { feedHref, type FeedFilters } from "@/lib/feed-url";

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
}: {
  active: FeedSort;
  filters?: FeedFilters;
}) {
  const router = useRouter();
  return (
    <div
      role="group"
      aria-label="Sort videos"
      className="inline-flex items-center gap-0.5 rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-700"
    >
      {OPTIONS.map(({ sort, label }) => (
        <button
          key={sort}
          type="button"
          aria-pressed={active === sort}
          onClick={() => {
            if (sort !== active) router.push(feedHref(sort, filters));
          }}
          className={
            active === sort
              ? "rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:bg-zinc-100 dark:text-zinc-900"
              : "rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:text-zinc-300 dark:hover:bg-zinc-800"
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}
