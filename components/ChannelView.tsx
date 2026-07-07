"use client";

import { useEffect, useMemo, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { ChannelLiveBadge } from "@/components/ChannelLiveBadge";
import { DonateButton } from "@/components/DonateButton";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LinkButton } from "@/components/ui/LinkButton";
import { LoadMoreButton, PAGE_SIZE } from "@/components/ui/LoadMoreButton";
import { Spinner } from "@/components/ui/Spinner";
import { VideoCard } from "@/components/VideoCard";
import { VideoGrid } from "@/components/VideoGrid";
import { ApiError, api, channelAvatarUrl, channelBannerUrl } from "@/lib/api";
import type { Channel, Video } from "@/lib/api";
import { formatCount } from "@/lib/format";

type Status = "loading" | "notfound" | "error" | "ready";

// Channel-grid sort. Both keys ride on `created_at`, the one card field the
// channel-videos contract always carries (views is detail-only), so the chips
// never depend on data the list omits. "Latest" is the backend's natural
// newest-first order (no client re-sort — the default view is untouched);
// "Oldest" sorts ascending by created_at.
type ChannelSort = "latest" | "oldest";
const CHANNEL_SORTS: { sort: ChannelSort; label: string }[] = [
  { sort: "latest", label: "Latest" },
  { sort: "oldest", label: "Oldest" },
];

// ChannelView loads a channel and its videos client-side. The page mounts it with
// key={handle} so the initial status is "loading" (no synchronous setState in the
// effect) and a new handle gives a fresh load.
export function ChannelView({ handle }: { handle: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [channel, setChannel] = useState<Channel | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  // The channel-videos contract has no limit/offset (the backend returns the
  // full list), so "Load more" is a client-side reveal in PAGE_SIZE chunks.
  // Switch to server paging if/when the contract grows pagination params.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [reloadKey, setReloadKey] = useState(0);
  const [sort, setSort] = useState<ChannelSort>("latest");

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api.getChannel(handle, controller.signal),
      api.listChannelVideos(handle, undefined, controller.signal),
    ])
      .then(([ch, list]) => {
        setChannel(ch);
        setVideos(list.videos);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setStatus(err instanceof ApiError && err.status === 404 ? "notfound" : "error");
      });
    return () => controller.abort();
  }, [handle, reloadKey]);

  // "latest" keeps the backend's natural (newest-first) order untouched;
  // "oldest" sorts a copy ascending by the always-present created_at.
  const sortedVideos = useMemo(() => {
    if (sort !== "oldest") return videos;
    return [...videos].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  }, [videos, sort]);

  function changeSort(next: ChannelSort) {
    if (next === sort) return;
    setSort(next);
    setVisibleCount(PAGE_SIZE); // reveal the top of the re-sorted list
  }

  function retry() {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  }

  if (status === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Loading channel" />
      </div>
    );
  }
  if (status === "notfound") {
    return <EmptyState title="Channel not found" message={`No channel @${handle} exists.`} />;
  }
  if (status === "error" || channel === null) {
    return <ErrorState message="Could not load this channel." onRetry={retry} />;
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 border-b border-border-subtle pb-6">
        <div>
          {/* Banner strip: the channel image when one exists, a quiet muted
              block otherwise — the avatar always has something to overlap. */}
          <div
            aria-hidden="true"
            className="h-36 w-full overflow-hidden rounded-2xl bg-surface-muted sm:h-48"
          >
            {channel.has_banner ? <ChannelBanner handle={channel.handle} /> : null}
          </div>
          <div className="-mt-9 flex flex-wrap items-end justify-between gap-3 px-2 sm:-mt-10 sm:px-4">
            <Avatar
              src={channel.has_avatar ? channelAvatarUrl(channel.handle) : null}
              name={channel.display_name || channel.handle}
              className="relative z-[1] h-18 w-18 border-4 border-canvas text-[26px] shadow-md sm:h-26 sm:w-26 sm:text-[38px]"
            />
            <div className="flex flex-wrap items-center gap-2 pb-1">
              <ChannelLiveBadge handle={channel.handle} ownerId={channel.owner_id} />
              <DonateButton
                sources={[
                  { kind: "channel", handle: channel.handle },
                  { kind: "user", userId: channel.owner_id },
                ]}
                name={channel.display_name || channel.handle}
              />
              <FollowButton
                handle={channel.handle}
                onDelta={(d) =>
                  setChannel((c) => (c ? { ...c, follower_count: Math.max(0, c.follower_count + d) } : c))
                }
              />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-1 px-2 sm:px-4">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            {channel.display_name || channel.handle}
          </h1>
          <p className="text-[13px] text-fg-muted tabular-nums">
            @{channel.handle} · {formatCount(channel.follower_count)} followers
          </p>
          {channel.description ? (
            <p className="mt-2 max-w-2xl whitespace-pre-wrap text-sm leading-relaxed text-fg-muted">
              {channel.description}
            </p>
          ) : null}
        </div>
      </header>

      {videos.length === 0 ? (
        <EmptyState title="No videos yet" message="This channel has not published anything." />
      ) : (
        <div className="flex flex-col gap-6">
          {/* Sort chips in the shared template pill language (filled = active),
              above a grid that matches the home feed's cards exactly. */}
          <ChannelSortChips sort={sort} onChange={changeSort} />
          <VideoGrid>
            {sortedVideos.slice(0, visibleCount).map((video) => (
              <li key={video.id}>
                <VideoCard video={video} />
              </li>
            ))}
          </VideoGrid>
          {sortedVideos.length > visibleCount ? (
            <LoadMoreButton onClick={() => setVisibleCount((c) => c + PAGE_SIZE)} />
          ) : null}
        </div>
      )}
    </div>
  );
}

