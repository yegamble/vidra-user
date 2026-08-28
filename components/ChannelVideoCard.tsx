"use client";

import Link from "next/link";
import { useState } from "react";

import { RestrictedModePlaceholder } from "@/components/RestrictedModePlaceholder";
import { VideoActionsMenu } from "@/components/VideoActionsMenu";
import { VideoCardPreview } from "@/components/VideoCardPreview";
import type { Video } from "@/lib/api";
import { formatCount, formatDuration, relativeTime } from "@/lib/format";
import { useVideoCardPresentation } from "@/lib/use-video-card-presentation";

// ChannelVideoCard is the design's dense channel-grid card (DR6): a compact
// 11px-radius thumbnail (duration chip only — no IPFS/live overlays), a two-line
// title, and a quiet "N views · age" line. It deliberately drops the home feed
// card's avatar + channel row: on a channel page every card belongs to the same
// channel, so repeating its identity per tile is noise. The channel-videos list
// only ever carries this channel's own (local) videos, so there is no remote /
// federated branch here.
export function ChannelVideoCard({
  video,
  onDeleted,
}: {
  video: Video;
  /** See VideoCard.onDeleted — grid parents remove the video from state so the grid reflows. */
  onDeleted?: () => void;
}) {
  const [removed, setRemoved] = useState(false);
  // localOnly: the channel-videos list only ever carries this channel's own
  // (local) videos, so there is no remote/federated branch to derive here.
  const {
    watchHref,
    restrictedHidden,
    blurSensitive,
    markSensitive,
    previewEligible,
    previewSrc,
    posterSrc,
    duration,
  } = useVideoCardPresentation(video, { localOnly: true });

  if (removed) return null;

  if (restrictedHidden) {
    return (
      <RestrictedModePlaceholder className="aspect-video rounded-[11px] px-4 text-xs" />
    );
  }

  const views = typeof video.views === "number" ? `${formatCount(video.views)} views` : null;
  const age = relativeTime(video.created_at);

  return (
    <div className="group/card flex flex-col gap-2">
      {/* hasStoryboard stays false — see useVideoCardPresentation for why no
          card may claim a storyboard its payload never advertised. */}
      <VideoCardPreview
        videoId={video.id}
        title={video.title}
        href={watchHref}
        src={previewSrc}
        poster={posterSrc}
        duration={duration}
        hasStoryboard={false}
        previewEnabled={previewEligible}
        className="rounded-[11px]"
        posterClassName={`transition-transform ${
          blurSensitive ? "scale-110 blur-2xl" : "group-hover/preview:scale-[1.02]"
        }`}
        fallback={
          <div className="media-placeholder absolute inset-0 flex items-center justify-center text-xs text-fg-muted">
            No preview
          </div>
        }
        overlay={
          <>
            {markSensitive ? (
              <span
                title={video.sensitive_reason || undefined}
                className="absolute bottom-1.5 left-1.5 rounded-[5px] bg-black/70 px-1.5 py-0.5 text-[10.5px] font-semibold leading-none text-white group-data-[preview-active=true]/preview:bottom-10"
              >
                Sensitive
              </span>
            ) : null}
            {duration !== null ? (
              <span className="absolute bottom-1.5 right-1.5 rounded-[5px] bg-black/70 px-1.5 py-0.5 text-[10.5px] font-semibold leading-none tabular-nums text-white group-data-[preview-active=true]/preview:bottom-10">
                {formatDuration(duration)}
              </span>
            ) : null}
          </>
        }
      />
      <div className="flex min-w-0 items-start gap-1 px-0.5">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
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
        <div className="shrink-0 opacity-0 transition-opacity duration-150 group-hover/card:opacity-100 group-focus-within/card:opacity-100 [@media(hover:none)]:opacity-100">
          <VideoActionsMenu video={video} compact onDeleted={onDeleted ?? (() => setRemoved(true))} />
        </div>
      </div>
    </div>
  );
}
