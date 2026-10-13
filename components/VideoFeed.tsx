"use client";

import { useMemo } from "react";

import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ListTail } from "@/components/ui/ListTail";
import { VideoCard } from "@/components/VideoCard";
import { VideoGridSkeleton } from "@/components/VideoCardSkeleton";
import { VideoGrid } from "@/components/VideoGrid";
import { api } from "@/lib/api";
import type { FeedSort, Video, VideoFeedResponse } from "@/lib/api";
import { useContentPreferences, useContentPreferencesSettled } from "@/lib/content-preferences";
import { resolveBrowseScrollMode } from "@/lib/feed-defaults";
import type { FeedFilters } from "@/lib/feed-url";
import { useInstanceDefaults } from "@/lib/instance-defaults";
import { useAppendingList } from "@/lib/use-appending-list";
import { useSettledSession } from "@/lib/use-settled-session";

// VideoFeed hydrates from an optional server-fetched first page and owns client
// pagination/retry thereafter. Without a seed (backend unavailable server-side,
// /trending, or a route-mocked e2e) it preserves the original browser fetch.
//
// Paging is `useAppendingList`, the same hook the search results use — including
// its honest `hasMore` (the feed reports a `total`, so the last page is now
// known rather than guessed from its length) and the operator-gated auto-load.
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
  const { tag, category, language, scope } = filters;
  // Infinite scroll is the operator's call (GET /instance defaults). Absent or
  // unrecognised means the Load more button — today's behavior exactly.
  const autoLoad = resolveBrowseScrollMode(useInstanceDefaults()) === "auto";
  // This feed is filtered PER VIEWER by core (ListPublicVideosSorted): the
  // authors this caller muted or blocked, the instances they muted, and — since
  // 0100 — sensitive videos under their own policy override are all dropped
  // server-side, and only for a request that says who the caller is. Firing
  // before the refresh cookie has been redeemed asks as nobody, so a muted
  // author's videos come back to the person who hid them, and the effect never
  // re-runs to correct it.
  //
  // `initialPage` is the home page's SERVER-rendered first page, and a server
  // render has no viewer, so it is the ANONYMOUS answer: keying it under
  // `viewerKey` keeps it for a visitor who settles anonymous (no browser
  // request at all) and retires it for one who settles signed in, who gets
  // exactly one request carrying their token.
  const session = useSettledSession();
  // The viewer's preferred languages narrow the feed through the same
  // ?language param the filter panel uses (a comma-separated list; any match).
  // An explicit language filter wins. A signed-in viewer's first request waits
  // for their preferences, so it is never sent unfiltered and then redone.
  const prefs = useContentPreferences();
  const prefsSettled = useContentPreferencesSettled();
  const viewer = useMemo(
    () => ({ ...session, settled: session.settled && (!session.authed || prefsSettled) }),
    [session, prefsSettled],
  );
  const effectiveLanguage =
    language || (prefs.preferred_languages.length > 0 ? prefs.preferred_languages.join(",") : undefined);

  const list = useAppendingList<Video>({
    queryKey: JSON.stringify([sort, scope, tag, category, effectiveLanguage]),
    viewer,
    initialPage: initialPage
      ? { items: initialPage.videos, total: initialPage.total }
      : null,
    load: (window, signal) =>
      api
        .getFeed(
          { sort, scope, tag, category, language: effectiveLanguage, limit: window.limit, offset: window.offset },
          signal,
        )
        .then((res) => ({ items: res.videos, total: res.total })),
  });

  if (list.status === "loading") {
    // Same silhouette as the grid that replaces it (and as app/loading.tsx),
    // so the route → client-fetch → data handoff doesn't jump layouts.
    return (
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading videos…</span>
        <VideoGridSkeleton />
      </div>
    );
  }
  if (list.status === "error") {
    return (
      <ErrorState
        message="Could not load videos. The backend may be unavailable."
        onRetry={list.reload}
      />
    );
  }
  if (list.items.length === 0) {
    return tag || category || effectiveLanguage ? (
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
        {list.items.map((video, index) => (
          <li key={video.id}>
            <VideoCard
              video={video}
              priority={prioritizeFirstRow && index < 3}
              onDeleted={() => list.drop((v) => v.id !== video.id)}
            />
          </li>
        ))}
      </VideoGrid>
      <ListTail
        hasMore={list.hasMore}
        autoLoad={autoLoad}
        busy={list.moreStatus === "loading"}
        error={list.moreStatus === "error" ? "Could not load more videos." : null}
        onLoadMore={list.loadMore}
      />
    </div>
  );
}
