"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { StudioStorageCard } from "@/components/StudioStorageCard";
import { UploadRecoveryCard } from "@/components/UploadRecoveryCard";
import { ChevronRightIcon, TvIcon, UploadIcon } from "@/components/icons";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinkButton } from "@/components/ui/LinkButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { api, videoThumbnailUrl } from "@/lib/api";
import type { ChannelStatsResponse, Video, VideoStatsResponse } from "@/lib/api";
import { formatCount } from "@/lib/format";

import { StateBadge, type Status } from "./shared";
import { DistributionCard } from "./DistributionCard";
import { useStudio } from "./StudioContext";
import { views28d } from "./all-channels-stats";

// DashboardView is the Studio landing surface ("what changed" cards, YouTube
// Studio model): a quick-stats strip, the latest video, storage + upload
// recovery, the distribution status, and quick actions. Everything is scoped to
// the studio's current channel via the shared context.
export function DashboardView() {
  const { channels, currentChannel } = useStudio();

  if (channels.length === 0) {
    return (
      <section className="flex flex-col gap-4">
        <EmptyState
          icon={<UploadIcon size={24} />}
          title="Welcome to your studio"
          message="Create a channel to publish videos, go live, and see your analytics."
        />
        <div className="flex justify-center">
          <LinkButton href="/studio/channel?create=1">Create your first channel</LinkButton>
        </div>
      </section>
    );
  }

  const handle = currentChannel?.handle ?? "";

  return (
    <div className="flex flex-col gap-6">
      <QuickStatsStrip key={`stats-${handle}`} handle={handle} />
      <div className="grid gap-4 lg:grid-cols-2">
        <LatestVideoCard key={`latest-${handle}`} handle={handle} />
        {currentChannel ? (
          <DistributionCard channel={currentChannel} href="/studio/channel" />
        ) : null}
      </div>
      <StudioStorageCard />
      <UploadRecoveryCard onResumed={() => {}} />
      <QuickActions />
    </div>
  );
}

// QuickStatsStrip — the design's Studio stat cards: Views · 28d, Followers,
// Videos for the current channel, each linking through to Analytics. Real data
// only (from GET /channels/{handle}/stats); it renders nothing on a load failure
// rather than inventing numbers.
function QuickStatsStrip({ handle }: { handle: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [stats, setStats] = useState<ChannelStatsResponse | null>(null);

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
  }, [handle]);

  if (status === "loading") {
    return (
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[86px] rounded-2xl" />
        ))}
      </div>
    );
  }
  if (status === "error" || !stats) return null;

  const cards: Array<{ label: string; value: number }> = [
    { label: "Views · 28d", value: views28d(stats.daily_views) },
    { label: "Followers", value: stats.followers },
    { label: "Videos", value: stats.videos },
  ];

  // A list of stat links (not a <dl>): each card is a whole <Link>, and an <a>
  // is not a valid child of <dl> (it would trip axe's definition-list/dlitem
  // rules). The label/value read as a semibold caption over a large number.
  return (
    <ul className="grid grid-cols-3 gap-3">
      {cards.map((c) => (
        <li key={c.label} className="flex">
          <Link
            href="/studio/analytics"
            className="focus-ring flex flex-1 flex-col gap-2 rounded-2xl bg-surface p-4 shadow-soft transition-transform hover:scale-[1.02]"
          >
            <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-fg-muted">
              {c.label}
            </span>
            <span className="text-title tabular-nums text-fg" title={String(c.value)}>
              {formatCount(c.value)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// LatestVideoCard — the most recent video for the current channel, with its
// engagement counts and a Manage link into the single-video management surface.
function LatestVideoCard({ handle }: { handle: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [video, setVideo] = useState<Video | null>(null);
  const [stats, setStats] = useState<VideoStatsResponse | null>(null);

  useEffect(() => {
    if (handle === "") return;
    const controller = new AbortController();
    api
      .listChannelVideos(handle, undefined, controller.signal)
      .then(async (res) => {
        const latest = res.videos[0] ?? null;
        setVideo(latest);
        if (latest) {
          const s = await api.getVideoStats(latest.id, controller.signal).catch(() => null);
          setStats(s);
        }
        setStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [handle]);

  return (
    <section
      aria-labelledby="latest-video-heading"
      className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-soft"
    >
      <h2 id="latest-video-heading" className="text-[15px] font-bold tracking-tight">
        Latest video
      </h2>
      {status === "loading" ? (
        <Skeleton className="h-20 rounded-xl" />
      ) : status === "error" ? (
        <p className="text-sm text-fg-muted">Could not load your latest video.</p>
      ) : !video ? (
        <p className="text-sm text-fg-muted">
          No videos yet — upload one to see how it performs.
        </p>
      ) : (
        <div className="flex items-start gap-3">
          <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-surface-strong">
            {video.has_thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={videoThumbnailUrl(video.id)}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              <Link href={`/videos/${video.id}`} className="hover:underline">
                {video.title}
              </Link>
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <StateBadge state={video.state ?? "draft"} />
            </div>
            <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-fg-muted">
              <div className="flex items-center gap-1">
                <dt>Views</dt>
                <dd className="font-semibold tabular-nums text-fg">
                  {stats ? formatCount(stats.views) : "—"}
                </dd>
              </div>
              <div className="flex items-center gap-1">
                <dt>Likes</dt>
                <dd className="font-semibold tabular-nums text-fg">
                  {stats ? formatCount(stats.likes) : "—"}
                </dd>
              </div>
              <div className="flex items-center gap-1">
                <dt>Comments</dt>
                <dd className="font-semibold tabular-nums text-fg">
                  {stats ? formatCount(stats.comments) : "—"}
                </dd>
              </div>
            </dl>
            <Link
              href={`/studio?video=${encodeURIComponent(video.id)}`}
              className="focus-ring mt-2 inline-flex items-center gap-0.5 rounded-full text-[13px] font-semibold text-accent-text hover:underline"
            >
              Manage
              <ChevronRightIcon size={15} aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}

// QuickActions — the two primary creator entry points, mirroring the header
// "+ Create" dropdown and the mobile CreateSheet.
function QuickActions() {
  return (
    <section aria-labelledby="quick-actions-heading" className="flex flex-col gap-3">
      <h2 id="quick-actions-heading" className="text-[15px] font-bold tracking-tight">
        Quick actions
      </h2>
      <div className="flex flex-wrap gap-2">
        <LinkButton href="/studio/content?upload=1">
          <UploadIcon size={16} aria-hidden="true" />
          Upload video
        </LinkButton>
        <LinkButton href="/studio/live?new=1" variant="tonal">
          <TvIcon size={16} aria-hidden="true" />
          Go live
        </LinkButton>
      </div>
    </section>
  );
}
