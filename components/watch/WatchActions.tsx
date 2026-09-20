"use client";
import { RatingControls } from "@/components/RatingControls";
import { ShareButton } from "@/components/ShareButton";
import { SaveButton } from "@/components/SaveButton";
import { VideoActionsMenu } from "@/components/VideoActionsMenu";
import type { Video } from "@/lib/api";

/** Narrow watch columns use compact icons; secondary actions live in More once. */
export function WatchActions({ video, getCurrentTime, playbackToken, onDeleted }: {
  video: Video; getCurrentTime: () => number; playbackToken?: string | null; onDeleted?: () => void;
}) {
  return <div role="group" aria-label="Video actions" className="@container/watch-actions flex min-w-0 flex-wrap items-center gap-1">
    <RatingControls videoId={video.id} />
    <ShareButton videoId={video.id} shortCode={video.short_code} title={video.title} getCurrentTime={getCurrentTime} />
    <SaveButton videoId={video.id} />
    <VideoActionsMenu video={video} watchPage playbackToken={playbackToken} onDeleted={onDeleted} />
  </div>;
}
