"use client";

import { useEffect, useState } from "react";

import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadMoreButton, PAGE_SIZE } from "@/components/ui/LoadMoreButton";
import { Spinner } from "@/components/ui/Spinner";
import { VideoCard } from "@/components/VideoCard";
import { VideoGrid } from "@/components/VideoGrid";
import { api } from "@/lib/api";
import type { FeedSort, Video } from "@/lib/api";
import type { FeedFilters } from "@/lib/feed-url";

type Status = "loading" | "error" | "ready";
type MoreStatus = "idle" | "loading" | "error";

// VideoFeed loads the public feed in the browser (so it is route-mockable in
// tests and refetchable) and renders loading / error / empty / grid states plus
// a "Load more" pager (limit/offset; the pager hides once a page comes back
// short). Optional URL-reflected filters (tag/category/language) narrow the
// feed. The page mounts it with a key derived from sort+filters, so any change
// gives a fresh load (no synchronous setState in the effect). The API client
// already logs failures; this component only reflects them in the UI.
export function VideoFeed({ sort, filters = {} }: { sort: FeedSort; filters?: FeedFilters }) {
  const [status, setStatus] = useState<Status>("loading");
  const [videos, setVideos] = useState<Video[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [more, setMore] = useState<MoreStatus>("idle");
  const [reloadKey, setReloadKey] = useState(0);

  const { tag, category, language, scope } = filters;

  useEffect(() => {
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
  }, [sort, scope, tag, category, language, reloadKey]);

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
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Loading videos" />
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
        {videos.map((video) => (
          <li key={video.id}>
            <VideoCard video={video} />
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
