"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { ProtocolBadge } from "@/components/ProtocolBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadMoreButton, PAGE_SIZE } from "@/components/ui/LoadMoreButton";
import { Spinner } from "@/components/ui/Spinner";
import { VideoActionsMenu } from "@/components/VideoActionsMenu";
import { ApiError, api, errorMessage, getAccessToken, remoteVideoThumbnailUrl, videoThumbnailUrl } from "@/lib/api";
import type { Video } from "@/lib/api";
import { formatCount, formatDuration, relativeTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { InstanceSearchBlock } from "@/lib/instance-config.server";
import { useInstanceDefaults } from "@/lib/instance-defaults";
import { miniatureDisplayName } from "@/lib/miniature-name";
import { trackSearchEvent } from "@/lib/search-events";
import {
  readRemoteSearchResults,
  remoteVideoToCard,
  searchQueryLooksRemote,
} from "@/lib/remote-search";
import type { RemoteSearchActor, RemoteSearchResult } from "@/lib/remote-search";
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
function SearchResultRow({
  video,
  onDeleted,
  onSelect,
}: {
  video: Video;
  onDeleted: () => void;
  /** Fired when the row's title link is activated (search.result_clicked). */
  onSelect?: () => void;
}) {
  // A federated remote row: links to the remote watch surface, shows its
  // origin-domain badge, and uses the locally cached remote thumbnail. Its
  // channel_handle is a "name@domain" identity, not a local route.
  const isRemote = video.remote === true;
  // Miniature attribution (config-parity W5): same rule as the grid VideoCard.
  const preferAuthorName =
    useInstanceDefaults()?.miniature_prefer_author_display_name === true;
  const attributionName = miniatureDisplayName(video, preferAuthorName);

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
          onClick={onSelect}
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
            <span className="truncate text-xs text-fg-muted">{attributionName}</span>
          ) : (
            <Link
              href={`/channels/${video.channel_handle}`}
              className="focus-ring relative z-10 w-fit max-w-full truncate rounded text-xs text-fg-muted transition-colors hover:text-fg"
            >
              {attributionName}
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

// RemoteActorResult renders a resolved remote channel/account search hit
// (config-parity W13): the followable identity with its origin-domain badge,
// an "Open original" link to the actor on its home instance, and — for
// channels, signed-in viewers only — the same follow affordance the
// subscriptions page offers (POST /me/remote-follows).
function RemoteActorResult({
  type,
  actor,
}: {
  type: "channel" | "account";
  actor: RemoteSearchActor;
}) {
  const [followState, setFollowState] = useState<"idle" | "busy" | "done">("idle");
  const [followError, setFollowError] = useState<string | null>(null);
  const canFollow = type === "channel" && getAccessToken() !== null;

  async function follow() {
    if (followState !== "idle") return;
    setFollowState("busy");
    setFollowError(null);
    try {
      await api.createRemoteFollow({ actor_url: actor.actor_url });
      setFollowState("done");
    } catch (err) {
      setFollowState("idle");
      if (err instanceof ApiError && err.status === 503) {
        setFollowError("Federation is disabled on this instance.");
      } else {
        setFollowError(errorMessage(err, "Could not follow this channel."));
      }
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 border-b border-border-subtle py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate text-sm font-semibold text-fg">{actor.handle}</p>
        <span className="flex max-w-full flex-wrap items-center gap-1">
          <span
            className="inline-flex w-fit max-w-full items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-fg-muted"
            title={`Federated ${type} from ${actor.domain}`}
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
            <span className="truncate">{actor.domain}</span>
          </span>
          <ProtocolBadge protocol="activitypub" />
          <span className="text-[11px] text-fg-muted">
            {type === "channel" ? "Remote channel" : "Remote account"}
          </span>
        </span>
        {followError ? <p className="text-xs text-danger">{followError}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {canFollow ? (
          <button
            type="button"
            onClick={() => void follow()}
            disabled={followState !== "idle"}
            className="focus-ring rounded-full bg-surface-muted px-3 py-1.5 text-xs font-semibold text-fg transition-colors hover:bg-surface disabled:opacity-60"
          >
            {followState === "done" ? "Requested" : followState === "busy" ? "Following…" : "Follow"}
          </button>
        ) : null}
        <a
          href={actor.actor_url}
          target="_blank"
          rel="noopener noreferrer"
          className="focus-ring rounded-full px-3 py-1.5 text-xs font-semibold text-fg-muted transition-colors hover:text-fg"
        >
          Open original
        </a>
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
//
// remoteSearch carries the /instance search{} gates (config-parity W13, passed
// by the server page): when the caller's auth state may search by URL/handle,
// the prompt/empty states say so, and any resolved remote hits from the first
// page render in a "From the fediverse" group above the local results.
export function SearchResults({
  query,
  filters = {},
  remoteSearch,
}: {
  query: string;
  filters?: SearchFilters;
  remoteSearch?: InstanceSearchBlock;
}) {
  const trimmed = query.trim();
  const { category, language, tag } = filters;
  const { user } = useSession();
  // The personalization hint (search-service W4): shown only when the instance
  // runs advanced ranking AND allows personalized search AND the signed-in user
  // has kept their personalized-search preference on — i.e. results the viewer
  // sees really are tailored to them. A link to /settings/search lets them turn
  // it off. Absent gates (older backend) keep it dark.
  const personalizedActive =
    remoteSearch?.mode === "advanced" &&
    remoteSearch?.personalized_search_enabled !== false &&
    user?.personalized_search_enabled === true;
  const [videos, setVideos] = useState<Video[]>([]);
  const [remote, setRemote] = useState<RemoteSearchResult[]>([]);
  const [status, setStatus] = useState<Status>(trimmed ? "loading" : "idle");
  const [hasMore, setHasMore] = useState(false);
  const [more, setMore] = useState<MoreStatus>("idle");
  const [reloadKey, setReloadKey] = useState(0);

  // Whether THIS caller may search by URL/handle (drives help text only; the
  // backend enforces the gate either way). Evaluated per render — cheap, and
  // login state changes remount the page anyway.
  const remoteHintEnabled = Boolean(
    getAccessToken() !== null ? remoteSearch?.remote_uri_users : remoteSearch?.remote_uri_anonymous,
  );

  useEffect(() => {
    if (!trimmed) return;
    const controller = new AbortController();
    api
      .searchVideos(trimmed, { limit: PAGE_SIZE, offset: 0, category, language, tag }, controller.signal)
      .then((res) => {
        setVideos(res.videos);
        setRemote(readRemoteSearchResults(res));
        setHasMore(res.videos.length === PAGE_SIZE);
        setStatus("ready");
        // A search was submitted and produced this many local results — the
        // signal the search service learns ranking from.
        trackSearchEvent({ type: "search.submitted", query: trimmed, count: res.videos.length });
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
    return (
      <EmptyState
        title="Search for videos"
        message={
          remoteHintEnabled
            ? "Enter a search term above — or paste a video/channel URL or a name@domain handle to look it up on another instance."
            : "Enter a search term above."
        }
      />
    );
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
  // The remote group (config-parity W13): resolved URI/handle hits from the
  // first page, rendered above the local results. Video hits reuse the same
  // remote-card row treatment; channel/account hits get the identity row.
  const remoteGroup =
    remote.length > 0 ? (
      <section aria-label="Results from other instances" className="flex flex-col gap-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
          From the fediverse
        </h2>
        <ul className="flex flex-col">
          {remote.map((hit, i) =>
            hit.type === "video" ? (
              <SearchResultRow
                key={`remote-${hit.video.id}`}
                video={remoteVideoToCard(hit.video)}
                onDeleted={() => setRemote((current) => current.filter((_, idx) => idx !== i))}
              />
            ) : (
              <RemoteActorResult key={`remote-${hit.actor.actor_url}`} type={hit.type} actor={hit.actor} />
            ),
          )}
        </ul>
      </section>
    ) : null;
  if (videos.length === 0 && remote.length === 0) {
    const filtered = Boolean(category || language || tag);
    const unresolvedRemote =
      remoteHintEnabled && searchQueryLooksRemote(trimmed)
        ? " That looks like a URL or handle, but it did not resolve to remote content."
        : "";
    return (
      <EmptyState
        title="No results"
        message={
          filtered
            ? `Nothing matched “${trimmed}” with these filters. Try removing a filter.`
            : `Nothing matched “${trimmed}”.${unresolvedRemote}`
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {personalizedActive ? (
        <p className="text-xs text-fg-muted">
          {t("search.personalizedHint")}{" "}
          <Link
            href="/settings/search"
            className="focus-ring rounded font-medium text-fg underline-offset-2 hover:underline"
          >
            {t("search.personalizedManage")}
          </Link>
        </p>
      ) : null}
      {remoteGroup}
      {videos.length > 0 ? (
        <ul className="flex flex-col">
          {videos.map((video, index) => (
            <SearchResultRow
              key={video.id}
              video={video}
              onSelect={() =>
                trackSearchEvent({
                  type: "search.result_clicked",
                  query: trimmed,
                  video_id: video.id,
                  position: index,
                })
              }
              onDeleted={() => setVideos((current) => current.filter((item) => item.id !== video.id))}
            />
          ))}
        </ul>
      ) : null}
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
