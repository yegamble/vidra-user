"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { ApiError, api, videoThumbnailUrl } from "@/lib/api";
import type { Video } from "@/lib/api";
import { parseStartTime } from "@/lib/start-time";
import { useHlsPlayback } from "@/lib/use-hls-playback";

type Status = "loading" | "notfound" | "error" | "ready";

// EmbedPlayer is the stripped-down player served at /embed/[id] for iframing on
// other sites: the video (native controls) filling the frame, plus a small title
// link back to the full watch page (opens in a new tab so it escapes the iframe).
// Only public/unlisted videos are viewable — a private or unknown video is "not
// available" (mirrors the backend 404). No app chrome, comments, or auth-only
// controls; the app Header hides itself on /embed routes. HLS videos stream the
// transcoded ladder (same useHlsPlayback as the watch page) at hls.js's adaptive
// default — no quality menu here, keeping the chrome-less frame clean.
export function EmbedPlayer({ id }: { id: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [video, setVideo] = useState<Video | null>(null);
  // An explicit ?t=<seconds> start (what the share dialog emits), honoured via
  // a media-fragment `#t=` on the stream src (or hls.js startPosition). The
  // <video> only renders after the client-side fetch resolves, so reading
  // window here cannot cause a hydration mismatch.
  const [startAt] = useState<number | null>(() =>
    typeof window === "undefined" ? null : parseStartTime(window.location.search),
  );

  useEffect(() => {
    const controller = new AbortController();
    api
      .getVideo(id, undefined, controller.signal)
      .then((v) => {
        setVideo(v);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setStatus(err instanceof ApiError && err.status === 404 ? "notfound" : "error");
      });
    return () => controller.abort();
  }, [id]);

  if (status === "loading") {
    return (
      <div className="flex h-dvh items-center justify-center bg-black text-sm text-zinc-400">
        Loading…
      </div>
    );
  }
  if (status === "notfound") {
    return (
      <div className="flex h-dvh items-center justify-center bg-black px-4 text-center text-sm text-zinc-300">
        This video is not available.
      </div>
    );
  }
  if (status === "error" || video === null) {
    return (
      <div className="flex h-dvh items-center justify-center bg-black px-4 text-center text-sm text-zinc-300">
        Could not load this video.
      </div>
    );
  }

  return <EmbedVideo video={video} startAt={startAt} />;
}

// EmbedVideo is the ready-state frame: the media element (owned here so the
// HLS hook can attach to it) plus the escape-hatch title link.
function EmbedVideo({ video, startAt }: { video: Video; startAt: number | null }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playback = useHlsPlayback(videoRef, video, startAt);

  return (
    <div className="relative flex h-dvh w-full bg-black">
      <video
        ref={videoRef}
        controls
        playsInline
        className="h-full w-full bg-black"
        src={playback.src}
        poster={video.has_thumbnail ? videoThumbnailUrl(video.id) : undefined}
      >
        Your browser does not support the video tag.
      </video>
      <Link
        href={`/videos/${video.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute left-0 top-0 max-w-full truncate bg-black/60 px-3 py-1.5 text-sm font-medium text-white hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        {video.title}
      </Link>
    </div>
  );
}
