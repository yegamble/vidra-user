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
    <div role="group" aria-label="Sort videos" className="inline-flex items-center gap-2">
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
              ? "focus-ring rounded-full border border-accent bg-accent px-4 py-1.5 text-[13px] font-semibold text-accent-fg transition-colors"
              : "focus-ring rounded-full border border-border px-4 py-1.5 text-[13px] font-semibold text-fg-muted transition-colors hover:bg-surface-muted"
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}
