"use client";

import { useEffect, useMemo, useState } from "react";

import { useFormat, useT } from "@/components/I18nProvider";
import { StatsChart } from "@/components/StatsChart";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import { collectPages } from "@/lib/collect-pages";
import type { Channel, ChannelStatsResponse, Video, VideoStatsResponse } from "@/lib/api";
import { useApiResource } from "@/lib/use-api-resource";

import { PlaybackStatsPanel } from "./PlaybackStatsPanel";
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
  const t = useT();
  const { channels, currentHandle, currentChannel, setCurrentHandle } = useStudio();
  const [scope, setScope] = useState<Scope>("channel");

  if (channels.length === 0) {
    return (
      <EmptyState
        title={t("studio.analytics.noChannelsTitle")}
        message={t("studio.analytics.noChannelsMessage")}
      />
    );
  }

  // The "All channels" rollup (GET /me/stats) is owner-scoped by construction —
  // it only spans channels the caller OWNS. A pure editor (zero owned channels)
  // never sees that scope; the label makes the ownership boundary explicit.
  const owned = channels.filter((c) => c.role !== "editor");
  const showAll = owned.length > 0;
  const effectiveScope: Scope = showAll ? scope : "channel";
  const scopeHandles = effectiveScope === "channel" ? [currentHandle] : owned.map((c) => c.handle);
  // GET /videos/{id}/stats is owner-only. When the active channel is one shared
  // with the caller as an editor, the per-video panel would 403 on every pick, so
  // we show a quiet note instead (the channel totals + chart above still load).
  // The "all" scope only ever spans owned channels, so it never hits this.
  const editorScoped = effectiveScope === "channel" && currentChannel?.role === "editor";

  return (
    <div className="flex flex-col gap-6">
      {showAll ? (
        <SegmentedControl<Scope>
          label={t("studio.analytics.scope")}
          value={effectiveScope}
          onChange={setScope}
          options={[
            { value: "channel", label: t("studio.analytics.thisChannel") },
            { value: "all", label: t("studio.analytics.allMine"), count: owned.length },
          ]}
        />
      ) : null}

      {effectiveScope === "channel" ? (
        <ChannelScope handle={currentHandle} name={currentChannel?.display_name ?? currentHandle} />
      ) : (
        <AllChannelsScope
          channels={owned}
          onPickChannel={(handle) => {
            setCurrentHandle(handle);
            setScope("channel");
          }}
        />
      )}

      {editorScoped ? (
        <section className="flex flex-col gap-3 border-t border-border-subtle pt-6">
          <h2 className="text-[15px] font-bold tracking-tight">{t("studio.analytics.perVideo")}</h2>
          <p className="text-sm text-fg-muted">{t("studio.analytics.ownersOnly")}</p>
        </section>
      ) : (
        <VideoStatsSection
          key={effectiveScope + currentHandle}
          handles={scopeHandles}
          channels={channels}
        />
      )}
    </div>
  );
}

