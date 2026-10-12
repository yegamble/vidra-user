"use client";

import { useMemo, useState } from "react";

import { AccountModerationMenu } from "@/components/AccountModerationMenu";
import { useSession } from "@/components/auth/AuthProvider";
import { ChannelLiveBadge } from "@/components/ChannelLiveBadge";
import { ChannelVideoCard } from "@/components/ChannelVideoCard";
import { FollowButton } from "@/components/FollowButton";
import { RemoteInteractionButton } from "@/components/RemoteInteractionButton";
import { MessageButton } from "@/components/MessageButton";
import { SupportButton } from "@/components/SupportButton";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { ListTail } from "@/components/ui/ListTail";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api, channelAvatarUrl, channelBannerUrl } from "@/lib/api";
import type { Channel, Video } from "@/lib/api";
import { formatCount, formatMonthYear, pluralize } from "@/lib/format";
import { useApiResource } from "@/lib/use-api-resource";
import { useAppendingList } from "@/lib/use-appending-list";
import { useBrowseAutoLoad } from "@/lib/use-browse-auto-load";
import { useSettledSession } from "@/lib/use-settled-session";
import { useViewerModeration } from "@/lib/use-viewer-moderation";
import { UserText } from "@/components/UserText";

type Section = "videos" | "about";

// Channel-grid sort. Both chips are SERVER sorts: `GET /channels/{handle}/videos`
// takes `sort=-published_at` (newest first, its default) or `sort=published_at`
// (oldest first). Sorting the loaded page client-side would order only the
// first page, so a channel's real oldest video would never surface.
type ChannelSort = "latest" | "oldest";
const CHANNEL_SORTS: { sort: ChannelSort; label: string }[] = [
  { sort: "latest", label: "Latest" },
  { sort: "oldest", label: "Oldest" },
];
const SERVER_SORT = { latest: "-published_at", oldest: "published_at" } as const;

// Channel reads include viewer-specific follow state and video visibility.
// Wait for restoration and discard data when the session identity changes.
export function ChannelView({ handle }: { handle: string }) {
  const { status, user } = useSession();
  if (status === "restoring") return <Spinner label="Loading channel" />;
  // Session changes also discard pending optimistic edits and editor state.
  return <ChannelForViewer key={`${handle}:${status}:${user?.id ?? ""}`} handle={handle} />;
}

