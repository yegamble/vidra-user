"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

  const selectClass =
    "rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm text-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200";

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter results">
      <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-300">
        <span>Category</span>
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
      </label>
      <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-300">
        <span>Language</span>
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
      </label>
      {filters.tag ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 py-1 pl-3 pr-1 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
          <span className="sr-only">Filtered by tag </span>#{filters.tag}
          <Link
            href={searchHref(query, { ...filters, tag: undefined })}
            aria-label={`Remove tag filter ${filters.tag}`}
            className="flex h-5 w-5 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="h-3.5 w-3.5"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </Link>
        </span>
      ) : null}
    </div>
  );
}
