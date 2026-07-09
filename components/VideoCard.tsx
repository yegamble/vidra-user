"use client";

import Link from "next/link";

import { IpfsIcon } from "@/components/icons";
import { ProtocolBadge } from "@/components/ProtocolBadge";
import { Avatar } from "@/components/ui/Avatar";
import {
  channelAvatarUrl,
  isSensitiveVideo,
  remoteVideoThumbnailUrl,
  videoThumbnailUrl,
} from "@/lib/api";
import type { Video } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatCount, formatDuration, relativeTime } from "@/lib/format";
import { useSensitiveContentPolicy } from "@/lib/use-sensitive-policy";

// Grid video card in the template's language (specs/design/{app,desktop}-template):
// a borderless rounded-2xl thumbnail on the page background, then a row with the
// channel avatar on the left and a title-first block on the right whose second,
// muted line reads `channel · views · age`. The IPFS thumbnail badge (top-left on
// mobile with the cube glyph, top-right on desktop) reflects the REAL `ipfs_pinned`
// field the feed/card contract carries (vidra-core P19) — shown only when true
// (public+published videos the IPFS mirror has pinned; absent ⇒ treated as false,
// never stubbed). LIVE badges stay omitted here: live streams are a table disjoint
// from videos (the feed Video carries no live/state field), so live discovery is
// the separate "Live now" rail (LiveNowRail, GET /api/v1/live), not a card badge.
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
  // channel_handle is a "name@domain" identity, not a local route, and it has
  // no local avatar URL (the Avatar falls back to the display-name initial).
  const isRemote = video.remote === true;
  const watchHref = isRemote ? `/remote/${video.id}` : `/videos/${video.id}`;
  // Sensitive-content presentation (spec: instance-platform-info.md): under the
  // instance `blur` policy a sensitive video's thumbnail is blurred and badged;
  // under `warn` it is badged only; `display` (and `hide`, which is enforced
  // server-side, or an unknown policy) applies no client treatment.
  const policy = useSensitiveContentPolicy();
  const sensitive = isSensitiveVideo(video);
  const blurSensitive = sensitive && policy === "blur";
  const markSensitive = sensitive && (policy === "blur" || policy === "warn");
  const channelName = video.channel_display_name || video.channel_handle || "";
  const avatarSrc =
    !isRemote && video.channel_handle ? channelAvatarUrl(video.channel_handle) : null;

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

  return (
    <div className="flex flex-col gap-3">
      <Link
        href={watchHref}
        aria-label={video.title}
        className="focus-ring group block overflow-hidden rounded-2xl"
      >
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-surface-muted">
          {video.has_thumbnail ? (
            // Backend-served image; a plain <img> avoids next/image remote config.
            // alt="" — the wrapping link is already labelled by the title.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={isRemote ? remoteVideoThumbnailUrl(video.id) : videoThumbnailUrl(video.id)}
              alt=""
              loading="lazy"
              className={cn(
                "h-full w-full object-cover transition-transform group-hover:scale-[1.02]",
                // Blur policy: scale hides the blur's soft edges inside the
                // already-clipping rounded container.
                blurSensitive && "scale-110 blur-2xl",
              )}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-fg-muted">
              No preview
            </div>
          )}
          {/* IPFS mirror badge (media-overlay exception: theme-invariant dark pill
              on the thumbnail, per design-system §Documented exceptions). Shown
              only when the real pin state is true. Per the design templates it
              sits top-LEFT on mobile (with the 10×11 cube glyph) and top-RIGHT on
              desktop (text-only, the corner the phone reserves for it is free on
              the wider grid). Converged onto the shared IpfsIcon (design-refresh
              icon set) — no more ad-hoc inline SVG. The wrapping link is labelled
              by the title, so this "IPFS" text does not affect its accessible
              name; the title attribute supplies the tooltip explanation. */}
          {video.ipfs_pinned === true ? (
            <span
              className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-[3px] text-[10.5px] font-semibold leading-none tracking-[0.03em] text-white/90 backdrop-blur lg:left-auto lg:right-2"
              title="Mirrored to IPFS"
            >
              <IpfsIcon size={11} className="shrink-0 lg:hidden" />
              IPFS
            </span>
          ) : null}
          {/* Sensitive badge (media-overlay exception: theme-invariant dark
              pill on the thumbnail). Bottom-LEFT so it never collides with the
              IPFS pill (top corners) or the duration (bottom-right). */}
          {markSensitive ? (
            <span className="absolute bottom-2 left-2 inline-flex items-center rounded-full bg-black/55 px-2.5 py-[3px] text-[10.5px] font-semibold leading-none tracking-[0.03em] text-white/90 backdrop-blur">
              Sensitive
            </span>
          ) : null}
          {duration !== null ? (
            <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums text-white">
              {formatDuration(duration)}
            </span>
          ) : null}
          {progressPct !== null ? (
            <div aria-hidden className="absolute inset-x-0 bottom-0 h-[3px]">
              <div
                data-resume-progress={String(progressPct)}
                style={{ width: `${progressPct}%` }}
                className="h-full bg-white"
              />
            </div>
          ) : null}
        </div>
      </Link>

      <div className="flex gap-3">
        {video.channel_handle ? (
          <Avatar
            src={avatarSrc}
            name={channelName}
            className="mt-0.5 h-9 w-9 shrink-0 text-[13px]"
          />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="text-[15.5px] font-semibold leading-snug tracking-[-0.01em] lg:text-sm">
            {/* line-clamp lives on the Link so the anchor fills the title block
                (its own width, not just the text run): the whole two-line title
                is the click/tap target, matching the card thumbnail link. */}
            <Link href={watchHref} className="focus-ring line-clamp-2 rounded-sm text-fg">
              {video.title}
            </Link>
          </h3>
          <div className="flex flex-wrap items-center gap-x-1.5 text-[13px] leading-snug text-fg-muted">
            {video.channel_handle ? (
              isRemote ? (
                // Remote channel identity ("name@domain") — not a local route.
                <span className="truncate">{channelName}</span>
              ) : (
                <Link
                  href={`/channels/${video.channel_handle}`}
                  className="focus-ring max-w-full truncate rounded-sm transition-colors hover:text-fg"
                >
                  {channelName}
                </Link>
              )
            ) : null}
            {video.channel_handle && meta.length > 0 ? (
              <span aria-hidden>·</span>
            ) : null}
            {meta.length > 0 ? (
              <span className="tabular-nums">{meta.join(" · ")}</span>
            ) : null}
          </div>
          {isRemote && video.domain ? (
            <span className="mt-0.5 flex max-w-full flex-wrap items-center gap-1">
              <span
                className="inline-flex w-fit max-w-full items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-fg-muted"
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
              <ProtocolBadge protocol="activitypub" />
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
