"use client";

import { useEffect, useRef, useState } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { ProtocolBadge } from "@/components/ProtocolBadge";
import { ReportButton } from "@/components/ReportButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api, errorMessage, remoteVideoThumbnailUrl } from "@/lib/api";
import type { RemoteVideo } from "@/lib/api";
import { formatDuration, relativeTime } from "@/lib/format";
import { useRemotePlayback } from "@/lib/use-remote-playback";

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
  const [status, setStatus] = useState<Status>("loading");
  const [video, setVideo] = useState<RemoteVideo | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

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
      <RemotePlayer video={video} />

      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{video.title}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500 dark:text-zinc-400">
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
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
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {formatDuration(video.duration_seconds)}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={video.watch_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Watch on {video.domain}
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
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
            </svg>
          </a>
          <ReportButton kind="remote_video" targetId={video.id} />
          <MuteInstanceControl domain={video.domain} />
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          This is a federated video from {video.domain}. Comments, ratings, and saving live on
          the origin instance. Reports go to the moderators of this instance.
        </p>
        {video.description ? (
          <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
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
function RemotePlayer({ video }: { video: RemoteVideo }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playback = useRemotePlayback(videoRef, video);

  if (playback.mode === "none") {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg bg-zinc-200 p-6 text-center dark:bg-zinc-800">
        {video.has_thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={remoteVideoThumbnailUrl(video.id)}
            alt=""
            className="max-h-32 rounded object-cover opacity-80"
          />
        ) : null}
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
          This video can&rsquo;t be played here.
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
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
      className="aspect-video w-full rounded-lg bg-black"
      src={playback.src}
      poster={video.has_thumbnail ? remoteVideoThumbnailUrl(video.id) : undefined}
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
      <button
        type="button"
        disabled={busy}
        aria-label={muted ? `Unmute instance ${domain}` : `Mute instance ${domain}`}
        onClick={() => void toggle()}
        className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        {muted ? "Unmute instance" : "Mute instance"}
      </button>
      {muted ? (
        <span role="status" className="text-xs text-zinc-500 dark:text-zinc-400">
          Muted {domain}. Its videos and comments no longer appear for you.
        </span>
      ) : null}
      {error ? (
        <span role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      ) : null}
    </span>
  );
}
