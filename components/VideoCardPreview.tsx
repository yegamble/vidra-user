"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { api, videoCaptionUrl } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import { fractionAt, fractionOfTime, timeAtFraction } from "@/lib/player-ui";
import { useStoryboard, type SeekStoryboard } from "@/lib/use-storyboard";
import {
  setVideoCardPreviewMuted,
  useVideoCardPreviewMuted,
} from "@/lib/video-card-preview-session";

export interface VideoCardPreviewCaptionTrack {
  language: string;
  label: string;
  src: string;
}

export interface VideoCardPreviewProps {
  videoId: string;
  title: string;
  href: string;
  /** A browser-playable progressive source. null keeps the poster-only card. */
  src: string | null | undefined;
  poster?: string | null;
  duration?: number | null;
  hasStoryboard?: boolean;
  /**
   * Ready caption tracks (prefer blob/same-origin URLs). When omitted, the
   * first available track is discovered and blob-loaded lazily on activation.
   * Pass an explicit empty array when the caller already knows there are none.
   */
  captions?: readonly VideoCardPreviewCaptionTrack[];
  /**
   * The integration point for instance + user policy. Pass true only when the
   * operator has enabled previews, the viewer has opted in, and this card has a
   * safe playable source. The component performs no settings fetch of its own.
  */
  previewEnabled: boolean;
  /** Small intent delay avoids downloading media during incidental pointer travel. */
  hoverDelayMs?: number;
  className?: string;
  posterClassName?: string;
  /** Non-interactive card badges such as duration, IPFS, or sensitive labels. */
  overlay?: ReactNode;
  /** Poster-less treatment supplied by the card; never renders a play button. */
  fallback?: ReactNode;
}

const DEFAULT_HOVER_DELAY_MS = 650;

/**
 * YouTube-style inline playback for a video-card media surface. The thumbnail
 * remains a normal link; after deliberate mouse/pen hover it is replaced by a
 * muted, captioned video with sound/CC toggles and a seekable storyboard bar.
 * Controls are siblings above the link (not interactive descendants of an
 * anchor), and consume pointer/click events so scrubbing never opens the card.
 */
