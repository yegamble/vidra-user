"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { useSession } from "@/components/auth/AuthProvider";
import { AddToPlaylistButton } from "@/components/AddToPlaylistButton";
import { CommentsSection } from "@/components/CommentsSection";
import { DownloadButton } from "@/components/DownloadButton";
import { KeyboardShortcutsHelp } from "@/components/KeyboardShortcutsHelp";
import { PrivacyBadge } from "@/components/PrivacyBadge";
import { QualityMenu } from "@/components/QualityMenu";
import { RatingControls } from "@/components/RatingControls";
import { RelatedVideos } from "@/components/RelatedVideos";
import { ReportButton } from "@/components/ReportButton";
import { SaveButton } from "@/components/SaveButton";
import { ShareButton } from "@/components/ShareButton";
import { SpeedMenu } from "@/components/SpeedMenu";
import { StoryboardPreview } from "@/components/StoryboardPreview";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api, channelAvatarUrl, videoCaptionUrl, videoThumbnailUrl } from "@/lib/api";
import { getVideoConfigCached, resolveOptionLabel } from "@/lib/api/video-config";
import type { Video, VideoConfigResponse } from "@/lib/api";
import { feedHref } from "@/lib/feed-url";
import { formatCount, formatDuration, relativeTime } from "@/lib/format";
import {
  SHORTCUT_IGNORE_SELECTOR,
  clampSeekTarget,
  shortcutForKey,
} from "@/lib/player-shortcuts";
import { parseStartTime } from "@/lib/start-time";
import { useHlsPlayback } from "@/lib/use-hls-playback";

type Status = "loading" | "error" | "notfound" | "ready";

// How often, at most, playback progress is reported to the backend while watching.
const PROGRESS_INTERVAL_MS = 10_000;
// Only offer to resume when the saved position is past this many seconds (skip
// trivial positions a viewer would not want to "resume" into).
const RESUME_MIN_SECONDS = 5;

