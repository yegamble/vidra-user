"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { useOptionalSession } from "@/components/auth/AuthProvider";
import { AccountResultCard, ChannelResultCard } from "@/components/EntityResultCard";
import { FederatedOriginBadge } from "@/components/FederatedOriginBadge";
import { SearchFilters as SearchFilterPanel } from "@/components/SearchFilters";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ListTail } from "@/components/ui/ListTail";
import { RestrictedModePlaceholder } from "@/components/RestrictedModePlaceholder";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { VideoActionsMenu } from "@/components/VideoActionsMenu";
import { VideoCardPreview } from "@/components/VideoCardPreview";
import { ApiError, api, errorMessage, getAccessToken } from "@/lib/api";
import type { AccountSearchResult, Channel, Video } from "@/lib/api";
import { cn } from "@/lib/cn";
import { resolveBrowseScrollMode } from "@/lib/feed-defaults";
import { formatCount, formatDuration, pluralize, relativeTime } from "@/lib/format";
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
import {
  activeSearchFilterCount,
  searchApiFilters,
  searchFilterKey,
  searchHref,
  type SearchFilters,
  type SearchResultType,
} from "@/lib/search-url";
import { useAppendingList } from "@/lib/use-appending-list";
import { useVideoCardPresentation } from "@/lib/use-video-card-presentation";

