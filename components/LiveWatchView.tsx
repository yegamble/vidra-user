"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { QualityMenu } from "@/components/QualityMenu";
import { Button, EmptyState, ErrorState, Spinner } from "@/components/ui";
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
          <h1 className="text-[17px] font-bold leading-snug tracking-[-0.015em] sm:text-[19px]">
            {stream.title}
          </h1>
        </div>
        {channelName ? (
          <p className="text-[13px] text-fg-muted">
            {stream.channel_handle ? (
              <Link
                href={`/channels/${encodeURIComponent(stream.channel_handle)}`}
                className="focus-ring rounded font-semibold text-fg hover:underline"
              >
                {channelName}
              </Link>
            ) : (
              channelName
            )}
          </p>
        ) : null}
        {stream.description ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg-muted">
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
        className="aspect-video w-full rounded-2xl bg-black"
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
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-surface-muted px-6 py-16 text-center">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="h-5 w-5 text-fg-muted"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
      </svg>
      <p className="text-[15px] font-bold tracking-tight text-fg">{title}</p>
      <p className="max-w-sm text-[13px] leading-relaxed text-fg-muted">{message}</p>
      {onRefresh ? (
        <Button variant="secondary" size="sm" onClick={onRefresh}>
          Refresh
        </Button>
      ) : null}
    </div>
  );
}

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-danger/15 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.04em] text-danger">
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full bg-live animate-[live-pulse_1.6s_ease-in-out_infinite]"
      />
      Live
    </span>
  );
}