// ChannelBanner renders the channel's banner image inside the header's banner
// strip when has_banner says one exists. A broken image (e.g. deleted between
// the view read and the image fetch) unmounts entirely, so the strip falls back
// to its muted fill — nothing shifts around a dead frame.
function ChannelBanner({ handle }: { handle: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- backend-served image, not a static asset
    <img
      src={channelBannerUrl(handle)}
      alt=""
      onError={() => setBroken(true)}
      className="h-full w-full object-cover"
    />
  );
}

// FollowButton toggles a follow on the channel for the signed-in user, in the
// template's follow affordance: an accent-filled "Follow" when not following,
// an outlined "Following" once followed (design-system channel-header pattern,
// matching the app's FOLLOWING vocabulary and the follow/unfollow API). The
// public channel endpoint carries no "is following" flag, so the button starts
// at "Follow" and tracks state locally (follow/unfollow are idempotent
// server-side); onDelta nudges the displayed follower count optimistically.
// Anonymous visitors get a sign-in link instead.
function FollowButton({ handle, onDelta }: { handle: string; onDelta: (d: number) => void }) {
  const { status } = useSession();
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);

  if (status !== "authed") {
    return (
      <LinkButton href="/login" variant="secondary" className="px-5">
        Sign in to follow
      </LinkButton>
    );
  }

  async function toggle() {
    setBusy(true);
    const next = !following;
    try {
      if (next) {
        await api.followChannel(handle);
      } else {
        await api.unfollowChannel(handle);
      }
      setFollowing(next);
      onDelta(next ? 1 : -1);
    } catch {
      // Leave the button state unchanged on failure.
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant={following ? "secondary" : "primary"}
      disabled={busy}
      onClick={() => void toggle()}
      className="px-5"
    >
      {following ? "Following" : "Follow"}
    </Button>
  );
}

// ChannelSortChips is the channel grid's sort switcher in the shared pill-chip
// language (filled = active, outlined = inactive), a role="group" of
// aria-pressed buttons — the same vocabulary as the home feed's FeedSortTabs,
// but client-side (the sort re-orders the already-loaded list, no navigation).
function ChannelSortChips({
  sort,
  onChange,
}: {
  sort: ChannelSort;
  onChange: (next: ChannelSort) => void;
}) {
  return (
    <div role="group" aria-label="Sort videos" className="inline-flex items-center gap-2">
      {CHANNEL_SORTS.map(({ sort: value, label }) => (
        <button
          key={value}
          type="button"
          aria-pressed={sort === value}
          onClick={() => onChange(value)}
          className={
            sort === value
              ? "focus-ring rounded-full border border-accent bg-accent px-4 py-1.5 text-[13px] font-semibold text-accent-fg transition-colors"
              : "focus-ring rounded-full border border-border px-4 py-1.5 text-[13px] font-semibold text-fg-muted transition-colors hover:bg-surface-muted"
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}
