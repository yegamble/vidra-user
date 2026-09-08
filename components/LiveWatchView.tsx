"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { useOptionalSession } from "@/components/auth/AuthProvider";
import { LiveTerminateDialog } from "@/components/LiveTerminateDialog";
import { InfoIcon } from "@/components/icons";
import { QualityMenu } from "@/components/QualityMenu";
import { Button, EmptyState, ErrorState, Spinner } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import type { LiveStream } from "@/lib/api";
import { terminationHeadline } from "@/lib/live/termination";
import { useLivePlayback } from "@/lib/use-playback-engine";
import { useSettledOptionalSession } from "@/lib/use-settled-session";

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
  // A PRIVATE stream is visible only to its owner (and the channel's content
  // managers); core 404s it for everyone else. Reading before the refresh
  // cookie has been redeemed reads anonymously, so the owner's own stream page
  // landed on "not found" and the effect never re-ran to correct it.
  // `useSettledOptionalSession` because the view is also rendered bare.
  const { settled, viewerKey } = useSettledOptionalSession();
  // Staff get the termination control. This is where a moderator watching an
  // instance-damaging broadcast actually is — sending them to an admin page to
  // find the stream by id would be a worse answer than no control at all, which
  // was the previous state.
  const session = useOptionalSession();
  const staff = session?.user?.role === "admin" || session?.user?.role === "moderator";
  const [terminating, setTerminating] = useState(false);

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
    if (!settled) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, settled, viewerKey]);

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
      ) : stream.state === "ended" || stream.termination ? (
        // A stream that was ENDED BY A PERSON says so, and says why. Before
        // this, a moderator termination was indistinguishable from a publisher
        // dropping off: the page read "This live stream has ended" and the only
        // person the action was aimed at was told nothing at all. `termination`
        // is present only for the creator, a channel content manager and staff
        // (core gates it), so a public visitor still sees the plain sentence.
        //
        // The condition takes `termination` as well as the state because a
        // PERMANENT stream returns to `offline` rather than `ended` when it is
        // terminated — it is reusable — and the reason has to survive that.
        <StreamState
          title="Stream ended"
          message={endedMessage(stream)}
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
          {stream.state === "live" && typeof stream.viewer_count === "number" ? (
            <ViewerCount count={stream.viewer_count} />
          ) : null}
          <h1 className="text-[17px] font-bold leading-snug tracking-[-0.015em] sm:text-[19px]">
            {stream.title}
          </h1>
          {staff && stream.state === "live" ? (
            <Button
              variant="danger-outline"
              size="sm"
              onClick={() => setTerminating(true)}
              className="ml-auto"
            >
              End stream
            </Button>
          ) : null}
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

      {terminating ? (
        <LiveTerminateDialog
          streamId={stream.id}
          streamTitle={stream.title}
          onClose={() => setTerminating(false)}
          onTerminated={() => void load()}
        />
      ) : null}
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
          for native-HLS playback (levels is empty). Sharing VOD's lifecycle also
          gives live the "Auto (720p)" readout and the busy "…" on a pick that
          has not landed yet — both come straight off LEVEL_SWITCHED. */}
      <div className="flex flex-wrap items-center gap-2">
        <QualityMenu
          levels={playback.levels}
          currentQuality={playback.currentQuality}
          activeHeight={playback.activeHeight}
          pending={playback.pending}
          onSelect={playback.setQuality}
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
      <InfoIcon size={20} strokeWidth={2} className="text-fg-muted" />
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

// endedMessage is what a stopped stream says. The termination sentence comes
// first because it is the answer to the question the creator actually has, and
// the moderator's own words follow it — the code says WHAT rule, the free text
// says what happened.
function endedMessage(stream: LiveStream): string {
  const parts: string[] = [];
  if (stream.termination) {
    parts.push(terminationHeadline(stream.termination));
    if (stream.termination.reason) parts.push(stream.termination.reason);
  } else {
    parts.push("This live stream has ended.");
  }
  if (stream.replay_enabled) {
    parts.push("Its replay will appear as a normal video on the channel shortly.");
  }
  return parts.join(" ");
}

// ViewerCount renders the concurrent-viewer number. It is only ever rendered
// when core actually sent one: the field is OMITTED rather than zeroed on an
// instance that cannot measure it, so `typeof === "number"` at the call site is
// what keeps a creator from being shown a confident "0 watching" by an instance
// with no Redis.
function ViewerCount({ count }: { count: number }) {
  return (
    <span className="text-[12.5px] font-medium text-fg-muted" aria-live="polite">
      {count.toLocaleString()} {count === 1 ? "viewer" : "viewers"}
    </span>
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