function ChannelForViewer({ handle }: { handle: string }) {
  const { user, status: sessionStatus } = useSession();
  const { status, data, retry, setData } = useApiResource<{ channel: Channel | null }>(
    async (signal) => {
      if (signal.aborted || sessionStatus === "restoring") return new Promise(() => {});
      try {
        return { channel: await api.getChannel(handle, signal) };
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return { channel: null };
        throw err;
      }
    },
    [handle, sessionStatus, user?.id],
  );
  const channel = data?.channel ?? null;
  const [sort, setSort] = useState<ChannelSort>("latest");
  const [section, setSection] = useState<Section>("videos");
  const autoLoad = useBrowseAutoLoad();
  // The grid pages from the server (limit/offset) and re-asks from page one
  // when the handle or sort changes. Remounting on a session change is the
  // outer `key`, so the viewer is fixed for this component's life.
  const list = useAppendingList<Video>({
    queryKey: JSON.stringify([handle, sort]),
    getId: (v) => v.id,
    load: (window, signal) =>
      api
        .listChannelVideos(handle, undefined, signal, { ...window, sort: SERVER_SORT[sort] })
        .then((res) => ({ items: res.videos, total: res.total })),
  });
  const serverVideos = list.items;
  // Has THIS viewer muted or blocked the channel's owner? `GET
  // /channels/{handle}/videos` already answers with none of their videos for
  // such a viewer (A16 ruling), so on a hard load `serverVideos` is empty and
  // this only names WHY. It earns its keep on the mute the viewer just made
  // from the menu below: the same predicate applied here hides the grid at
  // once, with no refetch, and the next load agrees because the server does
  // the same thing.
  const settledSession = useSettledSession();
  const { mutedIds, blockedIds } = useViewerModeration(settledSession);
  const ownerHidden =
    channel !== null && (mutedIds.has(channel.owner_id) || blockedIds.has(channel.owner_id));
  const videos = useMemo(() => (ownerHidden ? [] : serverVideos), [ownerHidden, serverVideos]);
  // The header count is the server's total, not the length of the loaded pages.
  const videoCount = ownerHidden ? 0 : (list.total ?? videos.length);

  function changeSort(next: ChannelSort) {
    if (next !== sort) setSort(next);
  }

  if (status === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Loading channel" />
      </div>
    );
  }
  if (status === "ready" && channel === null) {
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
                {videoCount} {videoCount === 1 ? "video" : "videos"}
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
                      setData((current) => current?.channel ? {
                        ...current,
                        channel: { ...current.channel, follower_count: Math.max(0, current.channel.follower_count + d) },
                      } : current)
                    }
                  />
                  <RemoteInteractionButton kind="channel" id={channel.handle} />
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
                  {/* Mute / Block, in the same overflow-menu idiom the comment
                      row uses. Until the A16 ruling this was the ONLY thing a
                      viewer could not do from here: an account that never
                      commented could not be muted from the UI at all. */}
                  <AccountModerationMenu
                    accountId={channel.owner_id}
                    accountName={name}
                    channelHandles={[channel.handle]}
                    session={settledSession}
                  />
                </>
              )}
            </div>
          </div>
        </div>
        {channel.description ? (
          <UserText
            variant="description"
            text={channel.description}
            className="px-2 text-subhead leading-relaxed text-fg-muted sm:max-w-[640px] sm:px-4"
          />
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
          ownerHidden ? (
            // The honest empty state. "No videos yet" would be a lie told to
            // the one viewer who can see it: the channel publishes, and this
            // viewer asked not to see it. The unmute is the menu in the
            // header, two lines up, which is why the header stays.
            <EmptyState
              title="Videos hidden"
              message={
                blockedIds.has(channel.owner_id)
                  ? "You blocked this account, so its videos are hidden from you. Unblock it from the menu above to see them again."
                  : "You muted this account, so its videos are hidden from you. Unmute it from the menu above to see them again."
              }
            />
          ) : list.status === "error" ? (
            <ErrorState message="Could not load this channel's videos." onRetry={list.reload} />
          ) : list.status === "ready" && videos.length === 0 && sort === "latest" ? (
            <EmptyState title="No videos yet" message="This channel has not published anything." />
          ) : (
            <div className="flex flex-col gap-5">
              {/* Sort chips in the shared template pill language (filled =
                  active), above the dense channel grid. */}
              <ChannelSortChips sort={sort} onChange={changeSort} />
              {list.status === "loading" ? (
                <div className="flex justify-center py-12">
                  <Spinner label="Loading videos" />
                </div>
              ) : (
                <>
                  <ul
                    aria-label={`Videos by ${name}`}
                    className="grid grid-cols-2 gap-x-4 gap-y-6 lg:grid-cols-4 lg:gap-x-[18px]"
                  >
                    {videos.map((video) => (
                      <li key={video.id}>
                        <ChannelVideoCard video={video} onDeleted={() => list.drop((v) => v.id !== video.id)} />
                      </li>
                    ))}
                  </ul>
                  <ListTail
                    hasMore={list.hasMore}
                    autoLoad={autoLoad}
                    busy={list.moreStatus === "loading"}
                    error={list.moreStatus === "error" ? "Could not load more videos." : null}
                    onLoadMore={list.loadMore}
                  />
                </>
              )}
            </div>
          )
        ) : (
          <ChannelAbout channel={channel} videoCount={videoCount} />
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
// but server-side (a chip re-asks the endpoint from page one, no navigation).
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