// ChannelScope — the current channel's aggregated totals + 30-day chart.
function ChannelScope({ handle, name }: { handle: string; name: string }) {
  const t = useT();
  // useApiResource derives status from the CURRENT deps instead of storing it, which
  // is load-bearing here: this component gets no `key` from its render site (unlike
  // VideoStatsSection below), so a studio channel switch updates it in place. With a
  // stored status the section relabelled to the new handle while still showing the
  // previous channel's totals until the refetch landed.
  const {
    status,
    data: stats,
    retry,
  } = useApiResource<ChannelStatsResponse>(
    // An empty handle means the studio has not resolved a channel yet. Never settling
    // holds the spinner, which is what the previous early-return did.
    (signal) =>
      handle === ""
        ? new Promise<ChannelStatsResponse>(() => {})
        : api.getChannelStats(handle, signal),
    [handle],
  );

  if (status === "loading") {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t("studio.analytics.loadingChannel")} />
      </div>
    );
  }
  if (status === "error" || !stats) {
    return (
      <ErrorState message={t("studio.analytics.channelError")} onRetry={retry} />
    );
  }

  return (
    <section aria-label={t("studio.analytics.statsFor", { handle })} className="flex flex-col gap-4">
      <TotalsGrid
        items={[
          // "Views · 28 days" is the design's Studio headline stat, derived
          // honestly from the real 30-entry daily_views series (last 28 days
          // summed). No period-over-period delta — the series carries no prior
          // period, so a "↑ N% vs previous" would be invented.
          { label: t("studio.stats.views28d"), value: views28d(stats.daily_views) },
          { label: t("studio.stats.views"), value: stats.views },
          { label: t("studio.stats.likes"), value: stats.likes },
          { label: t("studio.stats.dislikes"), value: stats.dislikes },
          { label: t("studio.stats.comments"), value: stats.comments },
          { label: t("studio.stats.followers"), value: stats.followers },
          { label: t("studio.stats.videos"), value: stats.videos },
        ]}
      />
      <StatsChart series={stats.daily_views} label={t("studio.analytics.dailyFor", { handle })} />
      <span className="sr-only">{t("studio.analytics.showingFor", { name })}</span>
    </section>
  );
}

