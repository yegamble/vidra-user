"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/ErrorState";
import { ListTail } from "@/components/ui/ListTail";
import { Spinner } from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import type { Channel, Video, VideoConfigResponse } from "@/lib/api";
import { videoAcceptAttr } from "@/lib/upload-accept";
import { useAppendingList } from "@/lib/use-appending-list";
import { useBrowseAutoLoad } from "@/lib/use-browse-auto-load";

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
  channels,
}: {
  handle: string;
  config: VideoConfigResponse | null;
  /** The caller's manageable channels; enables moving a video between them. */
  channels?: Channel[];
}) {
  const autoLoad = useBrowseAutoLoad();
  // Paged from the server: the owner view used to fetch once, so a creator with
  // more than 20 videos could never reach (or manage) the older ones.
  const list = useAppendingList<Video>({
    queryKey: handle,
    getId: (v) => v.id,
    load: (window, signal) =>
      handle === ""
        ? new Promise(() => {})
        : api
            .listChannelVideos(handle, undefined, signal, window)
            .then((res) => ({ items: res.videos, total: res.total })),
  });
  const { status, items: videos } = list;
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

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-bold tracking-tight">Your videos</h2>
        <Button variant="secondary" size="sm" onClick={list.reload}>
          Refresh
        </Button>
      </div>

      {status === "loading" ? (
        <div className="flex justify-center py-8">
          <Spinner label="Loading your videos" />
        </div>
      ) : status === "error" ? (
        <ErrorState message="Could not load your videos." onRetry={list.reload} />
      ) : videos.length === 0 ? (
        <p className="text-sm text-fg-muted">No videos in this channel yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-2xl bg-surface-muted">
          {videos.map((v) => (
            <VideoRow
              key={v.id}
              video={v}
              config={config}
              channels={channels}
              replaceEnabled={replaceEnabled}
              replaceAccept={videoAcceptAttr(additionalExts)}
              onUpdated={(u) =>
                u.channel_id && u.channel_id !== v.channel_id
                  ? // A moved video leaves this channel's list (T20).
                    list.drop((x) => x.id !== u.id)
                  : list.patch((rows) => rows.map((x) => (x.id === u.id ? u : x)))
              }
              onDeleted={() => list.drop((x) => x.id !== v.id)}
            />
          ))}
        </ul>
      )}
      {status === "ready" ? (
        <ListTail
          hasMore={list.hasMore}
          autoLoad={autoLoad}
          busy={list.moreStatus === "loading"}
          error={list.moreStatus === "error" ? "Could not load more videos." : null}
          onLoadMore={list.loadMore}
        />
      ) : null}
    </section>
  );
}
