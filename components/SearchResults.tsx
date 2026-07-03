"use client";

import { useEffect, useState } from "react";

import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadMoreButton, PAGE_SIZE } from "@/components/ui/LoadMoreButton";
import { Spinner } from "@/components/ui/Spinner";
import { VideoCard } from "@/components/VideoCard";
import { api } from "@/lib/api";
import type { Video } from "@/lib/api";
import type { SearchFilters } from "@/lib/search-url";

type Status = "idle" | "loading" | "error" | "ready";
type MoreStatus = "idle" | "loading" | "error";

// SearchResults loads public title/tag-search results client-side, with a "Load
// more" pager (limit/offset; the pager hides once a page comes back short).
// The page mounts it with a key that encodes the query AND the active
// category/language/tag filters, so the initial status is derived from the
// query (no synchronous setState in the effect) and any change gives a fresh
// load — the filters ride every page request (initial + "Load more").
export function SearchResults({
  query,
  filters = {},
}: {
  query: string;
  filters?: SearchFilters;
}) {
  const trimmed = query.trim();
  const { category, language, tag } = filters;
  const [videos, setVideos] = useState<Video[]>([]);
  const [status, setStatus] = useState<Status>(trimmed ? "loading" : "idle");
  const [hasMore, setHasMore] = useState(false);
  const [more, setMore] = useState<MoreStatus>("idle");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!trimmed) return;
    const controller = new AbortController();
    api
      .searchVideos(trimmed, { limit: PAGE_SIZE, offset: 0, category, language, tag }, controller.signal)
      .then((res) => {
        setVideos(res.videos);
        setHasMore(res.videos.length === PAGE_SIZE);
        setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [trimmed, category, language, tag, reloadKey]);

  function retry() {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  }

  async function loadMore() {
    setMore("loading");
    try {
      const res = await api.searchVideos(trimmed, {
        limit: PAGE_SIZE,
        offset: videos.length,
        category,
        language,
        tag,
      });
      setVideos((v) => [...v, ...res.videos]);
      setHasMore(res.videos.length === PAGE_SIZE);
      setMore("idle");
    } catch {
      setMore("error");
    }
  }

  if (!trimmed) {
    return <EmptyState title="Search for videos" message="Enter a search term above." />;
  }
  if (status === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Searching" />
      </div>
    );
  }
  if (status === "error") {
    return <ErrorState message="Search failed. Please try again." onRetry={retry} />;
  }
  if (videos.length === 0) {
    const filtered = Boolean(category || language || tag);
    return (
      <EmptyState
        title="No results"
        message={
          filtered
            ? `Nothing matched “${trimmed}” with these filters. Try removing a filter.`
            : `Nothing matched “${trimmed}”.`
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <ul className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {videos.map((video) => (
          <li key={video.id}>
            <VideoCard video={video} />
          </li>
        ))}
      </ul>
      {hasMore ? (
        <LoadMoreButton
          busy={more === "loading"}
          error={more === "error" ? "Could not load more results." : null}
          onClick={() => void loadMore()}
        />
      ) : null}
    </div>
  );
}