export function VideoCardPreview({
  videoId,
  title,
  href,
  src,
  poster,
  duration,
  hasStoryboard = false,
  captions,
  previewEnabled,
  hoverDelayMs = DEFAULT_HOVER_DELAY_MS,
  className,
  posterClassName,
  overlay,
  fallback,
}: VideoCardPreviewProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoverActive, setHoverActive] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const muted = useVideoCardPreviewMuted();
  const [captionState, setCaptionState] = useState<{
    muted: boolean;
    choice: boolean | null;
  }>({ muted, choice: null });
  const storyboard = useStoryboard(videoId, hasStoryboard);
  const allowed = previewEnabled && typeof src === "string" && src.length > 0;
  const active = allowed && hoverActive;
  const captionTracks = usePreviewCaptionTracks(videoId, active, captions);
  const primaryCaptionSrc = captionTracks[0]?.src;
  // Each audio-mode transition restores the requested YouTube-like default:
  // captions while muted, no captions once explicitly unmuted. A manual CC
  // choice remains in force only until the audio mode changes again.
  const captionsOn = captionState.muted === muted ? (captionState.choice ?? muted) : muted;
  const effectiveDuration =
    typeof duration === "number" && Number.isFinite(duration) && duration > 0
      ? duration
      : mediaDuration;

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current === null) return;
    clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
  }, []);

  const stopPreview = useCallback(() => {
    clearHoverTimer();
    const media = videoRef.current;
    if (media) {
      media.pause();
      try {
        media.currentTime = 0;
      } catch {
        // A source can disappear between hover and teardown. Unmounting the
        // media element below is sufficient even when the reset is rejected.
      }
    }
    setCurrentTime(0);
    setHoverActive(false);
  }, [clearHoverTimer]);

  const beginHover = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      // Touch has no durable hover and must remain a normal thumbnail link.
      if (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") {
        return;
      }
      if (!allowed || active || hoverTimerRef.current !== null) return;
      hoverTimerRef.current = setTimeout(() => {
        hoverTimerRef.current = null;
        setHoverActive(true);
      }, Math.max(0, hoverDelayMs));
    },
    [active, allowed, hoverDelayMs],
  );

  const beginFocus = useCallback(() => {
    if (!allowed) return;
    clearHoverTimer();
    setHoverActive(true);
  }, [allowed, clearHoverTimer]);

  const leaveSurface = useCallback(() => {
    clearHoverTimer();
    const focused = typeof document === "undefined" ? null : document.activeElement;
    if (focused && surfaceRef.current?.contains(focused)) return;
    stopPreview();
  }, [clearHoverTimer, stopPreview]);

  const leaveFocus = useCallback(
    (event: ReactFocusEvent<HTMLDivElement>) => {
      const next = event.relatedTarget;
      if (next instanceof Node && event.currentTarget.contains(next)) return;
      stopPreview();
    },
    [stopPreview],
  );

  useEffect(
    () => () => {
      clearHoverTimer();
      videoRef.current?.pause();
    },
    [clearHoverTimer],
  );

  useEffect(() => {
    const media = videoRef.current;
    if (!active || !media) return;
    media.muted = muted;
    // play() may be undefined in lightweight DOM implementations and may reject
    // under a browser's autoplay policy; either way the card remains navigable.
    void media.play()?.catch(() => {});
  }, [active, muted]);

  useEffect(() => {
    const media = videoRef.current;
    if (!media) return;
    const textTracks = media.textTracks;
    if (!textTracks) return;
    for (let index = 0; index < textTracks.length; index += 1) {
      textTracks[index].mode = captionsOn && index === 0 ? "showing" : "disabled";
    }
  }, [active, captionsOn, primaryCaptionSrc]);

  const seekTo = useCallback((time: number) => {
    const media = videoRef.current;
    if (!media) return;
    media.currentTime = time;
    setCurrentTime(time);
  }, []);

  const stopCardInteraction = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      ref={surfaceRef}
      data-testid="video-card-preview"
      data-preview-active={active ? "true" : "false"}
      onPointerEnter={beginHover}
      onPointerLeave={leaveSurface}
      onFocusCapture={beginFocus}
      onBlurCapture={leaveFocus}
      className={cn(
        "group/preview relative aspect-video w-full overflow-hidden bg-surface-muted",
        className,
      )}
    >
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poster}
          alt=""
          loading="lazy"
          decoding="async"
          className={cn("absolute inset-0 h-full w-full object-cover", posterClassName)}
        />
      ) : (
        fallback ?? <div className="media-placeholder absolute inset-0" />
      )}

      {active && src ? (
        <video
          ref={videoRef}
          data-testid="video-card-preview-media"
          src={src}
          muted={muted}
          playsInline
          preload="metadata"
          className="pointer-events-none absolute inset-0 h-full w-full bg-black object-cover"
          onLoadedMetadata={(event) => {
            const nextDuration = event.currentTarget.duration;
            if (Number.isFinite(nextDuration) && nextDuration > 0) setMediaDuration(nextDuration);
          }}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onEnded={stopPreview}
          onError={stopPreview}
        >
          {captionTracks.map((track, index) => (
            <track
              key={`${track.language}:${track.src}`}
              kind="captions"
              src={track.src}
              srcLang={track.language}
              label={track.label}
              default={captionsOn && index === 0}
            />
          ))}
        </video>
      ) : null}

      <Link
        href={href}
        aria-label={title}
        className="focus-ring absolute inset-0 z-10 rounded-[inherit]"
      >
        <span className="sr-only">{title}</span>
      </Link>

      {overlay ? <div className="pointer-events-none absolute inset-0 z-20">{overlay}</div> : null}

      {active ? (
        <div
          data-testid="video-card-preview-controls"
          className="pointer-events-none absolute inset-0 z-30 bg-gradient-to-t from-black/65 via-transparent to-black/15"
        >
          <div className="pointer-events-auto absolute right-2 top-2 flex flex-col items-center gap-1.5">
            <button
              type="button"
              aria-label={muted ? "Unmute preview" : "Mute preview"}
              className="focus-ring flex h-9 w-9 items-center justify-center rounded-md bg-black/65 text-white shadow-sm backdrop-blur-sm hover:bg-black/80"
              onClick={(event) => {
                stopCardInteraction(event);
                setCaptionState({ muted: !muted, choice: null });
                setVideoCardPreviewMuted(!muted);
              }}
            >
              {muted ? <MutedIcon /> : <AudibleIcon />}
            </button>
            {captionTracks.length > 0 ? (
              <button
                type="button"
                aria-label={captionsOn ? "Hide preview captions" : "Show preview captions"}
                aria-pressed={captionsOn}
                className={cn(
                  "focus-ring flex h-9 min-w-9 items-center justify-center rounded-md bg-black/65 px-2 text-[13px] font-extrabold tracking-[-0.03em] text-white shadow-sm backdrop-blur-sm hover:bg-black/80",
                  captionsOn && "ring-2 ring-inset ring-white",
                )}
                onClick={(event) => {
                  stopCardInteraction(event);
                  setCaptionState({ muted, choice: !captionsOn });
                }}
              >
                CC
              </button>
            ) : null}
          </div>

          <div className="pointer-events-auto absolute inset-x-2 bottom-0">
            <VideoCardPreviewTimeline
              currentTime={currentTime}
              duration={effectiveDuration}
              onSeek={seekTo}
              storyboard={storyboard}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Caption metadata and VTT bytes are intentionally requested only after hover
 * intent activates playback. The first track is cached as a blob URL for this
 * mounted card, then revoked on unmount. This mirrors WatchView's cross-origin
 * safe caption path without turning a video grid into an eager N+1 fetch.
 */
function usePreviewCaptionTracks(
  videoId: string,
  active: boolean,
  provided: readonly VideoCardPreviewCaptionTrack[] | undefined,
): readonly VideoCardPreviewCaptionTrack[] {
  const [loaded, setLoaded] = useState<{
    videoId: string;
    tracks: VideoCardPreviewCaptionTrack[];
  } | null>(null);
  const inFlightRef = useRef<string | null>(null);
  const blobUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    if (provided !== undefined || !active) return;
    if (loaded?.videoId === videoId || inFlightRef.current === videoId) return;

    const controller = new AbortController();
    inFlightRef.current = videoId;
    api
      .getCaptions(videoId, controller.signal)
      .then(async ({ captions: available }) => {
        const first = available[0];
        if (!first) return [];
        const response = await fetch(videoCaptionUrl(videoId, first.language), {
          signal: controller.signal,
        });
        if (!response.ok) return [];
        const vtt = await response.text();
        if (controller.signal.aborted) return [];
        const directUrl = videoCaptionUrl(videoId, first.language);
        const url =
          typeof URL.createObjectURL === "function"
            ? URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }))
            : directUrl;
        if (url !== directUrl) blobUrlsRef.current.push(url);
        return [
          {
            language: first.language,
            label: first.label || first.language,
            src: url,
          },
        ];
      })
      .then((tracks) => {
        if (tracks && !controller.signal.aborted) setLoaded({ videoId, tracks });
      })
      .catch(() => {
        // A missing/failed caption never blocks the media preview.
      })
      .finally(() => {
        if (inFlightRef.current === videoId) inFlightRef.current = null;
      });

    return () => controller.abort();
  }, [active, loaded?.videoId, provided, videoId]);

  useEffect(
    () => () => {
      blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      blobUrlsRef.current = [];
    },
    [],
  );

  if (provided !== undefined) return provided;
  return loaded?.videoId === videoId ? loaded.tracks : [];
}

