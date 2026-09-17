"use client";
import { RatingControls } from "@/components/RatingControls";
import { ShareButton } from "@/components/ShareButton";
import { SaveButton } from "@/components/SaveButton";
import { VideoActionsMenu } from "@/components/VideoActionsMenu";
import type { Video } from "@/lib/api";

/** Essential actions wrap on phones; secondary actions live in More once. */
export function WatchActions({ video, getCurrentTime, playbackToken, onDeleted }: {
  video: Video; getCurrentTime: () => number; playbackToken?: string | null; onDeleted?: () => void;
}) {
  return <div role="group" aria-label="Video actions" className="flex min-w-0 flex-wrap items-center gap-2">
    <RatingControls videoId={video.id} />
    <ShareButton videoId={video.id} shortCode={video.short_code} title={video.title} getCurrentTime={getCurrentTime} />
    <SaveButton videoId={video.id} />
    <VideoActionsMenu video={video} watchPage playbackToken={playbackToken} onDeleted={onDeleted} />
  </div>;
}
