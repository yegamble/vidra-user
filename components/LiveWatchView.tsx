"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { QualityMenu } from "@/components/QualityMenu";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api } from "@/lib/api";
import type { LiveStream } from "@/lib/api";
import { useLivePlayback } from "@/lib/use-live-playback";

type Status = "loading" | "error" | "notfound" | "ready";

// How often to re-check an offline stream so a waiting viewer sees it go live
// without a manual refresh. Only polls while offline (live/ended are stable
// enough that an explicit Refresh covers them).
const OFFLINE_POLL_MS = 15_000;

// LiveWatchView is the /live/[id] watch surface. It loads a single live stream
// and, when it is live with an HLS playlist available, plays it via the shared
// HLS util (hls.js over MSE / native HLS). Offline and ended states are shown
// honestly — a stream that has not started, or has finished, never pretends to
// play. A 404 (no such stream, or private and not the viewer's) is its own state.
export function LiveWatchView({ id }: { id: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [stream, setStream] = useState<LiveStream | null>(null);

  const load = useCallback(
    (signal?: AbortSignal) =>
      api
        .getLiveStream(id, signal)
        .then((s) => {
          setStream(s);
          setStatus("ready");
        })
        .catch((err: unknown) => {
          if (signal?.aborted) return;
          setStatus(err instanceof ApiError && err.status === 404 ? "notfound" : "error");
        }),
    [id],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // While the stream is offline, quietly re-poll so it flips to the player the
  // moment the publisher connects. Stops once live/ended (or unmounted).
  const offline = status === "ready" && stream?.state === "offline";
  useEffect(() => {
    if (!offline) return;
    const timer = setInterval(() => void load(), OFFLINE_POLL_MS);
    return () => clearInterval(timer);
  }, [offline, load]);

  if (status === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Loading live stream" />
      </div>
    );
  }
  if (status === "notfound") {
    return (
      <EmptyState
        title="Live stream not found"
        message="This live stream does not exist, or it is private."
      />
    );
  }
  if (status === "error" || stream === null) {
    return <ErrorState message="Could not load this live stream." onRetry={() => void load()} />;
  }

  const channelName = stream.channel_display_name || stream.channel_handle;

  return (
    <div className="flex flex-col gap-4">
      {stream.state === "live" && stream.hls_url ? (
        <LivePlayer stream={stream} />
      ) : stream.state === "live" ? (
        // Live, but no playlist path yet (media server not serving it): honest,
        // not a dead player. The offline poll does not run here, so offer Refresh.
        <StreamState
          title="Live now"
          message="This stream is live, but its video feed isn't available yet. Try refreshing in a moment."
          onRefresh={() => void load()}
        />
      ) : stream.state === "ended" ? (
        <StreamState
          title="Stream ended"
          message={
            stream.replay_enabled
              ? "This live stream has ended. Its replay will appear as a normal video on the channel shortly."
              : "This live stream has ended."
          }
          onRefresh={() => void load()}
        />
      ) : (
        <StreamState
          title="Not live yet"
          message="This stream hasn't started. It will begin playing here automatically once it goes live."
        />
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {stream.state === "live" ? <LiveBadge /> : null}
          <h1 className="text-xl font-semibold tracking-tight">{stream.title}</h1>
        </div>
        {channelName ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {stream.channel_handle ? (
              <Link
                href={`/channels/${encodeURIComponent(stream.channel_handle)}`}
                className="font-medium text-zinc-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:text-zinc-200"
              >
                {channelName}
              </Link>
            ) : (
              channelName
            )}
          </p>
        ) : null}
        {stream.description ? (
          <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
            {stream.description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// LivePlayer plays the live HLS feed via the shared decision helpers. There is no
// progressive fallback for a live stream, so a fatal playback failure shows an
// honest message instead of a dead <video>.
function LivePlayer({ stream }: { stream: LiveStream }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playback = useLivePlayback(videoRef, stream.id);

  if (playback.failed) {
    return (
      <StreamState
        title="Can't play this live stream"
        message="Your browser could not play the live video feed."
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <video
        ref={videoRef}
        controls
        autoPlay
        playsInline
        aria-label={`Live: ${stream.title}`}
        className="aspect-video w-full rounded-lg bg-black"
        src={playback.src}
      >
        Your browser does not support the video tag.
      </video>
      {/* Only hls.js playback exposes controllable quality; the menu hides itself
          for native-HLS playback (levels is empty). */}
      <div className="flex flex-wrap items-center gap-2">
        <QualityMenu
          levels={playback.levels}
          currentLevel={playback.currentLevel}
          onSelect={playback.setLevel}
        />
      </div>
    </div>
  );
}

function StreamState({
  title,
  message,
  onRefresh,
}: {
  title: string;
  message: string;
  onRefresh?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-6 py-16 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
      <p className="text-lg font-medium text-zinc-700 dark:text-zinc-200">{title}</p>
      <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">{message}</p>
      {onRefresh ? (
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Refresh
        </button>
      ) : null}
    </div>
  );
}

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded bg-red-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-red-700 dark:bg-red-950/40 dark:text-red-300">
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-red-600 dark:bg-red-400" />
      Live
    </span>
  );
}
