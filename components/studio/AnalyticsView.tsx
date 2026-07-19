"use client";

import { useEffect, useMemo, useState } from "react";

import { StatsChart } from "@/components/StatsChart";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import type { Channel, ChannelStatsResponse, Video, VideoStatsResponse } from "@/lib/api";
import { formatCount } from "@/lib/format";

import { type Status } from "./shared";
import { useStudio } from "./StudioContext";
import { type AllChannelsStats, getAllChannelsStats, views28d } from "./all-channels-stats";

type Scope = "channel" | "all";

// AnalyticsView is the Studio Analytics tab. It shows creator stats at two
// scopes via a SegmentedControl: "This channel" (the studio's current channel)
// and "All channels" (a rollup across every channel the caller owns). Below the
// scope totals sits the per-video stats panel, whose picker spans the active
// scope. Owner-only endpoints, so the whole surface is session-gated by the
// studio shell.
export function AnalyticsView() {
  const { channels, currentHandle, currentChannel } = useStudio();
  const [scope, setScope] = useState<Scope>("channel");

  if (channels.length === 0) {
    return (
      <EmptyState
        title="No channels yet"
        message="Analytics appear once you publish. Create a channel to get started."
      />
    );
  }

  const scopeHandles = scope === "channel" ? [currentHandle] : channels.map((c) => c.handle);

  return (
    <div className="flex flex-col gap-6">
      <SegmentedControl<Scope>
        label="Analytics scope"
        value={scope}
        onChange={setScope}
        options={[
          { value: "channel", label: "This channel" },
          { value: "all", label: "All channels", count: channels.length },
        ]}
      />

      {scope === "channel" ? (
        <ChannelScope handle={currentHandle} name={currentChannel?.display_name ?? currentHandle} />
      ) : (
        <AllChannelsScope channels={channels} />
      )}

      <VideoStatsSection key={scope + currentHandle} handles={scopeHandles} channels={channels} />
    </div>
  );
}

