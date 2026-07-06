"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { api, remoteVideoThumbnailUrl, videoThumbnailUrl } from "@/lib/api";
import type { Video } from "@/lib/api";
import { formatCount, formatDuration, relativeTime } from "@/lib/format";

const RELATED_COUNT = 6;

// RelatedVideos composes a small "watch next" rail for the watch page from the
// existing public endpoints (no dedicated related-videos contract). Same-channel
// videos come first: the detail response now carries `channel_handle` (Wave A
// contract gap closed), so we can list the channel directly via GET
// /channels/{handle}/videos instead of scanning a recent feed page for a
// channel_id match. Same-category videos (GET /videos?category=) fill the rest.
// The current video is excluded and results deduped, capped at 6 cards. The
// section hides itself while loading, on failure, and when nothing relates — it
// is pure polish and must never break the watch page.
export function RelatedVideos({ video }: { video: Video }) {
  const [related, setRelated] = useState<Video[] | null>(null);

  const { id, channel_handle: channelHandle, channel_id: channelId, category } = video;

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function load() {
      const [sameChannel, sameCategory] = await Promise.all([
        // Prefer the channel's own listing (detail now carries channel_handle);
        // fall back to an empty list if the handle is absent (e.g. a remote card).
        channelHandle
          ? api
              .listChannelVideos(channelHandle, undefined, controller.signal)
              .then((r) => r.videos)
              .catch(() => [] as Video[])
          : Promise.resolve([] as Video[]),
        category
          ? api
              .getFeed({ sort: "recent", category, limit: 20 }, controller.signal)
              .then((r) => r.videos)
              .catch(() => [] as Video[])
          : Promise.resolve([] as Video[]),
      ]);
      // Guard the channel listing against a stale/mismatched channel_id too.
      const channelPicks = sameChannel.filter((v) => !channelId || v.channel_id === channelId);
      const seen = new Set([id]);
      const picks: Video[] = [];
      for (const v of [...channelPicks, ...sameCategory]) {
        if (seen.has(v.id)) continue;
        seen.add(v.id);
        picks.push(v);
        if (picks.length === RELATED_COUNT) break;
      }
      if (!cancelled) setRelated(picks);
    }

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id, channelHandle, channelId, category]);

  if (!related || related.length === 0) return null;

  return (
    <aside
      aria-label="Related videos"
      className="flex w-full shrink-0 flex-col gap-3.5 lg:w-[344px]"
    >
      <h2 className="text-[13px] font-bold tracking-[0.02em] text-fg-muted">Related videos</h2>
      <ul className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-1 lg:gap-y-3.5">
        {related.map((v) => (
          <li key={v.id}>
            <RelatedRow video={v} />
          </li>
        ))}
      </ul>
    </aside>
  );
}

// RelatedRow is the rail's dense row card (150px thumb + text column), per the
// desktop template's UP NEXT list. It keeps the same interactive semantics as
// the feed's VideoCard: one link named by the video title (heading), plus a
// separate channel link — the thumbnail's link is a pointer-only duplicate
// (aria-hidden, out of the tab order) so the accessibility tree is unchanged.
function RelatedRow({ video }: { video: Video }) {
  const isRemote = video.remote === true;
  const href = isRemote ? `/remote/${video.id}` : `/videos/${video.id}`;

  const meta: string[] = [];
  if (typeof video.views === "number") meta.push(`${formatCount(video.views)} views`);
  const when = relativeTime(video.created_at);
  if (when) meta.push(when);

  // > 0 guard: a sub-second clip probes to 0 whole seconds, and a "0:00" badge
  // is noise rather than information.
  const duration =
    typeof video.duration_seconds === "number" && video.duration_seconds > 0
      ? video.duration_seconds
      : null;

  return (
    <div className="flex gap-3">
      <Link
        href={href}
        tabIndex={-1}
        aria-hidden="true"
        className="relative block aspect-video w-[150px] shrink-0 overflow-hidden rounded-lg bg-surface-muted"
      >
        {video.has_thumbnail ? (
          // Backend-served image; a plain <img> avoids next/image remote config.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={isRemote ? remoteVideoThumbnailUrl(video.id) : videoThumbnailUrl(video.id)}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[11px] text-fg-muted">
            No preview
          </span>
        )}
        {duration !== null ? (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10.5px] font-semibold leading-none tabular-nums text-white">
            {formatDuration(duration)}
          </span>
        ) : null}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
        <Link href={href} className="focus-ring rounded">
          <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug text-fg">
            {video.title}
          </h3>
        </Link>
        {video.channel_handle ? (
          isRemote ? (
            // Remote channel identity ("name@domain") — not a local channel route.
            <span className="truncate text-xs text-fg-muted">
              {video.channel_display_name || video.channel_handle}
            </span>
          ) : (
            <Link
              href={`/channels/${video.channel_handle}`}
              className="focus-ring w-fit max-w-full truncate rounded text-xs text-fg-muted transition-colors hover:text-fg"
            >
              {video.channel_display_name || video.channel_handle}
            </Link>
          )
        ) : null}
        {meta.length > 0 ? (
          <p className="text-xs tabular-nums text-fg-muted">{meta.join(" · ")}</p>
        ) : null}
      </div>
    </div>
  );
}
