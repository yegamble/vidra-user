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
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api, channelAvatarUrl, channelBannerUrl } from "@/lib/api";
import type { Channel, Video } from "@/lib/api";
import { formatCount, formatMonthYear, pluralize } from "@/lib/format";

type Status = "loading" | "notfound" | "error" | "ready";
type Section = "videos" | "about";

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
  const [section, setSection] = useState<Section>("videos");

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
          {/* Apple Music-style banner: the channel image when one exists, a
              soft monochrome gradient otherwise — the avatar always has an
              elevated surface to overlap. */}
          <div
            aria-hidden="true"
            className="h-[160px] w-full overflow-hidden rounded-2xl bg-gradient-to-br from-surface-strong via-surface-muted to-surface-muted sm:h-[220px]"
          >
            {channel.has_banner ? <ChannelBanner handle={channel.handle} /> : null}
          </div>
          {/* Overlapping 96px avatar + name/meta + action cluster on one
              baseline-aligned row. On phones it stacks: the avatar overlaps the
              banner on its own line, then the name/meta, then the action cluster
              — so Follow/Support/Message anchor to the name block and never float
              over the banner seam. On sm+ the name takes the middle and the
              cluster right-aligns on the avatar's baseline. */}
          <div className="-mt-12 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 px-2 sm:flex-nowrap sm:gap-5 sm:px-4">
            <Avatar
              src={channel.has_avatar ? channelAvatarUrl(channel.handle) : null}
              name={name}
              className="relative z-[1] h-24 w-24 shrink-0 border-4 border-canvas text-[36px] shadow-soft"
            />
            <div className="order-last w-full min-w-0 pb-1 sm:order-none sm:w-auto sm:flex-1">
              <h1 className="text-title sm:text-large-title">{name}</h1>
              <p className="mt-1 text-subhead tabular-nums text-fg-muted">
                @{channel.handle} · {formatCount(channel.follower_count)}{" "}
                {pluralize(channel.follower_count, "follower")} ·{" "}
                {videos.length} {videos.length === 1 ? "video" : "videos"}
              </p>
            </div>
            <div className="order-last flex w-full flex-wrap items-center gap-2 pb-1 sm:order-none sm:w-auto sm:shrink-0">
              <ChannelLiveBadge handle={channel.handle} ownerId={channel.owner_id} />
              {isOwner ? null : (
                <>
                  <FollowButton
                    handle={channel.handle}
                    channelName={name}
                    initialFollowing={channel.is_following}
                    initialNotificationSetting={channel.notification_setting}
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
          <p className="whitespace-pre-wrap px-2 text-subhead leading-relaxed text-fg-muted sm:max-w-[640px] sm:px-4">
            {channel.description}
          </p>
        ) : null}
      </header>

      {/* Section switcher in the app's segmented-control language (not a tab
          strip). The panel below swaps with the selected section. */}
      <div className="flex flex-col gap-5">
        <SegmentedControl
          label="Channel sections"
          value={section}
          onChange={setSection}
          options={[
            { value: "videos", label: "Videos" },
            { value: "about", label: "About" },
          ]}
        />
        {section === "videos" ? (
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
          )
        ) : (
          <ChannelAbout channel={channel} videoCount={videos.length} />
        )}
      </div>
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
      <dl className="divide-y divide-border-subtle overflow-hidden rounded-2xl bg-surface-muted">
        {facts.map((f) => (
          <div key={f.label} className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-subhead text-fg-muted">{f.label}</dt>
            <dd className="text-subhead font-semibold tabular-nums text-fg">{f.value}</dd>
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
