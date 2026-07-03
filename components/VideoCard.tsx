import Link from "next/link";

import { remoteVideoThumbnailUrl, videoThumbnailUrl } from "@/lib/api";
import type { Video } from "@/lib/api";
import { formatCount, formatDuration, relativeTime } from "@/lib/format";

export function VideoCard({
  video,
  progressFraction,
}: {
  video: Video;
  /**
   * Watched fraction (0..1) for a thin resume-progress bar across the bottom
   * of the thumbnail (history cards). Decorative (aria-hidden) — the caller
   * keeps an accessible "Resume at m:ss" text alongside. Capped at 100%.
   */
  progressFraction?: number;
}) {
  // A federated remote card: links to the remote watch surface, shows its
  // origin-domain badge, and uses the locally cached remote thumbnail. Its
  // channel_handle is a "name@domain" identity, not a local route.
  const isRemote = video.remote === true;

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
  const progressPct =
    typeof progressFraction === "number"
      ? Math.min(100, Math.max(0, Math.round(progressFraction * 1000) / 10))
      : null;

  // The card is a <div>, not a single <Link>, so the channel can be its own
  // (sibling, non-nested) link to /channels/{handle}.
  return (
    <div className="flex flex-col gap-2">
      <Link
        href={isRemote ? `/remote/${video.id}` : `/videos/${video.id}`}
        className="group flex flex-col gap-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
      >
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-zinc-200 dark:bg-zinc-800">
          {video.has_thumbnail ? (
            // Backend-served image; a plain <img> avoids next/image remote config.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={isRemote ? remoteVideoThumbnailUrl(video.id) : videoThumbnailUrl(video.id)}
              alt={video.title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-zinc-600 dark:text-zinc-400">
              No preview
            </div>
          )}
          {duration !== null ? (
            <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1 py-0.5 text-[11px] font-medium leading-none text-white">
              {formatDuration(duration)}
            </span>
          ) : null}
          {progressPct !== null ? (
            <div aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
              <div
                data-resume-progress={String(progressPct)}
                style={{ width: `${progressPct}%` }}
                className="h-full bg-red-600"
              />
            </div>
          ) : null}
        </div>
        <h3 className="line-clamp-2 text-sm font-medium text-zinc-900 group-hover:text-zinc-600 dark:text-zinc-100 dark:group-hover:text-zinc-300">
          {video.title}
        </h3>
      </Link>
      {isRemote && video.domain ? (
        <span
          className="inline-flex w-fit max-w-full items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
          title={`Federated video from ${video.domain}`}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3 w-3 shrink-0"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          <span className="sr-only">From </span>
          <span className="truncate">{video.domain}</span>
        </span>
      ) : null}
      {video.channel_handle ? (
        isRemote ? (
          // Remote channel identity ("name@domain") — not a local channel route.
          <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
            {video.channel_display_name || video.channel_handle}
          </span>
        ) : (
          <Link
            href={`/channels/${video.channel_handle}`}
            className="text-xs text-zinc-500 hover:text-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            {video.channel_display_name || video.channel_handle}
          </Link>
        )
      ) : null}
      {meta.length > 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{meta.join(" · ")}</p>
      ) : null}
    </div>
  );
}
