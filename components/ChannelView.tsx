"use client";

import { useEffect, useState } from "react";

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
import { ApiError, api, channelAvatarUrl, channelBannerUrl } from "@/lib/api";
import type { Channel, Video } from "@/lib/api";
import { formatCount } from "@/lib/format";

type Status = "loading" | "notfound" | "error" | "ready";

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
              <SubscribeButton
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
          <ul className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-6 lg:grid-cols-4">
            {videos.slice(0, visibleCount).map((video) => (
              <li key={video.id}>
                <VideoCard video={video} />
              </li>
            ))}
          </ul>
          {videos.length > visibleCount ? (
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

// SubscribeButton toggles a follow on the channel for the signed-in user. The
// public channel endpoint carries no "is following" flag, so the button starts
// at "Subscribe" and tracks state locally (follow/unfollow are idempotent
// server-side); onDelta nudges the displayed follower count optimistically.
// Anonymous visitors get a sign-in link instead.
function SubscribeButton({ handle, onDelta }: { handle: string; onDelta: (d: number) => void }) {
  const { status } = useSession();
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  if (status !== "authed") {
    return (
      <LinkButton href="/login" variant="secondary" className="px-5">
        Sign in to subscribe
      </LinkButton>
    );
  }

  async function toggle() {
    setBusy(true);
    const next = !subscribed;
    try {
      if (next) {
        await api.followChannel(handle);
      } else {
        await api.unfollowChannel(handle);
      }
      setSubscribed(next);
      onDelta(next ? 1 : -1);
    } catch {
      // Leave the button state unchanged on failure.
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant={subscribed ? "secondary" : "primary"}
      disabled={busy}
      onClick={() => void toggle()}
      className="px-5"
    >
      {subscribed ? "Subscribed" : "Subscribe"}
    </Button>
  );
}