function VideoCardPreviewTimeline({
  currentTime,
  duration,
  onSeek,
  storyboard,
}: {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  storyboard: SeekStoryboard | null;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [hoverFraction, setHoverFraction] = useState<number | null>(null);
  const hasDuration = Number.isFinite(duration) && duration > 0;
  const playedFraction = fractionOfTime(currentTime, duration);
  const hoverTime = hoverFraction === null ? 0 : timeAtFraction(hoverFraction, duration);
  const cue = hoverFraction === null ? null : (storyboard?.cueAt(hoverTime) ?? null);

  const fractionFromPointer = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    return fractionAt(clientX, rect.left, rect.width);
  };

  const seekFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!hasDuration) return;
    onSeek(timeAtFraction(fractionFromPointer(event.clientX), duration));
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label="Preview timeline"
      aria-valuemin={0}
      aria-valuemax={hasDuration ? Math.round(duration) : 0}
      aria-valuenow={Math.round(currentTime)}
      aria-valuetext={`${formatDuration(currentTime)} of ${formatDuration(duration)}`}
      tabIndex={0}
      onPointerEnter={() => storyboard?.activate()}
      onPointerMove={(event) => {
        event.stopPropagation();
        storyboard?.activate();
        setHoverFraction(fractionFromPointer(event.clientX));
      }}
      onPointerLeave={() => setHoverFraction(null)}
      onPointerDown={(event) => {
        if (event.button !== 0 && event.pointerType === "mouse") return;
        event.preventDefault();
        event.stopPropagation();
        seekFromPointer(event);
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onFocus={() => storyboard?.activate()}
      onKeyDown={(event) => {
        if (!hasDuration) return;
        let next: number | null = null;
        if (event.key === "ArrowLeft") next = Math.max(0, currentTime - 5);
        else if (event.key === "ArrowRight") next = Math.min(duration, currentTime + 5);
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = duration;
        if (next === null) return;
        event.preventDefault();
        event.stopPropagation();
        onSeek(next);
      }}
      className="focus-ring group/timeline relative flex h-9 w-full cursor-pointer touch-none select-none items-end pb-2"
    >
      <div className="relative h-[3px] w-full overflow-hidden rounded-full bg-white/35 shadow-sm transition-[height] group-hover/timeline:h-2 group-focus/timeline:h-2">
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-0 bg-white"
          style={{ width: `${playedFraction * 100}%` }}
        />
      </div>
      <div
        aria-hidden="true"
        data-testid="video-card-preview-playhead"
        className="pointer-events-none absolute bottom-[5px] h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-white opacity-0 shadow-[0_1px_5px_rgba(0,0,0,0.65)] transition-opacity group-hover/timeline:opacity-100 group-focus/timeline:opacity-100"
        style={{ left: `${playedFraction * 100}%` }}
      />

      {hoverFraction !== null ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-8 flex -translate-x-1/2 flex-col items-center gap-1 rounded-lg bg-black/85 p-1 shadow-xl ring-1 ring-white/80"
          style={{
            left: `clamp(82px, ${hoverFraction * 100}%, calc(100% - 82px))`,
          }}
        >
          {cue && storyboard ? (
            <div
              data-testid="video-card-preview-storyboard"
              className="rounded-md"
              style={{
                width: `${cue.w}px`,
                height: `${cue.h}px`,
                backgroundImage: `url("${storyboard.spriteUrl}")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: `-${cue.x}px -${cue.y}px`,
              }}
            />
          ) : null}
          <span className="px-1 text-xs font-semibold tabular-nums text-white">
            {formatDuration(hoverTime)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function MutedIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 5 6 9H2v6h4l5 4V5zM22 9l-6 6M16 9l6 6" />
    </svg>
  );
}

function AudibleIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 5 6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" />
    </svg>
  );
}
