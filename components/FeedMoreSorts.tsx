"use client";

import { useRouter } from "next/navigation";

import { ChevronDownIcon } from "@/components/icons";
import type { FeedSort } from "@/lib/api";
import { feedHref, type FeedFilters, type FeedUrlDefaults } from "@/lib/feed-url";

// The orderings beyond the three Recent/Popular/Trending tabs (PeerTube parity).
// They live in a select rather than three more chips so the tab group keeps its
// three-button shape; the pick is URL-backed (?sort=name) like every other
// feed control. "hot" is not offered - see vidra-core's feedSorts.
export const MORE_SORT_OPTIONS: { sort: FeedSort; label: string }[] = [
  { sort: "originally_published_at", label: "Original date" },
  { sort: "name", label: "Name (A–Z)" },
];

// FeedMoreSorts: while a tab mode is active the select rests on its
// placeholder ("More sorts"); when one of its own modes is active it shows that
// mode, and the three tabs show none pressed. Picking the placeholder does
// nothing - go back by pressing a tab.
export function FeedMoreSorts({
  active,
  filters = {},
  urlDefaults,
}: {
  active: FeedSort;
  filters?: FeedFilters;
  urlDefaults?: FeedUrlDefaults;
}) {
  const router = useRouter();
  const current = MORE_SORT_OPTIONS.some((o) => o.sort === active) ? active : "";
  return (
    <span className="relative inline-flex shrink-0 items-center">
      <select
        value={current}
        aria-label="More sort orders"
        onChange={(e) => {
          const next = MORE_SORT_OPTIONS.find((o) => o.sort === e.target.value);
          if (next && next.sort !== active) router.push(feedHref(next.sort, filters, urlDefaults));
        }}
        className="focus-ring min-h-11 appearance-none rounded-full border border-border bg-surface-raised py-1.5 pl-3.5 pr-8 text-[13px] font-semibold text-fg sm:min-h-9"
      >
        <option value="" disabled>
          More sorts
        </option>
        {MORE_SORT_OPTIONS.map((o) => (
          <option key={o.sort} value={o.sort}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon
        size={14}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted"
      />
    </span>
  );
}
