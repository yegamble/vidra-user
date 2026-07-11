"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ProtocolBadge } from "@/components/ProtocolBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadMoreButton, PAGE_SIZE } from "@/components/ui/LoadMoreButton";
import { Spinner } from "@/components/ui/Spinner";
import { VideoActionsMenu } from "@/components/VideoActionsMenu";
import { api, remoteVideoThumbnailUrl, videoThumbnailUrl } from "@/lib/api";
import type { Video } from "@/lib/api";
import { formatCount, formatDuration, relativeTime } from "@/lib/format";
import type { SearchFilters } from "@/lib/search-url";

type Status = "idle" | "loading" | "error" | "ready";
type MoreStatus = "idle" | "loading" | "error";

// SearchResultRow is the template's SEARCH list-row treatment of a result:
// thumbnail left (148px, 220px from `sm`), title/channel/meta right, hairline
// divider below. Same links, strings, and remote-video handling as the grid
// VideoCard, re-laid-out as a dense row. Exactly ONE link carries the video
// title (the stretched title link — its decorative before:inset-0 overlay
// makes the whole row clickable, thumbnail included); the channel link is
// layered above the overlay so it stays independently clickable.
function SearchResultRow({ video, onDeleted }: { video: Video; onDeleted: () => void }) {
  // A federated remote row: links to the remote watch surface, shows its
  // origin-domain badge, and uses the locally cached remote thumbnail. Its
  // channel_handle is a "name@domain" identity, not a local route.
  const isRemote = video.remote === true;

  const meta: string[] = [];
  if (typeof video.views === "number") meta.push(`${formatCount(video.views)} views`);
  const when = relativeTime(video.created_at);
  if (when) meta.push(when);

  // > 0 guard: a sub-second clip probes to 0 whole seconds, and a "0:00" badge
  // is noise rather than information.
  const duration =
    typeof video.duration_seconds === "number" && video.duration_seconds > 0
      ? video.duration_seconds
      : null;

  return (
    <li className="group relative flex gap-3 border-b border-border-subtle py-3">
      <div className="media-placeholder relative aspect-video w-[148px] flex-none overflow-hidden rounded-[10px] sm:w-[220px]">
        {video.has_thumbnail ? (
          // Backend-served image; a plain <img> avoids next/image remote config.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={isRemote ? remoteVideoThumbnailUrl(video.id) : videoThumbnailUrl(video.id)}
            alt={video.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-fg-muted">
            No preview
          </div>
        )}
        {duration !== null ? (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10.5px] font-semibold leading-none text-white tabular-nums">
            {formatDuration(duration)}
          </span>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
        <Link
          href={isRemote ? `/remote/${video.id}` : `/videos/${video.id}`}
          className="focus-ring rounded-md before:absolute before:inset-0 before:rounded-xl"
        >
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-fg transition-colors group-hover:text-fg-muted">
            {video.title}
          </h3>
        </Link>
        {isRemote && video.domain ? (
          <span className="relative flex max-w-full flex-wrap items-center gap-1">
            <span
              className="inline-flex w-fit max-w-full items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-fg-muted"
              title={`Federated video from ${video.domain}`}
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3 w-3 shrink-0"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <span className="sr-only">From </span>
              <span className="truncate">{video.domain}</span>
            </span>
            <ProtocolBadge protocol="activitypub" />
          </span>
        ) : null}
        {video.channel_handle ? (
          isRemote ? (
            // Remote channel identity ("name@domain") — not a local channel route.
            <span className="truncate text-xs text-fg-muted">
              {video.channel_display_name || video.channel_handle}
            </span>
          ) : (
            <Link
              href={`/channels/${video.channel_handle}`}
              className="focus-ring relative z-10 w-fit max-w-full truncate rounded text-xs text-fg-muted transition-colors hover:text-fg"
            >
              {video.channel_display_name || video.channel_handle}
            </Link>
          )
        ) : null}
        {meta.length > 0 ? <p className="text-xs text-fg-muted">{meta.join(" · ")}</p> : null}
      </div>
      <div className="relative z-20 -mr-1 shrink-0 self-end">
        <VideoActionsMenu video={video} compact onDeleted={onDeleted} />
      </div>
    </li>
  );
}

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
      <ul className="flex flex-col">
        {videos.map((video) => (
          <SearchResultRow
            key={video.id}
            video={video}
            onDeleted={() => setVideos((current) => current.filter((item) => item.id !== video.id))}
          />
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
