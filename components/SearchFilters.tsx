"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { CloseIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { FilterChipGroup } from "@/components/ui/FilterChips";
import { FilterField, FilterPanel } from "@/components/ui/FilterPanel";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { VideoConfigResponse } from "@/lib/api";
import { getVideoConfigCached } from "@/lib/api/video-config";
import {
  SEARCH_DURATIONS,
  SEARCH_PUBLISHED,
  SEARCH_SORTS,
  activeSearchFilterCount,
  searchHref,
  type SearchDuration,
  type SearchFilters as Filters,
  type SearchPublished,
  type SearchResultType,
  type SearchSort,
} from "@/lib/search-url";

// SearchFilters is the search page's facet disclosure: a "Filters" toggle
// carrying the applied count, revealing a two-column panel of every facet
// GET /videos/search accepts. It replaces the always-visible category/language
// strip — three controls fitted on one line, which is why the endpoint's sort,
// duration, publish window and multi-tag facets had nowhere to live.
//
// Every change is reflected in the URL (searchHref keeps the query and the
// active result tab), so a filtered search is shareable and back/forward
// friendly; the server page re-reads searchParams and the results refetch. The
// taxonomy selects stay disabled until GET /videos/config arrives (and if it
// fails to load), so searching without them keeps working.
//
// Four PeerTube facets are deliberately absent rather than present-and-inert —
// original publication year, live-vs-VOD, licence, instance host. See the note
// at the top of lib/search-url.ts for what vidra does not store for each.
export function SearchFilters({
  query,
  filters,
  type = "videos",
}: {
  query: string;
  filters: Filters;
  /** The active result tab, so applying a filter does not silently change it. */
  type?: SearchResultType;
}) {
  const router = useRouter();
  const [config, setConfig] = useState<VideoConfigResponse | null>(null);
  // The tag inputs are free text, so they are drafts until submitted: rewriting
  // the URL on every keystroke would fire a search per letter and put half a
  // word in the address bar.
  const [tagsAllDraft, setTagsAllDraft] = useState(filters.tagsAll?.join(", ") ?? "");
  const [tagsOneDraft, setTagsOneDraft] = useState(filters.tagsOne?.join(", ") ?? "");

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
    router.push(searchHref(query, { ...filters, ...next }, type));
  }

  function applyTags(key: "tagsAll" | "tagsOne", draft: string) {
    const tags = draft
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    apply({ [key]: tags.length > 0 ? tags : undefined });
  }

  const activeCount = activeSearchFilterCount(filters);

  return (
    <div className="flex flex-col gap-2">
      {/* The single ?tag= filter stays OUTSIDE the panel, above the toggle: it
          is how a tag link from a watch page arrives here, and a filter the
          viewer did not set must be visible — and removable — without opening
          anything. */}
      {filters.tag ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex flex-none items-center gap-1 rounded-full bg-accent py-1.5 pl-3 pr-1 text-xs font-semibold text-accent-fg">
            <span className="sr-only">Filtered by tag </span>#{filters.tag}
            <Link
              href={searchHref(query, { ...filters, tag: undefined }, type)}
              aria-label={`Remove tag filter ${filters.tag}`}
              className="focus-ring flex h-6 w-6 items-center justify-center rounded-full text-accent-fg transition-colors hover:bg-accent-fg/20"
            >
              <CloseIcon size={14} strokeWidth={2} />
            </Link>
          </span>
        </div>
      ) : null}
      <FilterPanel
        activeCount={activeCount}
        // Arriving on a filtered link opens the panel: the badge says something
        // is applied, and the panel is where you find out what.
        defaultOpen={activeCount > 0}
        columns={2}
        className="w-full"
        footer={
          activeCount > 0 ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setTagsAllDraft("");
                setTagsOneDraft("");
                router.push(searchHref(query, {}, type));
              }}
            >
              Clear filters
            </Button>
          ) : null
        }
      >
        <FilterField
          label="Sort by"
          render={(id) => (
            <FilterChipGroup<SearchSort>
              labelledBy={id}
              size="sm"
              options={SEARCH_SORTS}
              value={filters.sort ?? "relevance"}
              onChange={(next) => apply({ sort: next === "relevance" ? undefined : next })}
            />
          )}
        />
        <FilterField
          label="Duration"
          hint="A video whose length was never probed matches no bucket."
          render={(id) => (
            <FilterChipGroup<SearchDuration | "">
              labelledBy={id}
              size="sm"
              options={[{ value: "", label: "Any" }, ...SEARCH_DURATIONS]}
              value={filters.duration ?? ""}
              onChange={(next) => apply({ duration: next || undefined })}
            />
          )}
        />
        <FilterField
          label="Published"
          render={(id) => (
            <FilterChipGroup<SearchPublished | "">
              labelledBy={id}
              size="sm"
              options={[{ value: "", label: "Any time" }, ...SEARCH_PUBLISHED]}
              value={filters.published ?? ""}
              onChange={(next) => apply({ published: next || undefined })}
            />
          )}
        />
        <Select
          label="Category"
          value={filters.category ?? ""}
          onChange={(e) => apply({ category: e.target.value || undefined })}
          disabled={config === null}
        >
          <option value="">All</option>
          {(config?.categories ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
        <Select
          label="Language"
          value={filters.language ?? ""}
          onChange={(e) => apply({ language: e.target.value || undefined })}
          disabled={config === null}
        >
          <option value="">All</option>
          {(config?.languages ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
        {/* Both tag fields are comma-separated lists, applied on Enter or blur.
            "All of" and "one of" are separate parameters, not one control with a
            mode switch: they compose (every documentary tagged either 1970s or
            1980s) and a mode switch would make that unaskable. */}
        <Input
          label="All of these tags"
          placeholder="ocean, deep sea"
          hint="Comma separated. Press Enter to apply."
          value={tagsAllDraft}
          onChange={(e) => setTagsAllDraft(e.target.value)}
          onBlur={() => applyTags("tagsAll", tagsAllDraft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              applyTags("tagsAll", tagsAllDraft);
            }
          }}
        />
        <Input
          label="One of these tags"
          placeholder="1970s, 1980s"
          hint="Comma separated. Press Enter to apply."
          value={tagsOneDraft}
          onChange={(e) => setTagsOneDraft(e.target.value)}
          onBlur={() => applyTags("tagsOne", tagsOneDraft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              applyTags("tagsOne", tagsOneDraft);
            }
          }}
        />
      </FilterPanel>
    </div>
  );
}
