"use client";

import { useRouter } from "next/navigation";

import type { FeedScope, FeedSort } from "@/lib/api";
import { feedHref, type FeedFilters } from "@/lib/feed-url";

const OPTIONS: { scope: FeedScope; label: string }[] = [
  { scope: "local", label: "Local" },
  { scope: "all", label: "All" },
];

// FeedScopeToggle is the home feed's federation-scope switcher (segmented
// buttons with aria-pressed, same pattern as FeedSortTabs): Local shows only
// this instance's videos (the default), All mixes in federated remote videos
// for discovery. The active scope lives in the URL (?scope=all; local stays
// implicit) so scoped views are shareable and back/forward friendly — clicking
// pushes a new URL and the server page remounts the feed. Active sort/filters
// ride along via feedHref.
export function FeedScopeToggle({
  active,
  sort,
  filters = {},
}: {
  active: FeedScope;
  sort: FeedSort;
  filters?: FeedFilters;
}) {
  const router = useRouter();
  return (
    <div
      role="group"
      aria-label="Feed scope"
      className="inline-flex items-center gap-0.5 rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-700"
    >
      {OPTIONS.map(({ scope, label }) => (
        <button
          key={scope}
          type="button"
          aria-pressed={active === scope}
          onClick={() => {
            if (scope !== active) {
              router.push(
                feedHref(sort, { ...filters, scope: scope === "all" ? "all" : undefined }),
              );
            }
          }}
          className={
            active === scope
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