// AllChannelsScope — the owner-scoped account rollup (GET /me/stats): summed
// totals, the aggregated daily chart, and a per-channel breakdown table whose
// rows switch the studio scope to that channel. `channels` is only used to
// refetch when the owned set changes.
function AllChannelsScope({
  channels,
  onPickChannel,
}: {
  channels: Channel[];
  onPickChannel: (handle: string) => void;
}) {
  const t = useT();
  const { formatCount } = useFormat();
  // Same derived-status reasoning as ChannelScope. Passing the joined handles as the
  // dep also retires the exhaustive-deps suppression this effect used to need.
  const handleKey = channels.map((c) => c.handle).join(",");
  const {
    status,
    data: stats,
    retry,
  } = useApiResource<AllChannelsStats>((signal) => getAllChannelsStats(signal), [handleKey]);

  if (status === "loading") {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t("studio.analytics.loadingAll")} />
      </div>
    );
  }
  if (status === "error" || !stats) {
    return (
      <ErrorState message={t("studio.analytics.allError")} onRetry={retry} />
    );
  }

  return (
    <section aria-label={t("studio.analytics.acrossAll")} className="flex flex-col gap-4">
      <TotalsGrid
        items={[
          { label: t("studio.stats.views28d"), value: views28d(stats.daily_views) },
          { label: t("studio.stats.views"), value: stats.totals.views },
          { label: t("studio.stats.likes"), value: stats.totals.likes },
          { label: t("studio.stats.dislikes"), value: stats.totals.dislikes },
          { label: t("studio.stats.comments"), value: stats.totals.comments },
          { label: t("studio.stats.followers"), value: stats.totals.followers },
          { label: t("studio.stats.videos"), value: stats.totals.videos },
        ]}
      />
      <StatsChart series={stats.daily_views} label={t("studio.analytics.dailyAll")} />
      <div className="relative overflow-x-auto rounded-2xl border border-border-subtle bg-surface">
        <table className="w-full min-w-[32rem] text-sm">
          <caption className="sr-only">
            {t("studio.analytics.breakdownCaption")}
          </caption>
          <thead>
            <tr className="border-b border-border-subtle text-left text-[12px] font-semibold uppercase tracking-[0.06em] text-fg-muted">
              <th scope="col" className="px-4 py-2.5 font-semibold">
                {t("studio.analytics.colChannel")}
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                {t("studio.stats.views")}
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                {t("studio.stats.views28d")}
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                {t("studio.stats.followers")}
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                {t("studio.stats.videos")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {stats.channels.map((c) => (
              <tr key={c.id} className="transition-colors hover:bg-surface-muted">
                <th scope="row" className="px-4 py-2.5 text-left font-medium text-fg">
                  <button
                    type="button"
                    onClick={() => onPickChannel(c.handle)}
                    className="focus-ring rounded text-left hover:underline"
                  >
                    {c.display_name}
                    <span className="ml-1 font-normal text-fg-muted">@{c.handle}</span>
                  </button>
                </th>
                <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                  {formatCount(c.views)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                  {formatCount(c.views_28d)}
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
  const t = useT();
  const [status, setStatus] = useState<Status>("loading");
  const [options, setOptions] = useState<VideoOption[]>([]);
  // The picker walks at most DEFAULT_MAX_PAGES pages per channel; say so when it stopped short.
  const [truncated, setTruncated] = useState(false);
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
    // Set in the .then below with the options, never synchronously in the effect.
    let cut = false;
    // An empty scope resolves to an empty option list in the .then below (setState
    // in a callback, not synchronously in the effect body).
    Promise.all(
      active.map((h) =>
        // The picker offers EVERY video, so it walks the paged list to its end.
        collectPages<Video>(
          (window) =>
            api
              .listChannelVideos(h, undefined, controller.signal, window)
              .then((res) => ({ items: res.videos, total: res.total })),
          { signal: controller.signal, onTruncated: () => (cut = true) },
        ).then((videos): VideoOption[] =>
          videos.map((v) => ({
            id: v.id,
            title: v.title,
            channelName: nameByHandle.get(h) ?? `@${h}`,
          })),
        ),
      ),
    )
      .then((lists) => {
        setOptions(lists.flat());
        setTruncated(cut);
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
      <h2 className="text-[15px] font-bold tracking-tight">{t("studio.analytics.perVideo")}</h2>
      {status === "loading" ? (
        <div className="flex justify-center py-8">
          <Spinner label={t("studio.analytics.loadingVideos")} />
        </div>
      ) : status === "error" ? (
        <ErrorState
          message={t("studio.analytics.videosError")}
          onRetry={() => {
            setStatus("loading");
            setReloadKey((k) => k + 1);
          }}
        />
      ) : options.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("studio.analytics.noVideos")}</p>
      ) : (
        <>
          <div className="max-w-md">
            <Select
              label={t("studio.analytics.videoLabel")}
              value={videoId}
              onChange={(e) => setVideoId(e.target.value)}
              aria-label={t("studio.analytics.videoAria")}
            >
              <option value="">{t("studio.analytics.chooseVideo")}</option>
              {options.map((v) => (
                <option key={v.id} value={v.id}>
                  {multiChannel ? t("studio.analytics.videoOption", { channel: v.channelName, title: v.title }) : v.title}
                </option>
              ))}
            </Select>
            {truncated ? (
              <p className="mt-1 text-xs text-fg-muted">
                {t("studio.analytics.truncated")}
              </p>
            ) : null}
          </div>
          {videoId ? <VideoStatsPanel key={videoId} videoId={videoId} /> : null}
        </>
      )}
    </section>
  );
}

function VideoStatsPanel({ videoId }: { videoId: string }) {
  const t = useT();
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
        <Spinner label={t("studio.analytics.loadingVideo")} />
      </div>
    );
  }
  if (status === "error" || !stats) {
    return (
      <ErrorState
        message={t("studio.analytics.videoError")}
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
          { label: t("studio.stats.views"), value: stats.views },
          { label: t("studio.stats.likes"), value: stats.likes },
          { label: t("studio.stats.dislikes"), value: stats.dislikes },
          { label: t("studio.stats.comments"), value: stats.comments },
        ]}
      />
      <StatsChart series={stats.daily_views} label={t("studio.analytics.dailyVideo")} />
      <PlaybackStatsPanel videoId={videoId} />
    </div>
  );
}

function TotalsGrid({ items }: { items: Array<{ label: string; value: number }> }) {
  const { formatCount } = useFormat();
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
