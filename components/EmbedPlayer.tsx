"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { PasswordUnlockPanel } from "@/components/watch/PasswordUnlockPanel";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import { ApiError, api } from "@/lib/api";
import type { Video } from "@/lib/api";
import {
  clearPlaybackToken,
  setPlaybackToken as storePlaybackToken,
} from "@/lib/api/playback-token-store";
import { decideEmbed, type EmbedContext } from "@/lib/embed-privacy";
import { parseStartTime } from "@/lib/start-time";
import { watchPath } from "@/lib/watch-path";

// The embed-privacy gate outcome (CORE-17): whether this framing may show the
// video at all, decided before the detail is fetched. "open" ⇒ proceed to the
// (possibly password-gated) detail; the other two are terminal panels.
type Gate = "checking" | "disabled" | "blocked" | "open";
type Status = "loading" | "notfound" | "error" | "locked" | "ready";

// Read the current framing context for the whitelist check: whether /embed is
// top-level (a direct open, always allowed), the ancestor frame origins
// (Chromium), and the referrer (the Firefox fallback). Client-only.
function readEmbedContext(): EmbedContext {
  if (typeof window === "undefined") {
    return { isTopLevel: true, ancestorOrigins: [], referrer: "" };
  }
  const origins = window.location.ancestorOrigins;
  return {
    isTopLevel: window.top === window.self,
    ancestorOrigins: origins ? Array.from(origins) : [],
    referrer: document.referrer || "",
  };
}

// A centered message on the black embed surface (theme-invariant white-on-dark —
// the documented media-overlay exception; the frame is chrome-less media).
function EmbedNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh items-center justify-center bg-black px-4 text-center text-sm text-white/80">
      {children}
    </div>
  );
}

// EmbedPlayer is the stripped-down player served at /embed/[id] for iframing on
// other sites. It first reads the embed-privacy policy (CORE-17) and enforces it
// client-side: "disabled" and a non-whitelisted host get a blocked panel; a
// direct top-level open is always allowed. Then it loads the video, running the
// same password-unlock flow as the watch page in a compact panel when the detail
// answers 401 password_required. Only public/unlisted (or unlocked) videos play;
// a private/unknown video is "not available". No app chrome, comments, or
// auth-only controls; the app Header hides itself on /embed routes.
export function EmbedPlayer({ id }: { id: string }) {
  const [gate, setGate] = useState<Gate>("checking");
  const [status, setStatus] = useState<Status>("loading");
  const [video, setVideo] = useState<Video | null>(null);
  // The in-memory playback token for a password-protected embed (never persisted
  // or logged); dropped on unmount / id change.
  const [playbackToken, setPlaybackToken] = useState<string | null>(null);
  const [startAt] = useState<number | null>(() =>
    typeof window === "undefined" ? null : parseStartTime(window.location.search),
  );

  // Gate on the embed-privacy policy before revealing anything. A failed policy
  // read (network/other) fails OPEN to the detail fetch, which then applies its
  // own visibility (private/unknown → not available); enforcement is best-effort
  // client-side per the design.
  useEffect(() => {
    const controller = new AbortController();
    api
      .getVideoEmbedPrivacy(id, undefined, controller.signal)
      .then((policy) => {
        const decision = decideEmbed(policy, readEmbedContext());
        setGate(decision === "allow" ? "open" : decision);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        void err;
        setGate("open");
      });
    return () => controller.abort();
  }, [id]);

  // Load the detail once the gate is open; refetches with the token after unlock.
  useEffect(() => {
    if (gate !== "open") return;
    const controller = new AbortController();
    api
      .getVideo(id, playbackToken ?? undefined, controller.signal)
      .then((v) => {
        setVideo(v);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401 && err.code === "password_required") {
          setStatus("locked");
        } else {
          setStatus(err instanceof ApiError && err.status === 404 ? "notfound" : "error");
        }
      });
    return () => controller.abort();
  }, [id, gate, playbackToken]);

  const handleUnlocked = useCallback(
    (token: string) => {
      storePlaybackToken(id, token);
      setPlaybackToken(token);
      setStatus("loading");
    },
    [id],
  );

  useEffect(() => () => clearPlaybackToken(id), [id]);

  if (gate === "checking") {
    return (
      <div className="flex h-dvh items-center justify-center bg-black text-sm text-white/65">
        Loading…
      </div>
    );
  }
  if (gate === "disabled") {
    return <EmbedNotice>Embedding is disabled for this video.</EmbedNotice>;
  }
  if (gate === "blocked") {
    return <EmbedNotice>This video can’t be embedded on this site.</EmbedNotice>;
  }

  // gate === "open"
  if (status === "loading") {
    return (
      <div className="flex h-dvh items-center justify-center bg-black text-sm text-white/65">
        Loading…
      </div>
    );
  }
  if (status === "locked") {
    return (
      <div className="h-dvh w-full bg-black">
        <PasswordUnlockPanel videoId={id} onUnlocked={handleUnlocked} variant="embed" />
      </div>
    );
  }
  if (status === "notfound") {
    return <EmbedNotice>This video is not available.</EmbedNotice>;
  }
  if (status === "error" || video === null) {
    return <EmbedNotice>Could not load this video.</EmbedNotice>;
  }

  return <EmbedVideo video={video} startAt={startAt} playbackToken={playbackToken} />;
}

// EmbedVideo is the ready-state frame: the bespoke player shell sized to fill the
// iframe (variant="embed" — the same custom chrome as the watch page, minus the
// watch-only theater mode), plus the escape-hatch title link over the video. The
// videoRef is owned here so the shell can attach the HLS pipeline to it.
function EmbedVideo({
  video,
  startAt,
  playbackToken,
}: {
  video: Video;
  startAt: number | null;
  playbackToken: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  return (
    <div className="flex h-dvh w-full bg-black">
      <VideoPlayer
        video={video}
        videoRef={videoRef}
        startAt={startAt}
        variant="embed"
        playbackToken={playbackToken}
      >
        <Link
          href={watchPath(video)}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute left-0 top-0 z-30 max-w-full truncate rounded-br-lg bg-black/60 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur-sm hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          {video.title}
        </Link>
      </VideoPlayer>
    </div>
  );
}
