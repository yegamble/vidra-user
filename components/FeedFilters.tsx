"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ChevronDownIcon, CloseIcon } from "@/components/icons";
import type { FeedSort, VideoConfigResponse } from "@/lib/api";
import { getVideoConfigCached } from "@/lib/api/video-config";
import { feedHref, type FeedFilters as Filters, type FeedUrlDefaults } from "@/lib/feed-url";

// FeedFilters is the browse feed's filter row (home + /trending): category and
// language selects populated from the shared GET /videos/config taxonomy, plus
// a removable chip for an active ?tag= filter (tags are entered by following a
// tag chip from a watch page, not typed here). Every change is pushed to the
// URL (feedHref) so filtered views are shareable and back/forward friendly —
// the server page re-reads searchParams and remounts the feed. The selects
// stay disabled until the taxonomy arrives; if it fails to load they stay
// disabled (the feed itself is unaffected) — an active tag chip still renders.
export function FeedFilters({
  sort,
  filters,
  urlDefaults,
}: {
  sort: FeedSort;
  filters: Filters;
  /** The instance's effective feed defaults — the URL baseline (config-parity W5). */
  urlDefaults?: FeedUrlDefaults;
}) {
  const router = useRouter();
  const [config, setConfig] = useState<VideoConfigResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    getVideoConfigCached()
      .then((c) => {
        if (!cancelled) setConfig(c);
      })
      .catch(() => {
        // Selects stay disabled; browsing without filters still works.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function apply(next: Partial<Filters>) {
    router.push(feedHref(sort, { ...filters, ...next }, urlDefaults));
  }

  // Pill-styled native selects (appearance-none + overlaid chevron) so the
  // filters speak the same visual language as the segmented control and sort
  // chips beside them, instead of default browser select chrome.
  const selectClass =
    "focus-ring min-h-11 appearance-none rounded-full border border-border bg-surface-raised py-1.5 pl-3.5 pr-8 text-[13px] font-semibold text-fg disabled:opacity-60 sm:min-h-9";

  return (
    <div
      className="flex flex-nowrap items-center gap-2 sm:flex-wrap"
      role="group"
      aria-label="Filter videos"
    >
      <label className="flex shrink-0 items-center gap-2 text-[13px] text-fg-muted">
        <span>Category</span>
        <span className="relative inline-flex items-center">
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
            strokeWidth={2.2}
            className="pointer-events-none absolute right-3 text-fg-muted"
          />
        </span>
      </label>
      <label className="flex shrink-0 items-center gap-2 text-[13px] text-fg-muted">
        <span>Language</span>
        <span className="relative inline-flex items-center">
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
            strokeWidth={2.2}
            className="pointer-events-none absolute right-3 text-fg-muted"
          />
        </span>
      </label>
      {filters.tag ? (
        <span className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-surface-raised py-1 pl-3 pr-1 text-[13px] font-semibold text-fg sm:min-h-9">
          <span className="sr-only">Filtered by tag </span>#{filters.tag}
          <Link
            href={feedHref(sort, { ...filters, tag: undefined }, urlDefaults)}
            aria-label={`Remove tag filter ${filters.tag}`}
            className="focus-ring flex h-11 w-11 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-strong hover:text-fg sm:h-7 sm:w-7"
          >
            <CloseIcon size={14} strokeWidth={2} />
          </Link>
        </span>
      ) : null}
    </div>
  );
}
