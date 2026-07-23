"use client";

import { useEffect, useState } from "react";

import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadMoreButton, PAGE_SIZE } from "@/components/ui/LoadMoreButton";
import { VideoCard } from "@/components/VideoCard";
import { VideoGridSkeleton } from "@/components/VideoCardSkeleton";
import { VideoGrid } from "@/components/VideoGrid";
import { api } from "@/lib/api";
import type { FeedSort, Video, VideoFeedResponse } from "@/lib/api";
import type { FeedFilters } from "@/lib/feed-url";

type Status = "loading" | "error" | "ready";
type MoreStatus = "idle" | "loading" | "error";

// VideoFeed hydrates from an optional server-fetched first page and owns client
// pagination/retry thereafter. Without a seed (backend unavailable server-side,
// /trending, or a route-mocked e2e) it preserves the original browser fetch.
export function VideoFeed({
  sort,
  filters = {},
  initialPage,
  prioritizeFirstRow = false,
}: {
  sort: FeedSort;
  filters?: FeedFilters;
  initialPage?: VideoFeedResponse | null;
  prioritizeFirstRow?: boolean;
}) {
  const seeded = initialPage !== undefined && initialPage !== null;
  const [status, setStatus] = useState<Status>(seeded ? "ready" : "loading");
  const [videos, setVideos] = useState<Video[]>(initialPage?.videos ?? []);
  const [hasMore, setHasMore] = useState(
    Boolean(initialPage && initialPage.videos.length >= PAGE_SIZE),
  );
  const [more, setMore] = useState<MoreStatus>("idle");
  const [reloadKey, setReloadKey] = useState(0);

  const { tag, category, language, scope } = filters;

  useEffect(() => {
    if (seeded && reloadKey === 0) return;
    const controller = new AbortController();
    api
      .getFeed(
        { sort, scope, tag, category, language, limit: PAGE_SIZE, offset: 0 },
        controller.signal,
      )
      .then((res) => {
        setVideos(res.videos);
        setHasMore(res.videos.length === PAGE_SIZE);
        setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [sort, scope, tag, category, language, reloadKey, seeded]);

  function retry() {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  }

  async function loadMore() {
    setMore("loading");
    try {
      const res = await api.getFeed({
        sort,
        scope,
        tag,
        category,
        language,
        limit: PAGE_SIZE,
        offset: videos.length,
      });
      setVideos((v) => [...v, ...res.videos]);
      setHasMore(res.videos.length === PAGE_SIZE);
      setMore("idle");
    } catch {
      setMore("error");
    }
  }

  if (status === "loading") {
    // Same silhouette as the grid that replaces it (and as app/loading.tsx),
    // so the route → client-fetch → data handoff doesn't jump layouts.
    return (
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading videos…</span>
        <VideoGridSkeleton />
      </div>
    );
  }
  if (status === "error") {
    return (
      <ErrorState
        message="Could not load videos. The backend may be unavailable."
        onRetry={retry}
      />
    );
  }
  if (videos.length === 0) {
    return tag || category || language ? (
      <EmptyState
        title="No matching videos"
        message="Nothing matches the active filters. Try removing one."
      />
    ) : (
      <EmptyState title="No videos yet" message="Published videos will appear here." />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <VideoGrid>
        {videos.map((video, index) => (
          <li key={video.id}>
            <VideoCard
              video={video}
              priority={prioritizeFirstRow && index < 3}
              onDeleted={() => setVideos((cur) => cur.filter((v) => v.id !== video.id))}
            />
          </li>
        ))}
      </VideoGrid>
      {hasMore ? (
        <LoadMoreButton
          busy={more === "loading"}
          error={more === "error" ? "Could not load more videos." : null}
          onClick={() => void loadMore()}
        />
      ) : null}
    </div>
  );
}