// WatchView loads one video client-side and plays it: the transcoded HLS ladder
// when the detail carries hls_url (see useHlsPlayback), else the original via a
// Range-capable <video src>. States: loading / not-found (404) / error (retry) /
// ready. For a signed-in viewer it records watch progress (so the video enters
// their history and can be resumed) and offers a Resume control from the saved
// position.
export function WatchView({ id }: { id: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [video, setVideo] = useState<Video | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // The player element, owned here so the Share dialog can read currentTime.
  const playerRef = useRef<HTMLVideoElement | null>(null);
  // An explicit ?t=<seconds> start position from the URL, parsed once. The
  // <video> only renders after the client-side fetch resolves, so reading
  // window here cannot cause a hydration mismatch.
  const [startAt] = useState<number | null>(() =>
    typeof window === "undefined" ? null : parseStartTime(window.location.search),
  );
  // The metadata taxonomy for the category/language/license chips, loaded
  // (cached, once per page load) only when the video carries any of them.
  const [config, setConfig] = useState<VideoConfigResponse | null>(null);
  const [configFailed, setConfigFailed] = useState(false);

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
  }, [id, reloadKey]);

  const hasTaxonomy = Boolean(video && (video.category || video.language || video.license));
  useEffect(() => {
    if (!hasTaxonomy) return;
    let cancelled = false;
    getVideoConfigCached()
      .then((c) => {
        if (!cancelled) setConfig(c);
      })
      .catch(() => {
        // Chips fall back to the raw taxonomy ids.
        if (!cancelled) setConfigFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [hasTaxonomy]);

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
        message="This video does not exist, or it is private."
      />
    );
  }
  if (status === "error" || video === null) {
    return <ErrorState message="Could not load this video." onRetry={retry} />;
  }

  const meta: string[] = [];
  if (typeof video.views === "number") meta.push(`${formatCount(video.views)} views`);
  const when = relativeTime(video.created_at);
  if (when) meta.push(when);

  // The detail response carries the owning channel's handle/display name (Wave A
  // contract) when it is a local video; a remote card has neither. Rendered as a
  // real affordance to /channels/{handle} rather than muted grey text.
  const channelHandle = video.channel_handle ?? null;
  const channelName = video.channel_display_name || channelHandle || "";

  const chips: Array<{ key: string; label: string; sr?: string }> = [];
  if (typeof video.duration_seconds === "number") {
    chips.push({ key: "duration", label: formatDuration(video.duration_seconds) });
  }
  if (typeof video.width === "number" && typeof video.height === "number") {
    chips.push({ key: "dimensions", label: `${video.width}×${video.height}` });
  }
  // Taxonomy chips render once the (cached) config resolves the human labels —
  // or with the raw ids if the config fetch failed. Only shown when set.
  if (config !== null || configFailed) {
    if (video.category) {
      chips.push({
        key: "category",
        sr: "Category: ",
        label: resolveOptionLabel(config?.categories, video.category),
      });
    }
    if (video.language) {
      chips.push({
        key: "language",
        sr: "Language: ",
        label: resolveOptionLabel(config?.languages, video.language),
      });
    }
    if (video.license) {
      chips.push({
        key: "license",
        sr: "License: ",
        label: resolveOptionLabel(config?.licenses, video.license),
      });
    }
  }

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-7">
      <div className="flex min-w-0 flex-1 flex-col gap-8">
      <article className="flex flex-col gap-4">
        <Player video={video} videoRef={playerRef} startAt={startAt} />

        <div className="flex flex-col gap-3">
          <h1 className="text-lg font-bold leading-snug tracking-tight sm:text-xl">
            {video.title}
          </h1>
          {/* Title-first metadata block: channel identity (avatar + name) leads,
              then a muted `views · age` remainder — reading `channel · views ·
              age` in the template's card language, sized up for the watch page. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {channelHandle ? (
              <Link
                href={`/channels/${channelHandle}`}
                className="focus-ring group -mx-1 inline-flex items-center gap-2.5 rounded-full px-1"
              >
                <Avatar
                  src={channelAvatarUrl(channelHandle)}
                  name={channelName}
                  className="h-9 w-9 text-[13px]"
                />
                <span className="text-sm font-semibold text-fg transition-colors group-hover:text-fg-muted">
                  {channelName}
                </span>
              </Link>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-fg-muted">
              {/* Owner-facing badge: a private video only ever loads for its
                  owner; an unlisted one tells anyone with the link how it is
                  shared. Public renders nothing. */}
              <PrivacyBadge privacy={video.privacy ?? "public"} />
              {meta.length > 0 ? <span className="tabular-nums">{meta.join(" · ")}</span> : null}
            </div>
          </div>
          {/* Secondary technical/taxonomy chips (duration, dimensions,
              category/language/license) on their own quiet row. */}
          {chips.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {chips.map((c) => (
                <span
                  key={c.key}
                  className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-medium tabular-nums text-fg-muted"
                >
                  {c.sr ? <span className="sr-only">{c.sr}</span> : null}
                  {c.label}
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4">
            <RatingControls videoId={video.id} />
            <SaveButton videoId={video.id} />
            <AddToPlaylistButton videoId={video.id} />
            <ShareButton
              videoId={video.id}
              title={video.title}
              getCurrentTime={() => playerRef.current?.currentTime ?? 0}
            />
            <DownloadButton videoId={video.id} />
            <ReportButton kind="video" targetId={video.id} />
          </div>
          {video.tags && video.tags.length > 0 ? (
            <ul aria-label="Tags" className="flex flex-wrap items-center gap-1.5">
              {video.tags.map((tag) => (
                <li key={tag}>
                  <Link
                    href={feedHref("recent", { tag })}
                    aria-label={`Browse videos tagged ${tag}`}
                    className="focus-ring inline-flex rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-fg-muted transition-colors hover:bg-surface-strong hover:text-fg"
                  >
                    #{tag}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {video.description ? (
            <p className="whitespace-pre-wrap rounded-2xl bg-surface-muted p-4 text-[13.5px] leading-relaxed text-fg">
              {video.description}
            </p>
          ) : null}
        </div>
      </article>

      <CommentsSection videoId={video.id} />
      </div>

      <RelatedVideos video={video} />
    </div>
  );
}

// Player wraps the native <video> with watch-history behaviour: for a signed-in
// viewer it reports playback position (throttled, plus on pause and unmount) and
// surfaces a Resume control loaded from the saved position. An explicit
// ?t=<seconds> start (startAt) is honoured via a media-fragment `#t=` on the
// stream src (or hls.js startPosition) — and suppresses the resume offer (the
// explicit link intent wins). When the detail carries hls_url the stream is the
// transcoded HLS ladder (hls.js over MSE, quality selectable via QualityMenu;
// native <video src> on MSE-less Safari), otherwise the progressive original.
function Player({
  video,
  videoRef,
  startAt,
}: {
  video: Video;
  videoRef: RefObject<HTMLVideoElement | null>;
  startAt: number | null;
}) {
  const { status: sessionStatus } = useSession();
  const authed = sessionStatus === "authed";
  const playback = useHlsPlayback(videoRef, video, startAt);
  const lastSentRef = useRef(0);
  const [resumeAt, setResumeAt] = useState<number | null>(null);
  const [speed, setSpeed] = useState(1);
  const [tracks, setTracks] = useState<
    Array<{ language: string; label: string; url: string }>
  >([]);

  // Apply the selected playback rate; re-applied when the src changes because
  // a media load() resets the element back to its default rate.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.defaultPlaybackRate = speed;
    el.playbackRate = speed;
  }, [speed, playback.src, videoRef]);

  // Player keyboard shortcuts (space/K, J/L, arrows, M, F, C — see
  // KeyboardShortcutsHelp). Ignored while typing in / operating another
  // interactive control, when the video's own native controls have focus
  // (they already handle these keys), or on modified presses.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      const target = e.target;
      if (target instanceof HTMLElement && target.isContentEditable) return;
      if (target instanceof Element && target.closest(SHORTCUT_IGNORE_SELECTOR)) return;
      const shortcut = shortcutForKey(e);
      const el = videoRef.current;
      if (!shortcut || !el) return;
      e.preventDefault();
      switch (shortcut.kind) {
        case "toggle-play":
          if (el.paused) void el.play().catch(() => {});
          else el.pause();
          break;
        case "seek-by":
          el.currentTime = clampSeekTarget(el.currentTime, shortcut.seconds, el.duration);
          break;
        case "toggle-mute":
          el.muted = !el.muted;
          break;
        case "toggle-fullscreen":
          if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
          else void el.requestFullscreen().catch(() => {});
          break;
        case "toggle-captions": {
          const list = Array.from(el.textTracks);
          if (list.length === 0) break;
          const anyShowing = list.some((t) => t.mode === "showing");
          for (const t of list) t.mode = "disabled";
          if (!anyShowing) list[0].mode = "showing";
          break;
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [videoRef]);

  // Report the current position (whole seconds). No-op unless signed in.
  const record = useCallback(() => {
    const el = videoRef.current;
    if (!authed || !el) return;
    const pos = Math.floor(el.currentTime || 0);
    void api.recordWatchProgress(video.id, pos).catch(() => {});
  }, [authed, video.id, videoRef]);

  // Throttled variant for the high-frequency timeupdate/play events.
  const recordThrottled = useCallback(() => {
    const now = Date.now();
    if (now - lastSentRef.current < PROGRESS_INTERVAL_MS) return;
    lastSentRef.current = now;
    record();
  }, [record]);

  // Load the saved resume position once (signed in only, and not when the URL
  // carries an explicit ?t= start).
  useEffect(() => {
    if (!authed || startAt !== null) return;
    const controller = new AbortController();
    api
      .getWatchProgress(video.id, controller.signal)
      .then((p) => {
        if (p.position_seconds >= RESUME_MIN_SECONDS) setResumeAt(p.position_seconds);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [authed, video.id, startAt]);

  // Flush the final position when leaving the page / switching videos.
  useEffect(() => {
    return () => record();
  }, [record]);

  // Load the video's caption tracks and expose each WebVTT body as a same-origin
  // blob URL. Fetching the text ourselves (rather than pointing <track src> at the
  // cross-origin backend) sidesteps the native cross-origin track restriction — no
  // `crossorigin` on the media element, so the Range-based stream is untouched.
  // Captions are small; loading them up front is cheap and revoked on cleanup.
  useEffect(() => {
    const controller = new AbortController();
    const created: string[] = [];
    let cancelled = false;
    api
      .getCaptions(video.id, controller.signal)
      .then(async ({ captions }) => {
        const loaded: Array<{ language: string; label: string; url: string }> = [];
        for (const c of captions) {
          try {
            const res = await fetch(videoCaptionUrl(video.id, c.language), {
              signal: controller.signal,
            });
            if (!res.ok) continue;
            const url = URL.createObjectURL(
              new Blob([await res.text()], { type: "text/vtt" }),
            );
            created.push(url);
            loaded.push({ language: c.language, label: c.label || c.language, url });
          } catch {
            // Skip a track that fails to load; the others still work.
          }
        }
        if (!cancelled) setTracks(loaded);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      controller.abort();
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [video.id]);

  function resume() {
    const el = videoRef.current;
    if (el && resumeAt !== null) {
      el.currentTime = resumeAt;
      void el.play().catch(() => {});
    }
    setResumeAt(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <video
        ref={videoRef}
        controls
        playsInline
        className="aspect-video w-full overflow-hidden rounded-2xl bg-black"
        src={playback.src}
        poster={video.has_thumbnail ? videoThumbnailUrl(video.id) : undefined}
        onPlay={recordThrottled}
        onTimeUpdate={recordThrottled}
        onPause={record}
      >
        {tracks.map((t) => (
          <track key={t.language} kind="captions" srcLang={t.language} label={t.label} src={t.url} />
        ))}
        Your browser does not support the video tag.
      </video>
      {/* Seek-hover preview thumbnails from the storyboard, when one exists. The
          native seekbar keeps working; this is an additional accessible scrubber. */}
      {video.has_storyboard ? (
        <StoryboardPreview
          videoId={video.id}
          videoRef={videoRef}
          durationSeconds={video.duration_seconds ?? undefined}
        />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {/* Speed applies to every playback path (native video.playbackRate). */}
        <SpeedMenu speed={speed} onSelect={setSpeed} />
        {/* Only hls.js playback exposes controllable quality; the menu hides
            itself for native-HLS/original playback (levels is empty). */}
        <QualityMenu
          levels={playback.levels}
          currentLevel={playback.currentLevel}
          onSelect={playback.setLevel}
        />
        {resumeAt !== null ? (
          <button
            type="button"
            onClick={resume}
            className="focus-ring inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-muted px-4 py-2 text-[13px] font-semibold tabular-nums text-fg transition-colors hover:bg-surface-strong"
          >
            Resume from {formatDuration(resumeAt)}
          </button>
        ) : null}
        <KeyboardShortcutsHelp />
      </div>
    </div>
  );
}
