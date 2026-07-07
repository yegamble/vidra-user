"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import { OverlayButton } from "@/components/player/OverlayButton";
import { SeekBar } from "@/components/player/SeekBar";
import { VolumeControl } from "@/components/player/VolumeControl";
import { QualityMenu } from "@/components/QualityMenu";
import { SpeedMenu } from "@/components/SpeedMenu";
import { videoThumbnailUrl, type Video } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import { readBuffered } from "@/lib/player-ui";
import {
  SHORTCUT_IGNORE_SELECTOR,
  clampSeekTarget,
  shortcutForKey,
} from "@/lib/player-shortcuts";
import { useHlsPlayback } from "@/lib/use-hls-playback";

// How long the overlay controls linger after the last pointer activity while
// playing before auto-hiding (they never hide while paused, focused, or a menu
// holds focus inside the bar).
const IDLE_HIDE_MS = 3000;

export interface CaptionTrack {
  language: string;
  label: string;
  url: string;
}

// VideoPlayer is the bespoke player shell (PLAY-02): a chrome-less <video> in a
// rounded media container with a custom overlay control surface — play/pause
// (+ surface click), a keyboard-operable seek bar with buffered ranges, volume,
// a time readout, captions, the settings cluster (speed + the HLS quality
// selector) and fullscreen (on the CONTAINER, so the custom chrome survives
// fullscreen). It owns the HLS plumbing (useHlsPlayback) but NOT the <video>
// ref — the caller keeps that (WatchView reads currentTime for Share and reports
// watch progress via onPlay/onTimeUpdate/onPause). The "embed" variant is the
// same shell sized to fill an iframe (theater, a watch-only concern, is added in
// a later slice).
export function VideoPlayer({
  video,
  videoRef,
  startAt,
  variant = "watch",
  tracks = [],
  poster,
  onPlay,
  onTimeUpdate,
  onPause,
  children,
}: {
  video: Video;
  videoRef: RefObject<HTMLVideoElement | null>;
  startAt: number | null;
  variant?: "watch" | "embed";
  tracks?: CaptionTrack[];
  /** Explicit poster override; defaults to the video's own thumbnail when it has one. */
  poster?: string;
  onPlay?: () => void;
  onTimeUpdate?: () => void;
  onPause?: () => void;
  /** Rendered inside the media container, over the video (e.g. the embed title link). */
  children?: ReactNode;
}) {
  const playback = useHlsPlayback(videoRef, video, startAt);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState<Array<[number, number]>>([]);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Auto-hide bookkeeping: controls show while paused, while focus is inside the
  // bar (covers open menus, whose items/button hold focus), or briefly after any
  // pointer activity while playing.
  const [pointerActive, setPointerActive] = useState(true);
  const [focusWithin, setFocusWithin] = useState(false);
  const idleRef = useRef<number | undefined>(undefined);
  const controlsVisible = paused || focusWithin || pointerActive;

  // bump shows the controls and (re)arms the idle-hide timer; pointer activity
  // and playback start call it. Paused already forces controlsVisible, so a
  // stale timer firing while paused is harmless.
  const bump = useCallback(() => {
    setPointerActive(true);
    if (idleRef.current) window.clearTimeout(idleRef.current);
    idleRef.current = window.setTimeout(() => setPointerActive(false), IDLE_HIDE_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(idleRef.current), []);

  // Keep the latest progress-reporting callbacks in a ref so the media-event
  // subscription below stays mounted once (never re-subscribing on a new
  // callback identity), matching WatchView's throttled reporting.
  const cbRef = useRef({ onPlay, onTimeUpdate, onPause });
  useEffect(() => {
    cbRef.current = { onPlay, onTimeUpdate, onPause };
  }, [onPlay, onTimeUpdate, onPause]);

  // ---- control actions (shared by the buttons and the keyboard shortcuts) ----

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
  }, [videoRef]);

  const toggleMute = useCallback(() => {
    const el = videoRef.current;
    if (el) el.muted = !el.muted;
  }, [videoRef]);

  const applyVolume = useCallback(
    (level: number) => {
      const el = videoRef.current;
      if (!el) return;
      el.volume = level;
      if (level > 0) el.muted = false;
    },
    [videoRef],
  );

  const seekTo = useCallback(
    (time: number) => {
      const el = videoRef.current;
      if (!el) return;
      el.currentTime = time;
      setCurrentTime(time); // optimistic — timeupdate confirms
    },
    [videoRef],
  );

  const toggleCaptions = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    const list = Array.from(el.textTracks);
    if (list.length === 0) return;
    const anyShowing = list.some((t) => t.mode === "showing");
    for (const t of list) t.mode = "disabled";
    if (!anyShowing) list[0].mode = "showing";
    setCaptionsOn(!anyShowing);
  }, [videoRef]);

  const toggleFullscreen = useCallback(() => {
    const c = containerRef.current;
    if (!c) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void c.requestFullscreen().catch(() => {});
  }, []);

  // ---- media-element state subscription (mounted once) ----

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onPlayEv = () => {
      setPaused(false);
      bump(); // playback started → begin the auto-hide countdown
      cbRef.current.onPlay?.();
    };
    const onPauseEv = () => {
      setPaused(true);
      window.clearTimeout(idleRef.current); // pause pins the controls visible
      cbRef.current.onPause?.();
    };
    const onTimeEv = () => {
      setCurrentTime(el.currentTime);
      setBuffered(readBuffered(el.buffered));
      cbRef.current.onTimeUpdate?.();
    };
    const onProgressEv = () => setBuffered(readBuffered(el.buffered));
    const onDurationEv = () =>
      setDuration(Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0);
    const onVolumeEv = () => {
      setVolume(el.volume);
      setMuted(el.muted);
    };
    el.addEventListener("play", onPlayEv);
    el.addEventListener("pause", onPauseEv);
    el.addEventListener("timeupdate", onTimeEv);
    el.addEventListener("progress", onProgressEv);
    el.addEventListener("loadedmetadata", onDurationEv);
    el.addEventListener("durationchange", onDurationEv);
    el.addEventListener("volumechange", onVolumeEv);
    // Seed from the element's current state (it may already be primed).
    setPaused(el.paused);
    setCurrentTime(el.currentTime);
    onDurationEv();
    onProgressEv();
    setVolume(el.volume);
    setMuted(el.muted);
    return () => {
      el.removeEventListener("play", onPlayEv);
      el.removeEventListener("pause", onPauseEv);
      el.removeEventListener("timeupdate", onTimeEv);
      el.removeEventListener("progress", onProgressEv);
      el.removeEventListener("loadedmetadata", onDurationEv);
      el.removeEventListener("durationchange", onDurationEv);
      el.removeEventListener("volumechange", onVolumeEv);
    };
  }, [videoRef, bump]);

  // Track caption visibility from the element itself, so the toggle's
  // aria-pressed reflects changes made either here or via the C shortcut.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const list = el.textTracks;
    const sync = () => setCaptionsOn(Array.from(list).some((t) => t.mode === "showing"));
    sync();
    // TextTrackList is an EventTarget in browsers; some test DOMs (jsdom) omit
    // the listener methods, so guard before wiring the live sync.
    if (typeof list.addEventListener !== "function") return;
    list.addEventListener("change", sync);
    list.addEventListener("addtrack", sync);
    list.addEventListener("removetrack", sync);
    return () => {
      list.removeEventListener("change", sync);
      list.removeEventListener("addtrack", sync);
      list.removeEventListener("removetrack", sync);
    };
  }, [videoRef, tracks.length]);

  // Apply the selected rate; re-applied when the src changes (a media load()
  // resets the element to its default rate).
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.defaultPlaybackRate = speed;
    el.playbackRate = speed;
  }, [speed, playback.src, videoRef]);

  // Reflect fullscreen changes (including exits via Esc / browser UI) on the
  // container so the toggle's aria-pressed / icon stay truthful.
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Player keyboard shortcuts (space/K, J/L, arrows ±5s, M, F, C). Ignored while
  // typing / operating another control (SHORTCUT_IGNORE_SELECTOR) or on a
  // modified press. Fullscreen targets the container (custom chrome survives).
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
          togglePlay();
          break;
        case "seek-by":
          el.currentTime = clampSeekTarget(el.currentTime, shortcut.seconds, el.duration);
          break;
        case "toggle-mute":
          toggleMute();
          break;
        case "toggle-fullscreen":
          toggleFullscreen();
          break;
        case "toggle-captions":
          toggleCaptions();
          break;
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [videoRef, togglePlay, toggleMute, toggleFullscreen, toggleCaptions]);

  function onContainerBlur(e: React.FocusEvent<HTMLDivElement>) {
    const c = containerRef.current;
    if (c && e.relatedTarget instanceof Node && c.contains(e.relatedTarget)) return;
    setFocusWithin(false);
  }

  const posterUrl = poster ?? (video.has_thumbnail ? videoThumbnailUrl(video.id) : undefined);

  return (
    <div
      ref={containerRef}
      data-testid="video-player"
      className={cn(
        "relative w-full select-none overflow-hidden bg-black",
        variant === "embed" ? "h-full" : "aspect-video rounded-2xl",
      )}
      onPointerMove={bump}
      onPointerDown={bump}
      onFocus={() => setFocusWithin(true)}
      onBlur={onContainerBlur}
    >
      <video
        ref={videoRef}
        playsInline
        className="h-full w-full bg-black object-contain"
        src={playback.src}
        poster={posterUrl}
        onClick={togglePlay}
      >
        {tracks.map((t) => (
          <track key={t.language} kind="captions" srcLang={t.language} label={t.label} src={t.url} />
        ))}
        Your browser does not support the video tag.
      </video>

      {children}

      {/* Center play affordance while paused — decorative; the surface click and
          the bar's Play button are the real, accessible controls. */}
      {paused ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm">
            <svg viewBox="0 0 24 24" className="ml-0.5 h-7 w-7" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </div>
      ) : null}

      {/* The overlay control bar over a bottom scrim. Hidden = opacity only
          (never display), so focus is never lost; global reduced-motion neutralizes
          the fade. */}
      <div
        data-testid="player-controls"
        className={cn(
          "absolute inset-x-0 bottom-0 z-20 flex flex-col gap-0.5 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-1.5 pb-1.5 pt-10 transition-opacity sm:px-3 sm:pb-2",
          controlsVisible ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <SeekBar
          currentTime={currentTime}
          duration={duration}
          buffered={buffered}
          onSeek={seekTo}
        />
        <div className="flex items-center gap-0.5 sm:gap-1">
          <OverlayButton label={paused ? "Play" : "Pause"} onClick={togglePlay}>
            {paused ? (
              <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
              </svg>
            )}
          </OverlayButton>

          <VolumeControl
            volume={volume}
            muted={muted}
            onToggleMute={toggleMute}
            onSetVolume={applyVolume}
          />

          <span className="px-0.5 text-[11px] font-medium tabular-nums text-white/90 sm:text-xs">
            {formatDuration(currentTime)}
            <span className="text-white/50">/</span>
            {formatDuration(duration)}
          </span>

          <div className="flex-1" />

          {tracks.length > 0 ? (
            <OverlayButton label="Captions" pressed={captionsOn} onClick={toggleCaptions}>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M8 11.5a1.5 1.5 0 0 0-3 0v1a1.5 1.5 0 0 0 3 0M15 11.5a1.5 1.5 0 0 0-3 0v1a1.5 1.5 0 0 0 3 0" />
              </svg>
            </OverlayButton>
          ) : null}

          <SpeedMenu speed={speed} onSelect={setSpeed} variant="overlay" />

          <QualityMenu
            levels={playback.levels}
            currentLevel={playback.currentLevel}
            activeHeight={playback.activeHeight}
            pending={playback.pending}
            onSelect={playback.setLevel}
            variant="overlay"
          />

          <OverlayButton
            label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            pressed={isFullscreen}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M16 21v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            )}
          </OverlayButton>
        </div>
      </div>
    </div>
  );
}
