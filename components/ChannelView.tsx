"use client";

import { useEffect, useMemo, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { ChannelLiveBadge } from "@/components/ChannelLiveBadge";
import { ChannelVideoCard } from "@/components/ChannelVideoCard";
import { FollowButton } from "@/components/FollowButton";
import { MessageButton } from "@/components/MessageButton";
import { SupportButton } from "@/components/SupportButton";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadMoreButton, PAGE_SIZE } from "@/components/ui/LoadMoreButton";
import { Spinner } from "@/components/ui/Spinner";
import { Tabs } from "@/components/ui/Tabs";
import { ApiError, api, channelAvatarUrl, channelBannerUrl } from "@/lib/api";
import type { Channel, Video } from "@/lib/api";
import { formatCount, formatMonthYear } from "@/lib/format";

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
  const { user, status: sessionStatus } = useSession();
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

  const name = channel.display_name || channel.handle;
  // The viewer is the channel owner ⇒ the visitor action cluster (Follow /
  // Support / Message) is meaningless (you can't follow, message, or tip
  // yourself — messaging yourself is a 422), so it is hidden. Owner-only live
  // discovery (ChannelLiveBadge) stays; it self-gates to the owner internally.
  const isOwner = user?.id === channel.owner_id;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <div>
          {/* Banner strip: the channel image when one exists, a quiet muted
              block otherwise — the avatar always has something to overlap. */}
          <div
            aria-hidden="true"
            className="h-[150px] w-full overflow-hidden rounded-2xl bg-surface-muted sm:h-[190px]"
          >
            {channel.has_banner ? <ChannelBanner handle={channel.handle} /> : null}
          </div>
          {/* Avatar + name + action cluster on one baseline-aligned row (design
              overlaps the avatar over the banner). It wraps on phones so the
              name drops to its own line below the avatar/cluster; on sm+ the name
              takes the middle and the cluster right-aligns. */}
          <div className="-mt-9 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 px-2 sm:-mt-10 sm:flex-nowrap sm:gap-5 sm:px-4">
            <Avatar
              src={channel.has_avatar ? channelAvatarUrl(channel.handle) : null}
              name={name}
              className="relative z-[1] h-18 w-18 shrink-0 border-[3px] border-canvas text-[26px] shadow-md sm:h-26 sm:w-26 sm:border-4 sm:text-[38px]"
            />
            <div className="order-last w-full min-w-0 pb-1 sm:order-none sm:w-auto sm:flex-1">
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{name}</h1>
              <p className="mt-0.5 text-[13px] tabular-nums text-fg-muted">
                @{channel.handle} · {formatCount(channel.follower_count)} followers ·{" "}
                {videos.length} {videos.length === 1 ? "video" : "videos"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 pb-1 sm:shrink-0">
              <ChannelLiveBadge handle={channel.handle} ownerId={channel.owner_id} />
              {isOwner ? null : (
                <>
                  <FollowButton
                    handle={channel.handle}
                    onDelta={(d) =>
                      setChannel((c) =>
                        c ? { ...c, follower_count: Math.max(0, c.follower_count + d) } : c,
                      )
                    }
                  />
                  <SupportButton
                    sources={[
                      { kind: "channel", handle: channel.handle },
                      { kind: "user", userId: channel.owner_id },
                    ]}
                    name={name}
                    variant="outline"
                    compact
                  />
                  {sessionStatus === "authed" ? (
                    <MessageButton recipientId={channel.owner_id} variant="pill" compact />
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
        {channel.description ? (
          <p className="whitespace-pre-wrap px-2 text-sm leading-relaxed text-fg-muted sm:max-w-[640px] sm:px-4">
            {channel.description}
          </p>
        ) : null}
      </header>

      <Tabs
        label="Channel sections"
        tabs={[
          {
            id: "videos",
            label: "Videos",
            panel:
              videos.length === 0 ? (
                <EmptyState
                  title="No videos yet"
                  message="This channel has not published anything."
                />
              ) : (
                <div className="flex flex-col gap-5">
                  {/* Sort chips in the shared template pill language (filled =
                      active), above the dense channel grid. */}
                  <ChannelSortChips sort={sort} onChange={changeSort} />
                  <ul
                    aria-label={`Videos by ${name}`}
                    className="grid grid-cols-2 gap-x-4 gap-y-6 lg:grid-cols-4 lg:gap-x-[18px]"
                  >
                    {sortedVideos.slice(0, visibleCount).map((video) => (
                      <li key={video.id}>
                        <ChannelVideoCard
                          video={video}
                          onDeleted={() =>
                            setVideos((cur) => cur.filter((v) => v.id !== video.id))
                          }
                        />
                      </li>
                    ))}
                  </ul>
                  {sortedVideos.length > visibleCount ? (
                    <LoadMoreButton onClick={() => setVisibleCount((c) => c + PAGE_SIZE)} />
                  ) : null}
                </div>
              ),
          },
          {
            id: "about",
            label: "About",
            panel: <ChannelAbout channel={channel} videoCount={videos.length} />,
          },
        ]}
      />
    </div>
  );
}

// ChannelAbout is the About tab: the channel's own facts, all real fields on the
// public Channel payload (join date, follower count) plus the listed-video count.
// A "Playlists" tab is intentionally absent — no contract lists a channel's public
// playlists (only /me/playlists + create/get-by-id exist), so it is a backend
// dependency, not stubbed here.
function ChannelAbout({ channel, videoCount }: { channel: Channel; videoCount: number }) {
  const joined = formatMonthYear(channel.created_at);
  const facts: { label: string; value: string }[] = [
    ...(joined ? [{ label: "Joined", value: joined }] : []),
    { label: "Followers", value: formatCount(channel.follower_count) },
    { label: "Videos", value: String(videoCount) },
  ];
  return (
    <div className="max-w-2xl">
      <dl className="divide-y divide-border-subtle overflow-hidden rounded-[14px] bg-surface-muted">
        {facts.map((f) => (
          <div key={f.label} className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-fg-muted">{f.label}</dt>
            <dd className="text-sm font-semibold tabular-nums text-fg">{f.value}</dd>
          </div>
        ))}
      </dl>
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
