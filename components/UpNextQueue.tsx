"use client";

import Link from "next/link";

import { CloseIcon } from "@/components/icons";
import { remoteVideoThumbnailUrl, videoThumbnailUrl, type Video } from "@/lib/api";
import { cn } from "@/lib/cn";
import { nextVideoHref } from "@/lib/end-card";
import { formatCount, formatDuration, relativeTime } from "@/lib/format";
import { clearQueue, removeVideo, useVideoQueue } from "@/lib/video-queue";

// UpNextQueue is the watch page's viewer-built "play next" panel (YouTube-parity
// up-next). It sits ABOVE the related rail and mirrors RelatedRow's dense-row
// styling so the two read as one column. It renders nothing while the queue is
// empty (the common case), so the rail collapses to the related list exactly as
// before. The currently playing video is excluded the same way WatchView's
// queuedNextVideo does — it is dequeued on activation, but skipped here too so it
// never momentarily lists itself. Each row links to its watch URL (local
// /videos/{id}, remote /remote/{id}); a per-row remove button and a header
// Clear-all edit the shared cross-tab queue store.
export function UpNextQueue({
  currentVideo,
  belowLayout = false,
}: {
  currentVideo: Video | null;
  /** Theater mode (matches RelatedVideos): drop the fixed rail width so the
   * panel spans the full-width column stacked above the reflowed related grid. */
  belowLayout?: boolean;
}) {
  const queue = useVideoQueue();
  const items = queue.filter(
    (item) =>
      !currentVideo ||
      item.id !== currentVideo.id ||
      Boolean(item.remote) !== Boolean(currentVideo.remote),
  );
  if (items.length === 0) return null;

  return (
    <aside
      aria-label="Up next queue"
      data-testid="upnext-queue"
      className={cn(
        "flex w-full shrink-0 flex-col gap-3",
        belowLayout ? null : "lg:w-[344px]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-bold tracking-[0.02em] text-fg-muted">
          Up next
          <span className="ml-1.5 font-semibold tabular-nums text-fg-muted/80">{items.length}</span>
        </h2>
        <button
          type="button"
          onClick={() => clearQueue()}
          className="focus-ring rounded text-xs font-semibold text-fg-muted transition-colors hover:text-fg"
        >
          Clear all
        </button>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((v) => (
          <li key={`${v.remote ? "r" : "l"}-${v.id}`}>
            <UpNextRow video={v} />
          </li>
        ))}
      </ul>
    </aside>
  );
}

// UpNextRow is one dense queued-video row: a 150px thumbnail link + a text
// column (title, channel, meta), matching RelatedRow, plus a remove control.
function UpNextRow({ video }: { video: Video }) {
  const isRemote = video.remote === true;
  const href = nextVideoHref(video);
  const thumbUrl = video.has_thumbnail
    ? isRemote
      ? remoteVideoThumbnailUrl(video.id)
      : videoThumbnailUrl(video.id)
    : null;

  const meta: string[] = [];
  if (typeof video.views === "number") meta.push(`${formatCount(video.views)} views`);
  const when = relativeTime(video.created_at);
  if (when) meta.push(when);

  // > 0 guard: a sub-second clip probes to 0 whole seconds, and a "0:00" badge
  // is noise rather than information (mirrors RelatedRow).
  const duration =
    typeof video.duration_seconds === "number" && video.duration_seconds > 0
      ? video.duration_seconds
      : null;

  return (
    <div data-testid="upnext-row" data-video-id={video.id} className="flex gap-3">
      <Link
        href={href}
        className="focus-ring relative aspect-video w-[150px] shrink-0 overflow-hidden rounded-lg bg-surface-muted"
      >
        {thumbUrl ? (
          // Backend-served thumbnail; a plain <img> avoids next/image config.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-[11px] text-fg-muted">
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
        {video.channel_display_name || video.channel_handle ? (
          <span className="truncate text-xs text-fg-muted">
            {video.channel_display_name || video.channel_handle}
          </span>
        ) : null}
        {meta.length > 0 ? (
          <p className="text-xs tabular-nums text-fg-muted">{meta.join(" · ")}</p>
        ) : null}
      </div>
      <div className="-mr-1 shrink-0 self-start">
        <button
          type="button"
          aria-label={`Remove ${video.title} from the queue`}
          onClick={() => removeVideo(video.id, isRemote)}
          className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
        >
          <CloseIcon size={16} />
        </button>
      </div>
    </div>
  );
}
