import Link from "next/link";

import { videoThumbnailUrl } from "@/lib/api";
import type { Video } from "@/lib/api";
import { formatCount, formatDuration, relativeTime } from "@/lib/format";

// ChannelVideoCard is the design's dense channel-grid card (DR6): a compact
// 11px-radius thumbnail (duration chip only — no IPFS/live overlays), a two-line
// title, and a quiet "N views · age" line. It deliberately drops the home feed
// card's avatar + channel row: on a channel page every card belongs to the same
// channel, so repeating its identity per tile is noise. The channel-videos list
// only ever carries this channel's own (local) videos, so there is no remote /
// federated branch here.
export function ChannelVideoCard({ video }: { video: Video }) {
  const watchHref = `/videos/${video.id}`;

  // > 0 guard: a sub-second clip probes to 0 whole seconds, and a "0:00" badge is
  // noise rather than information.
  const duration =
    typeof video.duration_seconds === "number" && video.duration_seconds > 0
      ? video.duration_seconds
      : null;
  const views = typeof video.views === "number" ? `${formatCount(video.views)} views` : null;
  const age = relativeTime(video.created_at);

  return (
    <div className="flex flex-col gap-2">
      <Link
        href={watchHref}
        aria-label={video.title}
        className="focus-ring group block overflow-hidden rounded-[11px]"
      >
        <div className="media-placeholder relative aspect-video w-full overflow-hidden rounded-[11px]">
          {video.has_thumbnail ? (
            // Backend-served image; a plain <img> avoids next/image remote config.
            // alt="" — the wrapping link is already labelled by the title.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={videoThumbnailUrl(video.id)}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-fg-muted">
              No preview
            </div>
          )}
          {duration !== null ? (
            <span className="absolute bottom-1.5 right-1.5 rounded-[5px] bg-black/70 px-1.5 py-0.5 text-[10.5px] font-semibold leading-none tabular-nums text-white">
              {formatDuration(duration)}
            </span>
          ) : null}
        </div>
      </Link>
      <div className="flex min-w-0 flex-col gap-0.5 px-0.5">
        <h3 className="text-[13px] font-semibold leading-snug tracking-[-0.01em] text-fg">
          {/* line-clamp on the Link so the whole two-line title is the tap target. */}
          <Link href={watchHref} className="focus-ring line-clamp-2 rounded-sm">
            {video.title}
          </Link>
        </h3>
        {views ? (
          <p className="text-[11.5px] leading-snug tabular-nums text-fg-muted">
            {views}
            {age ? <span className="hidden lg:inline"> · {age}</span> : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}
