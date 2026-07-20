"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import type { Video, VideoConfigResponse } from "@/lib/api";

import { type Status } from "./shared";
import { VideoRow } from "./VideoRow";

// ManagedVideoView is the full-page single-video management surface reached via
// `/studio?video=<id>` — the moderator deep link (and an owner's "Manage" link
// from the dashboard). The studio nav is hidden in this mode (the layout gates
// on the video param). An owner sees the full edit surface; a privileged
// moderator managing someone else's video edits metadata only (basicOnly).
export function ManagedVideoView({ videoId }: { videoId: string }) {
  const { user } = useSession();
  const privileged = user?.role === "admin" || user?.role === "moderator";
  const [status, setStatus] = useState<Status>("loading");
  const [video, setVideo] = useState<Video | null>(null);
  const [config, setConfig] = useState<VideoConfigResponse | null>(null);
  const [basicOnly, setBasicOnly] = useState(false);
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api.getVideo(videoId, undefined, controller.signal),
      api.getVideoConfig(controller.signal).catch(() => null),
      api.getMyChannels(controller.signal).catch((err: unknown) => {
        if (privileged) return { channels: [] };
        throw err;
      }),
    ])
      .then(([detail, videoConfig, channels]) => {
        const owned = channels.channels.some((channel) => channel.id === detail.channel_id);
        if (!owned && !privileged) {
          setStatus("error");
          return;
        }
        setVideo(detail);
        setConfig(videoConfig);
        setBasicOnly(privileged && !owned);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [privileged, videoId]);

  if (status === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Loading video management" />
      </div>
    );
  }
  if (deleted) {
    return (
      <EmptyState
        title="Video deleted"
        message={
          <Link href="/studio" className="font-semibold underline underline-offset-2">
            Return to the studio
          </Link>
        }
      />
    );
  }
  if (status === "error" || !video) {
    return <ErrorState message="This video is unavailable or you cannot manage it." />;
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="manage-video-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="manage-video-title" className="text-[15px] font-bold tracking-tight">
            Manage video
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            Edit metadata or permanently delete this video.
          </p>
        </div>
        <Link
          href="/studio"
          className="focus-ring rounded-full px-3 py-2 text-sm font-semibold text-fg-muted hover:bg-surface-muted hover:text-fg"
        >
          Full studio
        </Link>
      </div>
      <ul className="overflow-hidden rounded-2xl bg-surface-muted">
        <VideoRow
          video={video}
          config={config}
          initiallyEditing
          basicOnly={basicOnly}
          onUpdated={setVideo}
          onDeleted={() => setDeleted(true)}
        />
      </ul>
    </section>
  );
}
