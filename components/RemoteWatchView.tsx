"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useSession } from "@/components/auth/AuthProvider";
import { ExternalLinkIcon, InfoIcon } from "@/components/icons";
import { ProtocolBadge } from "@/components/ProtocolBadge";
import { ReportButton } from "@/components/ReportButton";
import { Button, EmptyState, ErrorState, Spinner, buttonClasses } from "@/components/ui";
import { ApiError, api, errorMessage, remoteVideoThumbnailUrl } from "@/lib/api";
import type { RemoteVideo } from "@/lib/api";
import { formatDuration, relativeTime } from "@/lib/format";
import { useRemotePlayback } from "@/lib/use-remote-playback";
import { dequeueVideo, useVideoQueue } from "@/lib/video-queue";

type Status = "loading" | "error" | "notfound" | "ready";

// RemoteWatchView is the watch surface for a FEDERATED video: Vidra stores
// metadata only, so playback streams the origin's stream_url when one exists
// (HLS via hls.js/native, or a direct file) and the page always links out to
// the origin's watch page. There are deliberately no comments, ratings, or
// save/playlist controls — those interactions live on the origin instance
// (honest copy says so). What DOES live here is local safety: a signed-in
// viewer can report the remote video to the LOCAL moderators (target_type
// remote_video) and mute the whole origin instance.
export function RemoteWatchView({ id }: { id: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [video, setVideo] = useState<RemoteVideo | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const playbackQueue = useVideoQueue();

  useEffect(() => {
    if (video) dequeueVideo(video.id, true);
  }, [video]);

  const queuedNext = playbackQueue.find(
    (item) => item.id !== id || item.remote !== true,
  );

  function playQueuedNext() {
    if (!queuedNext) return;
    router.push(queuedNext.remote === true ? `/remote/${queuedNext.id}` : `/videos/${queuedNext.id}`);
  }

  useEffect(() => {
    const controller = new AbortController();
    api
      .getRemoteVideo(id, controller.signal)
      .then((v) => {
        setVideo(v);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setStatus(err instanceof ApiError && err.status === 404 ? "notfound" : "error");
      });
    return () => controller.abort();
  }, [id, reloadKey]);

  function retry() {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  }

  if (status === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Loading video" />
      </div>
    );
  }
  if (status === "notfound") {
    return (
      <EmptyState
        title="Video not found"
        message="This remote video does not exist, or its origin instance is blocked here."
      />
    );
  }
  if (status === "error" || video === null) {
    return <ErrorState message="Could not load this video." onRetry={retry} />;
  }

  const meta: string[] = [];
  if (video.published_at) {
    const when = relativeTime(video.published_at);
    if (when) meta.push(when);
  }

  return (
    <article className="flex flex-col gap-4">
      <RemotePlayer video={video} onEnded={queuedNext ? playQueuedNext : undefined} />

      <div className="flex flex-col gap-2">
        <h1 className="text-[17px] font-bold leading-snug tracking-[-0.015em] sm:text-[19px]">
          {video.title}
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-fg-muted">
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-fg-muted">
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <span className="sr-only">From </span>
            {video.domain}
          </span>
          <ProtocolBadge protocol="activitypub" />
          {meta.length > 0 ? <span>{meta.join(" · ")}</span> : null}
          {typeof video.duration_seconds === "number" && video.duration_seconds > 0 ? (
            <span className="rounded-md bg-surface-muted px-1.5 py-0.5 text-xs font-semibold tabular-nums text-fg-muted">
              {formatDuration(video.duration_seconds)}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={video.watch_url}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses("primary", "sm")}
          >
            Watch on {video.domain}
            <ExternalLinkIcon size={14} strokeWidth={2} />
          </a>
          <ReportButton kind="remote_video" targetId={video.id} />
          <MuteInstanceControl domain={video.domain} />
          {queuedNext ? (
            <Button variant="tonal" size="sm" onClick={playQueuedNext}>
              Play next: {queuedNext.title}
            </Button>
          ) : null}
        </div>
        <div className="flex items-start gap-2.5 rounded-2xl bg-surface-muted p-4 text-[13px] leading-relaxed text-fg-muted">
          <InfoIcon size={14} strokeWidth={2} className="mt-0.5 flex-none" />
          <p>
            This is a federated video from {video.domain}. Comments, ratings, and saving live on
            the origin instance. Reports go to the moderators of this instance.
          </p>
        </div>
        {video.description ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg-muted">
            {video.description}
          </p>
        ) : null}
      </div>
    </article>
  );
}

// RemotePlayer streams the origin's stream_url when the browser can play it;
// otherwise it shows the cached poster (when available) with an honest
// "watch it on the origin" panel instead of a dead player.
function RemotePlayer({ video, onEnded }: { video: RemoteVideo; onEnded?: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playback = useRemotePlayback(videoRef, video);

  if (playback.mode === "none") {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-2xl bg-surface-muted p-6 text-center">
        {video.has_thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={remoteVideoThumbnailUrl(video.id)}
            alt=""
            className="max-h-32 rounded-lg object-cover opacity-80"
          />
        ) : null}
        <p className="text-sm font-bold tracking-tight text-fg">
          This video can&rsquo;t be played here.
        </p>
        <p className="text-[13px] text-fg-muted">
          The origin instance did not provide a playable stream — use &ldquo;Watch on{" "}
          {video.domain}&rdquo; below.
        </p>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      controls
      playsInline
      className="aspect-video w-full rounded-2xl bg-black"
      src={playback.src}
      poster={video.has_thumbnail ? remoteVideoThumbnailUrl(video.id) : undefined}
      onEnded={onEnded}
    >
      Your browser does not support the video tag.
    </video>
  );
}

// MuteInstanceControl lets a signed-in viewer mute the whole origin instance
// (its videos/comments disappear from their feeds and search). After muting it
// flips to a confirmation with an inline Undo; the full list lives under
// Settings → Mutes → Instances. Hidden for anonymous viewers.
function MuteInstanceControl({ domain }: { domain: string }) {
  const { status } = useSession();
  const [muted, setMuted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status !== "authed") return null;

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (muted) {
        await api.unmuteInstance(domain);
        setMuted(false);
      } else {
        await api.muteInstance(domain);
        setMuted(true);
      }
    } catch (err) {
      setError(errorMessage(err, "Could not update the instance mute."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        disabled={busy}
        aria-label={muted ? `Unmute instance ${domain}` : `Mute instance ${domain}`}
        onClick={() => void toggle()}
      >
        {muted ? "Unmute instance" : "Mute instance"}
      </Button>
      {muted ? (
        <span role="status" className="text-xs text-fg-muted">
          Muted {domain}. Its videos and comments no longer appear for you.
        </span>
      ) : null}
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}
