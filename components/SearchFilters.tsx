"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ChevronDownIcon, CloseIcon } from "@/components/icons";
import type { VideoConfigResponse } from "@/lib/api";
import { getVideoConfigCached } from "@/lib/api/video-config";
import { searchHref, type SearchFilters as Filters } from "@/lib/search-url";

// SearchFilters is the search page's filter row — the same category/language
// selects (from the shared GET /videos/config taxonomy) and removable ?tag=
// chip the home feed exposes (components/FeedFilters.tsx), but pushing to
// searchHref so the query is preserved. Every change is reflected in the URL so
// filtered searches are shareable and back/forward friendly; the server page
// re-reads searchParams and remounts the results. The selects stay disabled
// until the taxonomy arrives (and if it fails to load), so an active tag chip
// still renders and searching without filters keeps working.
//
// Presentation follows the template's SEARCH filter-chip row: a single
// horizontally scrollable strip of pill-shaped controls on mobile (wrapping on
// wider viewports). The selects stay native selects (converting them to chips
// would change the form semantics the tests pin) restyled as rounded-xl
// fields; the active ?tag= filter renders as an accent-filled pill chip.
export function SearchFilters({ query, filters }: { query: string; filters: Filters }) {
  const router = useRouter();
  const [config, setConfig] = useState<VideoConfigResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    getVideoConfigCached()
      .then((c) => {
        if (!cancelled) setConfig(c);
      })
      .catch(() => {
        // Selects stay disabled; searching without filters still works.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function apply(next: Partial<Filters>) {
    router.push(searchHref(query, { ...filters, ...next }));
  }

  // Pill-shaped filter chips (design SEARCH filter row): rounded-full controls on
  // a scrollable strip. Kept as native selects (the form semantics the tests pin)
  // rather than bespoke chips.
  const selectClass =
    "appearance-none rounded-full border border-border bg-surface py-1.5 pl-3 pr-8 text-[13px] font-semibold text-fg transition-colors hover:bg-surface-muted focus-ring disabled:opacity-50";

  return (
    <div
      className="flex items-center gap-2 overflow-x-auto py-1 sm:flex-wrap"
      role="group"
      aria-label="Filter results"
    >
      <label className="flex flex-none items-center gap-1.5 text-[13px] text-fg-muted">
        <span>Category</span>
        <span className="relative flex">
          <select
            value={filters.category ?? ""}
            onChange={(e) => apply({ category: e.target.value || undefined })}
            aria-label="Filter by category"
            disabled={config === null}
            className={selectClass}
          >
            <option value="">All</option>
            {(config?.categories ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDownIcon
            size={14}
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-muted"
          />
        </span>
      </label>
      <label className="flex flex-none items-center gap-1.5 text-[13px] text-fg-muted">
        <span>Language</span>
        <span className="relative flex">
          <select
            value={filters.language ?? ""}
            onChange={(e) => apply({ language: e.target.value || undefined })}
            aria-label="Filter by language"
            disabled={config === null}
            className={selectClass}
          >
            <option value="">All</option>
            {(config?.languages ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDownIcon
            size={14}
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-muted"
          />
        </span>
      </label>
      {filters.tag ? (
        <span className="inline-flex flex-none items-center gap-1 rounded-full bg-accent py-1.5 pl-3 pr-1 text-xs font-semibold text-accent-fg">
          <span className="sr-only">Filtered by tag </span>#{filters.tag}
          <Link
            href={searchHref(query, { ...filters, tag: undefined })}
            aria-label={`Remove tag filter ${filters.tag}`}
            className="focus-ring flex h-6 w-6 items-center justify-center rounded-full text-accent-fg transition-colors hover:bg-accent-fg/20"
          >
            <CloseIcon size={14} strokeWidth={2} />
          </Link>
        </span>
      ) : null}
    </div>
  );
}