// ChannelScope — the current channel's aggregated totals + 30-day chart.
function ChannelScope({ handle, name }: { handle: string; name: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [stats, setStats] = useState<ChannelStatsResponse | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (handle === "") return;
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

  if (status === "loading") {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading channel stats" />
      </div>
    );
  }
  if (status === "error" || !stats) {
    return (
      <ErrorState
        message="Could not load this channel's stats."
        onRetry={() => {
          setStatus("loading");
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }

  return (
    <section aria-label={`Stats for @${handle}`} className="flex flex-col gap-4">
      <TotalsGrid
        items={[
          // "Views · 28 days" is the design's Studio headline stat, derived
          // honestly from the real 30-entry daily_views series (last 28 days
          // summed). No period-over-period delta — the series carries no prior
          // period, so a "↑ N% vs previous" would be invented.
          { label: "Views · 28d", value: views28d(stats.daily_views) },
          { label: "Views", value: stats.views },
          { label: "Likes", value: stats.likes },
          { label: "Dislikes", value: stats.dislikes },
          { label: "Comments", value: stats.comments },
          { label: "Followers", value: stats.followers },
          { label: "Videos", value: stats.videos },
        ]}
      />
      <StatsChart series={stats.daily_views} label={`Daily views for @${handle}`} />
      <span className="sr-only">Showing analytics for {name}.</span>
    </section>
  );
}

// AllChannelsScope — the client-side rollup across all owned channels: summed
// totals, a merged daily chart, and a per-channel breakdown table.
function AllChannelsScope({ channels }: { channels: Channel[] }) {
  const [status, setStatus] = useState<Status>("loading");
  const [stats, setStats] = useState<AllChannelsStats | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getAllChannelsStats(channels, controller.signal)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels.map((c) => c.handle).join(","), reloadKey]);

  if (status === "loading") {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading all-channel stats" />
      </div>
    );
  }
  if (status === "error" || !stats) {
    return (
      <ErrorState
        message="Could not load your all-channel stats."
        onRetry={() => {
          setStatus("loading");
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }

  return (
    <section aria-label="Stats across all channels" className="flex flex-col gap-4">
      <TotalsGrid
        items={[
          { label: "Views · 28d", value: views28d(stats.daily_views) },
          { label: "Views", value: stats.totals.views },
          { label: "Likes", value: stats.totals.likes },
          { label: "Dislikes", value: stats.totals.dislikes },
          { label: "Comments", value: stats.totals.comments },
          { label: "Followers", value: stats.totals.followers },
          { label: "Videos", value: stats.totals.videos },
        ]}
      />
      <StatsChart series={stats.daily_views} label="Daily views across all channels" />
      <div className="overflow-x-auto rounded-2xl border border-border-subtle bg-surface">
        <table className="w-full min-w-[32rem] text-sm">
          <caption className="sr-only">Per-channel breakdown</caption>
          <thead>
            <tr className="border-b border-border-subtle text-left text-[12px] font-semibold uppercase tracking-[0.06em] text-fg-muted">
              <th scope="col" className="px-4 py-2.5 font-semibold">
                Channel
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                Views · 28d
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                Views
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                Followers
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                Videos
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {stats.channels.map((c) => (
              <tr key={c.id}>
                <th scope="row" className="px-4 py-2.5 text-left font-medium text-fg">
                  {c.display_name}
                  <span className="ml-1 font-normal text-fg-muted">@{c.handle}</span>
                </th>
                <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                  {formatCount(c.views_28d)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                  {formatCount(c.views)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                  {formatCount(c.followers)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                  {formatCount(c.videos)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type VideoOption = { id: string; title: string; channelName: string };

// VideoStatsSection lists the videos across the active scope (one channel, or all
// owned channels) and shows one selected video's stats. Remounted per scope (key)
// so a stale selection never points into another scope's list.
function VideoStatsSection({ handles, channels }: { handles: string[]; channels: Channel[] }) {
  const [status, setStatus] = useState<Status>("loading");
  const [options, setOptions] = useState<VideoOption[]>([]);
  const [videoId, setVideoId] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const multiChannel = handles.length > 1;
  const nameByHandle = useMemo(
    () => new Map(channels.map((c) => [c.handle, c.display_name])),
    [channels],
  );

  useEffect(() => {
    const active = handles.filter((h) => h !== "");
    const controller = new AbortController();
    // An empty scope resolves to an empty option list in the .then below (setState
    // in a callback, not synchronously in the effect body).
    Promise.all(
      active.map((h) =>
        api
          .listChannelVideos(h, undefined, controller.signal)
          .then((res): VideoOption[] =>
            res.videos.map((v: Video) => ({
              id: v.id,
              title: v.title,
              channelName: nameByHandle.get(h) ?? `@${h}`,
            })),
          ),
      ),
    )
      .then((lists) => {
        setOptions(lists.flat());
        setStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handles.join(","), reloadKey]);

  return (
    <section className="flex flex-col gap-3 border-t border-border-subtle pt-6">
      <h2 className="text-[15px] font-bold tracking-tight">Per-video stats</h2>
      {status === "loading" ? (
        <div className="flex justify-center py-8">
          <Spinner label="Loading your videos" />
        </div>
      ) : status === "error" ? (
        <ErrorState
          message="Could not load your videos."
          onRetry={() => {
            setStatus("loading");
            setReloadKey((k) => k + 1);
          }}
        />
      ) : options.length === 0 ? (
        <p className="text-sm text-fg-muted">No videos yet.</p>
      ) : (
        <>
          <div className="max-w-md">
            <Select
              label="Video"
              value={videoId}
              onChange={(e) => setVideoId(e.target.value)}
              aria-label="Stats video"
            >
              <option value="">— choose a video —</option>
              {options.map((v) => (
                <option key={v.id} value={v.id}>
                  {multiChannel ? `${v.channelName} · ${v.title}` : v.title}
                </option>
              ))}
            </Select>
          </div>
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
          className="flex flex-col gap-2 rounded-2xl bg-surface p-4 shadow-soft"
        >
          <dt className="text-[12px] font-semibold uppercase tracking-[0.06em] text-fg-muted">
            {item.label}
          </dt>
          <dd className="text-title tabular-nums text-fg" title={String(item.value)}>
            {formatCount(item.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