// The search page is a thumbnail-left list, not a browse grid. Matching that
// geometry during the client fetch prevents the global/grid → spinner → rows
// sequence that used to move the entire results surface on every query.
function SearchResultsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="search-results-loading"
    >
      <span className="sr-only">Searching…</span>
      <ul aria-hidden className="flex flex-col">
        {Array.from({ length: count }).map((_, index) => (
          <li
            key={index}
            data-testid="search-result-skeleton"
            className="flex gap-3 border-b border-border-subtle py-3"
          >
            <Skeleton className="aspect-video w-[148px] flex-none rounded-[10px] sm:w-[220px]" />
            <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-3 w-2/5" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// The identity-card silhouette, for the channel and account tabs.
function EntityResultsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div role="status" aria-live="polite" data-testid="search-results-loading">
      <span className="sr-only">Searching…</span>
      <ul aria-hidden className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: count }).map((_, index) => (
          <li key={index} className="flex gap-3 rounded-2xl bg-surface-muted p-4">
            <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The result count for one tab. Two things it refuses to do: guess, and
 * overstate.
 *
 * A backend that reports no total renders nothing at all — "20 results" derived
 * from the page length is how the admin lists came to claim "100 videos" on an
 * instance with thousands. And when the search service says its count is a
 * FLOOR (`total_is_lower_bound`: its ranker hit a recall cap, so matches exist
 * that were never scored) the number is shown as "1,000+", never as an exact
 * figure. That distinction earns its keep the moment auto-load is on: infinite
 * scroll reaches that boundary in seconds, where the button took twenty-five
 * clicks to get near it.
 */
function ResultCount({
  total,
  lowerBound,
  noun,
}: {
  total: number | null;
  lowerBound: boolean;
  noun: string;
}) {
  if (total === null) return null;
  return (
    <p className="text-sm font-semibold tabular-nums text-fg-muted">
      {total}
      {lowerBound ? "+" : ""} {pluralize(total, noun)}
      {lowerBound ? (
        <span className="ml-1 font-normal">
          — the ranker stopped counting here; there are more.
        </span>
      ) : null}
    </p>
  );
}

// SearchResultRow is the template's SEARCH list-row treatment of a result:
// thumbnail left (148px, 220px from `sm`), title/channel/meta right, hairline
// divider below. Same links, strings, and remote-video handling as the grid
// VideoCard, re-laid-out as a dense row. Thumbnail and title are parallel
// watch links; the channel link remains independently clickable.
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
  const {
    isRemote,
    watchHref,
    restrictedHidden,
    blurSensitive,
    markSensitive,
    previewEligible,
    previewSrc,
    posterSrc,
    duration,
  } = useVideoCardPresentation(video);
  // Miniature attribution (config-parity W5): same rule as the grid VideoCard.
  const preferAuthorName =
    useInstanceDefaults()?.miniature_prefer_author_display_name === true;
  const attributionName = miniatureDisplayName(video, preferAuthorName);

  const meta: string[] = [];
  if (typeof video.views === "number") meta.push(`${formatCount(video.views)} views`);
  const when = relativeTime(video.created_at);
  if (when) meta.push(when);

  if (restrictedHidden) {
    return (
      <RestrictedModePlaceholder
        as="li"
        variant="row"
        className="min-h-24 border-b border-border-subtle py-3 text-sm"
      />
    );
  }

  return (
    <li
      data-testid="search-result-row"
      className="group/card relative flex gap-3 border-b border-border-subtle py-3"
    >
      <div
        className="w-[148px] flex-none sm:w-[220px]"
        onClick={() => onSelect?.()}
      >
        {/* hasStoryboard stays false — see useVideoCardPresentation for why no
            card may claim a storyboard its payload never advertised. */}
        <VideoCardPreview
          videoId={video.id}
          title={video.title}
          href={watchHref}
          src={previewSrc}
          poster={posterSrc}
          duration={duration}
          hasStoryboard={false}
          previewEnabled={previewEligible}
          className="rounded-[10px]"
          posterClassName={cn(
            "transition-transform group-hover/preview:scale-[1.02]",
            blurSensitive && "scale-110 blur-2xl",
          )}
          fallback={
            <div className="media-placeholder absolute inset-0 flex items-center justify-center text-xs text-fg-muted">
              No preview
            </div>
          }
          overlay={
            <>
              {markSensitive ? (
                <span
                  title={video.sensitive_reason || undefined}
                  className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10.5px] font-semibold leading-none text-white group-data-[preview-active=true]/preview:bottom-10"
                >
                  Sensitive
                </span>
              ) : null}
              {duration !== null ? (
                <span className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10.5px] font-semibold leading-none tabular-nums text-white group-data-[preview-active=true]/preview:bottom-10">
                  {formatDuration(duration)}
                </span>
              ) : null}
            </>
          }
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
        <Link
          href={isRemote ? `/remote/${video.id}` : `/videos/${video.id}`}
          onClick={onSelect}
          className="focus-ring rounded-md"
        >
          <h3 className="line-clamp-2 text-subhead font-semibold leading-snug text-fg transition-colors group-hover/card:text-fg-muted">
            {video.title}
          </h3>
        </Link>
        {isRemote && video.domain ? (
          // Federated origin badge (the tri-protocol ribbon's third pinned
          // placement — Badge `federated` wears it on the top edge).
          <span className="relative flex max-w-full">
            <FederatedOriginBadge
              variant="ribbon"
              domain={video.domain}
              title={`Federated video from ${video.domain}`}
              className="relative z-10"
            />
          </span>
        ) : null}
        {video.channel_handle ? (
          isRemote ? (
            // Remote channel identity ("name@domain") — not a local channel route.
            <span className="truncate text-footnote text-fg-muted">{attributionName}</span>
          ) : (
            <Link
              href={`/channels/${video.channel_handle}`}
              className="focus-ring relative z-10 w-fit max-w-full truncate rounded text-footnote text-fg-muted transition-colors hover:text-fg"
            >
              {attributionName}
            </Link>
          )
        ) : null}
        {meta.length > 0 ? (
          <p className="text-footnote text-fg-muted">{meta.join(" · ")}</p>
        ) : null}
      </div>
      <div className="relative z-20 -mr-1 shrink-0 self-end opacity-0 transition-opacity duration-150 group-hover/card:opacity-100 group-focus-within/card:opacity-100 [@media(hover:none)]:opacity-100">
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
          <FederatedOriginBadge
            domain={actor.domain}
            title={`Federated ${type} from ${actor.domain}`}
            className="w-fit"
            withProtocol
          />
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

/**
 * The videos tab. Owns the facet panel (the facets narrow videos and nothing
 * else, so they belong inside this tab rather than above all three), the local
 * result rows, and the "From the fediverse" group.
 */
function VideoResults({
  query,
  filters,
  type,
  remoteHintEnabled,
  personalizedActive,
  autoLoad,
}: {
  query: string;
  filters: SearchFilters;
  type: SearchResultType;
  remoteHintEnabled: boolean;
  personalizedActive: boolean;
  autoLoad: boolean;
}) {
  // Resolved URI/handle hits ride the first page's response, not the row list —
  // they are a different question ("what does this pasted link point at") with a
  // different answer shape, and they are not paginated.
  const [remote, setRemote] = useState<RemoteSearchResult[]>([]);

  const list = useAppendingList<Video>({
    queryKey: searchFilterKey(query, filters),
    load: (window, signal) =>
      api
        .searchVideos(
          query,
          { ...searchApiFilters(filters), limit: window.limit, offset: window.offset },
          signal,
        )
        .then((res) => {
          if (window.offset === 0) {
            setRemote(readRemoteSearchResults(res));
            // A search was submitted and produced this many local results — the
            // signal the search service learns ranking from.
            trackSearchEvent({ type: "search.submitted", query, count: res.videos.length });
          }
          return {
            items: res.videos,
            total: res.total,
            totalIsLowerBound: res.total_is_lower_bound,
            hasMore: res.has_more,
          };
        }),
  });

  const panel = (
    <div className="mb-3 sm:mb-4">
      <SearchFilterPanel query={query} filters={filters} type={type} />
    </div>
  );

  if (list.status === "loading") {
    return (
      <>
        {panel}
        <SearchResultsSkeleton />
      </>
    );
  }
  if (list.status === "error") {
    return (
      <>
        {panel}
        <ErrorState message="Search failed. Please try again." onRetry={list.reload} />
      </>
    );
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

  if (list.items.length === 0 && remote.length === 0) {
    const filtered = activeSearchFilterCount(filters) > 0;
    const unresolvedRemote =
      remoteHintEnabled && searchQueryLooksRemote(query)
        ? " That looks like a URL or handle, but it did not resolve to remote content."
        : "";
    return (
      <>
        {panel}
        <EmptyState
          title="No results"
          message={
            filtered
              ? `Nothing matched “${query}” with these filters. Try removing a filter.`
              : `Nothing matched “${query}”.${unresolvedRemote}`
          }
        />
      </>
    );
  }

  return (
    <>
      {panel}
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
        <ResultCount total={list.total} lowerBound={list.totalIsLowerBound} noun="result" />
        {remoteGroup}
        {list.items.length > 0 ? (
          <ul className="flex flex-col">
            {list.items.map((video, index) => (
              <SearchResultRow
                key={video.id}
                video={video}
                onSelect={() =>
                  trackSearchEvent({
                    type: "search.result_clicked",
                    query,
                    video_id: video.id,
                    position: index,
                  })
                }
                onDeleted={() => list.drop((item) => item.id !== video.id)}
              />
            ))}
          </ul>
        ) : null}
        <ListTail
          hasMore={list.hasMore}
          autoLoad={autoLoad}
          busy={list.moreStatus === "loading"}
          error={list.moreStatus === "error" ? "Could not load more results." : null}
          onLoadMore={list.loadMore}
        />
      </div>
    </>
  );
}

/**
 * The channels and accounts tabs. One component, two configurations: both are
 * a paged fuzzy search over an identity, rendered as the same card grid, so the
 * only differences worth naming are the endpoint, the card, and the noun.
 * Writing them out twice is how the two tabs would drift apart.
 */
function EntityResults<T>({
  query,
  autoLoad,
  label,
  noun,
  emptyTitle,
  emptyMessage,
  errorMessage: error,
  load,
  itemKey,
  renderItem,
}: {
  query: string;
  autoLoad: boolean;
  /** Accessible name for the results list. */
  label: string;
  /** Singular noun for the count line ("channel"). */
  noun: string;
  emptyTitle: string;
  emptyMessage: string;
  errorMessage: string;
  load: (
    window: { limit: number; offset: number },
    signal: AbortSignal,
  ) => Promise<{ items: T[]; total: number }>;
  itemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
}) {
  const list = useAppendingList<T>({ queryKey: query, load });

  if (list.status === "loading") return <EntityResultsSkeleton />;
  if (list.status === "error") return <ErrorState message={error} onRetry={list.reload} />;
  if (list.items.length === 0) {
    return <EmptyState title={emptyTitle} message={emptyMessage} />;
  }
  return (
    <div className="flex flex-col gap-6">
      <ResultCount total={list.total} lowerBound={list.totalIsLowerBound} noun={noun} />
      <ul aria-label={label} className="grid gap-4 sm:grid-cols-2">
        {list.items.map((item) => (
          <li key={itemKey(item)}>{renderItem(item)}</li>
        ))}
      </ul>
      <ListTail
        hasMore={list.hasMore}
        autoLoad={autoLoad}
        busy={list.moreStatus === "loading"}
        error={list.moreStatus === "error" ? error : null}
        onLoadMore={list.loadMore}
      />
    </div>
  );
}

// SearchResults is the whole results surface: a Videos / Channels / Accounts
// switcher over three independent paged lists, each hitting its own endpoint
// with its own count. The active tab lives in the URL (`?type=`), like every
// other piece of search state, so a channel search is a shareable link.
//
// Pagination is `useAppendingList`, shared with the browse feed: it derives its
// status from the query signature, which is why this component no longer needs
// the page to remount it on a filter key — a filter change swaps to the
// skeleton on the same render, with no stale rows underneath.
//
// remoteSearch carries the /instance search{} gates (config-parity W13, passed
// by the server page): when the caller's auth state may search by URL/handle,
// the prompt/empty states say so, and any resolved remote hits from the first
// page render in a "From the fediverse" group above the local results.
export function SearchResults({
  query,
  filters = {},
  type = "videos",
  remoteSearch,
}: {
  query: string;
  filters?: SearchFilters;
  /** Which result kind to list; from `?type=`, defaulting to videos. */
  type?: SearchResultType;
  remoteSearch?: InstanceSearchBlock;
}) {
  const router = useRouter();
  const trimmed = query.trim();
  const user = useOptionalSession()?.user ?? null;
  // Infinite scroll is the operator's call (GET /instance defaults). Absent or
  // unrecognised means the Load more button, which is what every list shipped
  // with — so a missing snapshot (old backend, mocked e2e) changes nothing.
  const autoLoad = resolveBrowseScrollMode(useInstanceDefaults()) === "auto";
  // The personalization hint (search-service W4): shown only when the instance
  // runs advanced ranking AND allows personalized search AND the signed-in user
  // has kept their personalized-search preference on — i.e. results the viewer
  // sees really are tailored to them. A link to /settings/search lets them turn
  // it off. Absent gates (older backend) keep it dark.
  const personalizedActive =
    remoteSearch?.mode === "advanced" &&
    remoteSearch?.personalized_search_enabled !== false &&
    user?.personalized_search_enabled === true;

  // Whether THIS caller may search by URL/handle (drives help text only; the
  // backend enforces the gate either way). Evaluated per render — cheap, and
  // login state changes remount the page anyway.
  const remoteHintEnabled = Boolean(
    getAccessToken() !== null ? remoteSearch?.remote_uri_users : remoteSearch?.remote_uri_anonymous,
  );

  if (!trimmed) {
    // No term, nothing to switch between: the tab strip would offer three
    // empty lists.
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

  return (
    <Tabs
      label="Result type"
      activeTabId={type}
      onTabChange={(next) =>
        router.push(searchHref(trimmed, filters, next as SearchResultType))
      }
      tabs={[
        {
          id: "videos",
          label: "Videos",
          panel: (
            <VideoResults
              query={trimmed}
              filters={filters}
              type={type}
              remoteHintEnabled={remoteHintEnabled}
              personalizedActive={personalizedActive}
              autoLoad={autoLoad}
            />
          ),
        },
        {
          id: "channels",
          label: "Channels",
          panel: (
            <EntityResults<Channel>
              query={trimmed}
              autoLoad={autoLoad}
              label="Channel results"
              noun="channel"
              emptyTitle="No channels"
              emptyMessage={`No channel matched “${trimmed}”.`}
              errorMessage="Could not load channels."
              load={(window, signal) =>
                api
                  .searchChannels(trimmed, window, signal)
                  .then((res) => ({ items: res.channels, total: res.total }))
              }
              itemKey={(channel) => channel.id}
              renderItem={(channel) => <ChannelResultCard channel={channel} />}
            />
          ),
        },
        {
          id: "accounts",
          label: "Accounts",
          panel: (
            <EntityResults<AccountSearchResult>
              query={trimmed}
              autoLoad={autoLoad}
              label="Account results"
              noun="account"
              emptyTitle="No accounts"
              emptyMessage={`No public account matched “${trimmed}”.`}
              errorMessage="Could not load accounts."
              load={(window, signal) =>
                api
                  .searchAccounts(trimmed, window, signal)
                  .then((res) => ({ items: res.accounts, total: res.total }))
              }
              itemKey={(account) => account.id}
              renderItem={(account) => <AccountResultCard account={account} />}
            />
          ),
        },
      ]}
    />
  );
}
