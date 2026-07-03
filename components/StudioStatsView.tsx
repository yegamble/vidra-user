"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { StatsChart } from "@/components/StatsChart";
import { useSession } from "@/components/auth/AuthProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import type { Channel, ChannelStatsResponse, Video, VideoStatsResponse } from "@/lib/api";
import { formatCount } from "@/lib/format";

type Status = "loading" | "error" | "ready";

// StudioStatsView is the creator statistics page (/studio/stats): pick one of
// your channels to see its aggregated totals + 30-day views chart, then drill
// into any single video's stats. Both stats endpoints are owner-only (a
// non-owner is a 404), so the whole surface is session-gated like the studio.
export function StudioStatsView() {
  const { status } = useSession();

  if (status !== "authed") {
    return (
      <EmptyState
        title="Sign in to see your stats"
        message={
          <>
            <Link href="/login" className="underline hover:text-zinc-700 dark:hover:text-zinc-200">
              Sign in
            </Link>{" "}
            to see how your channels and videos are doing.
          </>
        }
      />
    );
  }

  return <StatsHome />;
}

function StatsHome() {
  const [status, setStatus] = useState<Status>("loading");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getMyChannels(controller.signal)
      .then((res) => {
        setChannels(res.channels);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [reloadKey]);

  if (status === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Loading your channels" />
      </div>
    );
  }
  if (status === "error") {
    return (
      <ErrorState
        message="Could not load your channels."
        onRetry={() => {
          setStatus("loading");
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }
  if (channels.length === 0) {
    return (
      <EmptyState
        title="No channels yet"
        message={
          <>
            Stats appear once you publish.{" "}
            <Link href="/studio" className="underline hover:text-zinc-700 dark:hover:text-zinc-200">
              Create a channel in the studio
            </Link>{" "}
            to get started.
          </>
        }
      />
    );
  }

  return <ChannelStatsSection channels={channels} />;
}

function ChannelStatsSection({ channels }: { channels: Channel[] }) {
  const [handle, setHandle] = useState(channels[0].handle);
  const [status, setStatus] = useState<Status>("loading");
  const [stats, setStats] = useState<ChannelStatsResponse | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getChannelStats(handle, controller.signal)
      .then((res) => {
        setStats(res);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [handle, reloadKey]);

  return (
    <div className="flex flex-col gap-6">
      <label className="flex max-w-xs flex-col gap-1 text-sm">
        <span className="font-medium">Channel</span>
        <select
          value={handle}
          onChange={(e) => {
            setStatus("loading");
            setHandle(e.target.value);
          }}
          aria-label="Stats channel"
          className="rounded border border-zinc-300 px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
        >
          {channels.map((ch) => (
            <option key={ch.id} value={ch.handle}>
              {ch.display_name} (@{ch.handle})
            </option>
          ))}
        </select>
      </label>

      {status === "loading" ? (
        <div className="flex justify-center py-16">
          <Spinner label="Loading channel stats" />
        </div>
      ) : status === "error" || !stats ? (
        <ErrorState
          message="Could not load this channel's stats."
          onRetry={() => {
            setStatus("loading");
            setReloadKey((k) => k + 1);
          }}
        />
      ) : (
        <section aria-label={`Stats for @${handle}`} className="flex flex-col gap-4">
          <TotalsGrid
            items={[
              { label: "Views", value: stats.views },
              { label: "Likes", value: stats.likes },
              { label: "Dislikes", value: stats.dislikes },
              { label: "Comments", value: stats.comments },
              { label: "Followers", value: stats.followers },
              { label: "Videos", value: stats.videos },
            ]}
          />
          <StatsChart series={stats.daily_views} label={`Daily views for @${handle}`} />
        </section>
      )}

      <VideoStatsSection key={handle} handle={handle} />
    </div>
  );
}

// VideoStatsSection lists the channel's videos (the owner view returns every
// state) and shows one selected video's stats. Remounted per channel (key) so
// a stale selection never points into another channel's list.
function VideoStatsSection({ handle }: { handle: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [videos, setVideos] = useState<Video[]>([]);
  const [videoId, setVideoId] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .listChannelVideos(handle, undefined, controller.signal)
      .then((res) => {
        setVideos(res.videos);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [handle, reloadKey]);

  return (
    <section className="flex flex-col gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
      <h2 className="text-lg font-semibold">Per-video stats</h2>
      {status === "loading" ? (
        <div className="flex justify-center py-8">
          <Spinner label="Loading your videos" />
        </div>
      ) : status === "error" ? (
        <ErrorState
          message="Could not load this channel's videos."
          onRetry={() => {
            setStatus("loading");
            setReloadKey((k) => k + 1);
          }}
        />
      ) : videos.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No videos in this channel yet.
        </p>
      ) : (
        <>
          <label className="flex max-w-md flex-col gap-1 text-sm">
            <span className="font-medium">Video</span>
            <select
              value={videoId}
              onChange={(e) => setVideoId(e.target.value)}
              aria-label="Stats video"
              className="rounded border border-zinc-300 px-3 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">— choose a video —</option>
              {videos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title}
                </option>
              ))}
            </select>
          </label>
          {videoId ? <VideoStatsPanel key={videoId} videoId={videoId} /> : null}
        </>
      )}
    </section>
  );
}

function VideoStatsPanel({ videoId }: { videoId: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [stats, setStats] = useState<VideoStatsResponse | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getVideoStats(videoId, controller.signal)
      .then((res) => {
        setStats(res);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [videoId, reloadKey]);

  if (status === "loading") {
    return (
      <div className="flex justify-center py-8">
        <Spinner label="Loading video stats" />
      </div>
    );
  }
  if (status === "error" || !stats) {
    return (
      <ErrorState
        message="Could not load this video's stats."
        onRetry={() => {
          setStatus("loading");
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <TotalsGrid
        items={[
          { label: "Views", value: stats.views },
          { label: "Likes", value: stats.likes },
          { label: "Dislikes", value: stats.dislikes },
          { label: "Comments", value: stats.comments },
        ]}
      />
      <StatsChart series={stats.daily_views} label="Daily views for this video" />
    </div>
  );
}

function TotalsGrid({ items }: { items: Array<{ label: string; value: number }> }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex flex-col gap-0.5 rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
        >
          <dt className="text-xs text-zinc-500 dark:text-zinc-400">{item.label}</dt>
          <dd
            className="text-lg font-semibold tabular-nums"
            title={String(item.value)}
          >
            {formatCount(item.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
