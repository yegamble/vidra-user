"use client";
import { useT } from "@/components/I18nProvider";
import { RatingControls } from "@/components/RatingControls";
import { ShareButton } from "@/components/ShareButton";
import { SaveButton } from "@/components/SaveButton";
import { VideoActionsMenu } from "@/components/VideoActionsMenu";
import type { Video } from "@/lib/api";

/** Narrow watch columns use compact icons; secondary actions live in More once. */
export function WatchActions({ video, getCurrentTime, playbackToken, onDeleted }: {
  video: Video; getCurrentTime: () => number; playbackToken?: string | null; onDeleted?: () => void;
}) {
  const t = useT();
  return <div role="group" aria-label={t("watch.actions.label")} className="@container/watch-actions flex min-w-0 flex-wrap items-center gap-1">
    <RatingControls key={video.id} videoId={video.id} />
    <ShareButton videoId={video.id} shortCode={video.short_code} title={video.title} getCurrentTime={getCurrentTime} />
    <SaveButton videoId={video.id} />
    <VideoActionsMenu video={video} watchPage playbackToken={playbackToken} onDeleted={onDeleted} />
  </div>;
}
