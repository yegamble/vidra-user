"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import type { Video, VideoConfigResponse } from "@/lib/api";
import { videoAcceptAttr } from "@/lib/upload-accept";

import { type Status } from "./shared";
import { VideoRow } from "./VideoRow";

// MyVideosSection lists the owner's videos for the current studio channel (the
// owner view returns drafts/private too) and lets them edit metadata or delete a
// video. Scoped to the studio's current channel (the internal channel <select>
// is retired — the studio context drives which channel is shown); remount on a
// channel switch via a key. After an edit/delete the local list is updated from
// the server result.
export function MyVideosSection({
  handle,
  config,
}: {
  handle: string;
  config: VideoConfigResponse | null;
}) {
  const [status, setStatus] = useState<Status>("loading");
  const [videos, setVideos] = useState<Video[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  // Video file replacement availability (features.video_replace, config-parity
  // W14) + the picker accept list (features.upload_additional_extensions) —
  // fetched ONCE per section mount and passed down so each VideoRow's edit
  // surface can render the Replace flow without an N+1 /instance fetch.
  // Replacement defaults hidden (false) until the fetch says otherwise: the
  // affordance only appears when the instance actually accepts it.
  const [replaceEnabled, setReplaceEnabled] = useState(false);
  const [additionalExts, setAdditionalExts] = useState<boolean | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .getInstance(controller.signal)
      .then((res) => {
        setReplaceEnabled(res.features.video_replace === true);
        setAdditionalExts(res.features.upload_additional_extensions ?? null);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (handle === "") return;
    const controller = new AbortController();
    api
      .listChannelVideos(handle, undefined, controller.signal)
      .then((res) => {
        setVideos(res.videos);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        void err;
        if (controller.signal.aborted) return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [handle, reloadKey]);

  function refetch() {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold tracking-tight">Your videos</h2>
        <Button variant="secondary" size="sm" onClick={refetch}>
          Refresh
        </Button>
      </div>

      {status === "loading" ? (
        <div className="flex justify-center py-8">
          <Spinner label="Loading your videos" />
        </div>
      ) : status === "error" ? (
        <ErrorState message="Could not load your videos." onRetry={refetch} />
      ) : videos.length === 0 ? (
        <p className="text-sm text-fg-muted">No videos in this channel yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-2xl bg-surface-muted">
          {videos.map((v) => (
            <VideoRow
              key={v.id}
              video={v}
              config={config}
              replaceEnabled={replaceEnabled}
              replaceAccept={videoAcceptAttr(additionalExts)}
              onUpdated={(u) => setVideos((list) => list.map((x) => (x.id === u.id ? u : x)))}
              onDeleted={() => setVideos((list) => list.filter((x) => x.id !== v.id))}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
