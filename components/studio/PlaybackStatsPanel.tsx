"use client";

import { useFormat, useT } from "@/components/I18nProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import type { PlaybackShare, PlaybackStatsResponse } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import type { Translate } from "@/lib/i18n";
import { useApiResource } from "@/lib/use-api-resource";

// Known device keys; an unknown key falls back to the raw key.
function deviceLabel(t: Translate, key: string): string {
  switch (key) {
    case "mobile":
      return t("studio.playback.device.mobile");
    case "desktop":
      return t("studio.playback.device.desktop");
    case "tv":
      return t("studio.playback.device.tv");
    case "other":
      return t("studio.playback.device.other");
    default:
      return key;
  }
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function watchTime(t: Translate, seconds: number): string {
  if (seconds < 3600) return t("studio.playback.minutes", { n: Math.round(seconds / 60) });
  return t("studio.playback.hours", { n: (seconds / 3600).toFixed(1) });
}

// PlaybackStatsPanel — the last 30 days of anonymous playback aggregates for one
// video (GET /videos/{id}/playback-stats): watch time, average view duration,
// the audience retention curve and the device split. The numbers are folded
// from anonymous beacons server-side; nothing here is per viewer.
export function PlaybackStatsPanel({ videoId }: { videoId: string }) {
  const t = useT();
  const { formatCount } = useFormat();
  const { status, data, retry } = useApiResource<PlaybackStatsResponse>(
    (signal) => api.getVideoPlaybackStats(videoId, signal),
    [videoId],
  );

  if (status === "loading") {
    return (
      <div className="flex justify-center py-8">
        <Spinner label={t("studio.playback.loading")} />
      </div>
    );
  }
  if (status === "error" || !data) {
    return (
      <ErrorState
        message={t("studio.playback.error")}
        onRetry={retry}
      />
    );
  }
  if (data.plays === 0 && data.watch_seconds === 0) {
    return (
      <EmptyState
        title={t("studio.playback.emptyTitle")}
        message={t("studio.playback.emptyMessage")}
      />
    );
  }

  return (
    <section aria-label={t("studio.playback.label")} className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label={t("studio.playback.watchTime")} value={watchTime(t, data.watch_seconds)} />
        <Tile
          label={t("studio.playback.avgDuration")}
          value={formatDuration(data.avg_view_duration_seconds)}
        />
        <Tile label={t("studio.playback.plays")} value={formatCount(data.plays)} />
      </dl>
      {data.retention && data.retention.length > 0 ? (
        <RetentionChart
          retention={data.retention}
          durationSeconds={data.duration_seconds}
        />
      ) : null}
      <DeviceSplit devices={data.devices} />
      <p className="text-xs text-fg-muted">
        {t("studio.playback.note")}
      </p>
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-surface p-4 shadow-soft">
      <dt className="text-[12px] font-semibold uppercase tracking-[0.06em] text-fg-muted">
        {label}
      </dt>
      <dd className="text-title tabular-nums text-fg">{value}</dd>
    </div>
  );
}

// RetentionChart — mean share of each twentieth of the video that a play
// watched (0–100%), as an inline-SVG area + line like StatsChart (no chart
// library). Gridlines at 0/50/100%, labelled axis ends, and a summary label so
// the shape is available without sight.
export function RetentionChart({
  retention,
  durationSeconds,
}: {
  retention: number[];
  durationSeconds: number;
}) {
  const t = useT();
  const width = 300;
  const height = 100;
  const n = retention.length;
  const x = (i: number) => (n === 1 ? width / 2 : (i / (n - 1)) * width);
  const y = (v: number) =>
    height - Math.min(Math.max(v, 0), 1) * (height - 4) - 2;
  const line = retention
    .map(
      (v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`,
    )
    .join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)} ${height} L${x(0).toFixed(1)} ${height} Z`;
  const first = percent(retention[0]);
  const last = percent(retention[n - 1]);

  return (
    <figure className="flex flex-col gap-1.5">
      <h3 className="text-[13px] font-semibold text-fg">{t("studio.playback.retention")}</h3>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={t("studio.playback.retentionLabel", { first, last })}
        preserveAspectRatio="none"
        className="h-32 w-full rounded-xl border border-border-subtle bg-surface"
      >
        {[0, 0.5, 1].map((g) => (
          <line
            key={g}
            x1={0}
            x2={width}
            y1={y(g)}
            y2={y(g)}
            vectorEffect="non-scaling-stroke"
            className="stroke-border-subtle"
          />
        ))}
        <path d={area} className="fill-accent/15" />
        <path
          d={line}
          fill="none"
          vectorEffect="non-scaling-stroke"
          strokeWidth={2}
          className="stroke-accent"
        />
      </svg>
      <figcaption className="flex justify-between text-xs tabular-nums text-fg-muted">
        <span>0:00 · {first}</span>
        <span>
          {durationSeconds > 0 ? formatDuration(durationSeconds) : t("studio.playback.end")} ·{" "}
          {last}
        </span>
      </figcaption>
    </figure>
  );
}

function DeviceSplit({ devices }: { devices: PlaybackShare[] }) {
  const t = useT();
  if (devices.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[13px] font-semibold text-fg">{t("studio.playback.devices")}</h3>
      <ul className="flex flex-col gap-2">
        {devices.map((d) => (
          <li key={d.key} className="flex items-center gap-3 text-sm">
            <span className="w-20 shrink-0 text-fg">
              {deviceLabel(t, d.key)}
            </span>
            <span
              role="img"
              aria-label={t("studio.playback.deviceShare", { device: deviceLabel(t, d.key), percent: percent(d.share) })}
              className="h-2 flex-1 overflow-hidden rounded-full bg-surface-strong"
            >
              <span
                className="block h-full rounded-full bg-accent"
                style={{ width: percent(d.share) }}
              />
            </span>
            <span className="w-12 shrink-0 text-right tabular-nums text-fg-muted">
              {percent(d.share)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
