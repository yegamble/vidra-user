"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";

import { EndCard } from "@/components/player/EndCard";
import { OverlayButton } from "@/components/player/OverlayButton";
import { SeekBar } from "@/components/player/SeekBar";
import { VolumeControl } from "@/components/player/VolumeControl";
import { QualityMenu } from "@/components/QualityMenu";
import { SpeedMenu } from "@/components/SpeedMenu";
import { api, videoThumbnailUrl, type Video } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import { primeInstanceDefaults } from "@/lib/instance-defaults";
import {
  readStartOnOpen,
  readStoredAutoplay,
  serverAutoplay,
  serverStartOnOpen,
  subscribeAutoplay,
  toggleAutoplay,
} from "@/lib/player-autoplay";
import {
  readStoredRate,
  serverRate,
  stepPlaybackRate,
  storeRate,
  subscribeRate,
} from "@/lib/player-rates";
import {
  readStoredTheater,
  serverTheater,
  subscribeTheater,
  toggleTheater,
} from "@/lib/player-theater";
import {
  arePlayerSettingsHydrated,
  matchQualityLevel,
  usePlayerSettings,
} from "@/lib/player-settings";
import { isAutoQuality } from "@/lib/quality-id";
import { readBuffered, stepVolume } from "@/lib/player-ui";
import {
  SHORTCUT_IGNORE_SELECTOR,
  clampSeekTarget,
  seekTargetForFraction,
  shortcutForKey,
} from "@/lib/player-shortcuts";
import { useChapters } from "@/lib/use-chapters";
import { useHlsPlayback } from "@/lib/use-playback-engine";
import { useStoryboard } from "@/lib/use-storyboard";

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
  nextVideo = null,
  hlsMasterOverride = null,
  playbackToken = null,
  overlay = null,
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
  /**
   * A video-scoped playback token for a password-protected video (CORE-17),
   * threaded to the HLS pipeline (Bearer header in MSE mode, `?pt=` on native/
   * progressive src), the storyboard, and the poster. null for a normal video.
   * A secret — never logged.
   */
  playbackToken?: string | null;
  /**
   * Play the HLS ladder from this URL instead of the server one — the video's
   * IPFS gateway mirror (DR5). The progressive /original fallback stays the
   * authoritative server source, so a mid-stream IPFS failure degrades to it.
   */
  hlsMasterOverride?: string | null;
  /**
   * A layer painted over the whole media surface (above the controls) — the
   * IPFS fetching/error states WatchView drives. Covers the video while active.
   */
  overlay?: ReactNode;
  /**
   * The video to queue on the end card (PLAY-08) — the first related entry,
   * supplied by WatchView. null (embed, or nothing related) ⇒ the end card shows
   * a plain replay affordance with no countdown.
   */
  nextVideo?: Video | null;
  onPlay?: () => void;
  onTimeUpdate?: () => void;
  onPause?: () => void;
  /** Rendered inside the media container, over the video (e.g. the embed title link). */
  children?: ReactNode;
}) {
  const playback = useHlsPlayback(videoRef, video, startAt, hlsMasterOverride, playbackToken);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Seek-preview storyboard (CORE-16): null when the detail has none, so the
  // seek bar's scrub bubble degrades to the timestamp alone. The VTT/sprite only
  // load once the bar first previews (it calls storyboard.activate() on hover /
  // focus) — no fetch for a viewer who never scrubs.
  const storyboard = useStoryboard(video.id, video.has_storyboard, playbackToken);

  // Seek-bar chapters (CORE-15): null when the detail advertises none. Fetched
  // eagerly (unlike the storyboard) so the tick markers and the current-chapter
  // readout appear without any interaction; degrades to no ticks on a fetch miss.
  const chapters = useChapters(video.id, video.has_chapters);

  // The chosen playback rate is remembered for the browsing session (a stop-gap
  // until W1.U6's per-user default_speed). Read through useSyncExternalStore so
  // the SSR snapshot is the default (no hydration mismatch) and the client
  // restores the session's rate after hydration; user picks (the menu now,
  // `<`/`>` in W1.U8) go through setSpeed, which broadcasts to every player.
  const speed = useSyncExternalStore(subscribeRate, readStoredRate, serverRate);
  const setSpeed = useCallback((rate: number) => storeRate(rate), []);

  // Theater mode (PLAY-04, watch variant only): a page-layout concern WatchView
  // reacts to. The shell only owns the toggle button — it reads the same session
  // store WatchView does, so the button's aria-pressed stays in lockstep with the
  // layout. serverTheater keeps the SSR/first-client snapshot off (no mismatch).
  const theater = useSyncExternalStore(subscribeTheater, readStoredTheater, serverTheater);

  // Autoplay-next (PLAY-08): the effective preference the end card honours. A
  // per-session store with a baked default of ON (the signed-out default) — the
  // interim scope until W1.U6's per-user `autoplay_next` lands. serverAutoplay
  // and an unset store both read ON, so the SSR/first-client snapshot matches.
  const autoplayEnabled = useSyncExternalStore(
    subscribeAutoplay,
    readStoredAutoplay,
    serverAutoplay,
  );

  // Start-on-open (config-parity W5): the instance's defaults.player_autoplay
  // seeds whether the WATCH player attempts playback as soon as it opens
  // (embeds keep waiting for a click — an iframe must never surprise its host
  // page). false until the instance defaults land client-side AND the
  // per-user settings layer settles (WatchView hydrates a signed-in user's
  // autoplay_next / resets for anonymous) — so the operator seed can never
  // race ahead of, let alone override, an explicit session/per-user
  // preference (see lib/player-autoplay readStartOnOpen). The kick lives in
  // primeInstanceDefaults(), fired from the mount effect below; settlement
  // re-notifies through the same subscription, re-running the effect.
  const startOnOpen = useSyncExternalStore(subscribeAutoplay, readStartOnOpen, serverStartOnOpen);

  // The signed-in user's effective player defaults (PLAY-07 / W1.6). speed,
  // theater and autoplay flow through the session stores above (whose fallback is
  // the per-user default); default_quality and captions_default are consumed
  // directly here, applied once per video on load. Baked defaults (quality
  // "auto", captions off) until the watch page hydrates the settings, so a
  // signed-out player is unchanged.
  const settings = usePlayerSettings();

  // End card shown when the media element fires `ended`. Set only by the `ended`
  // event; cleared when playback (re)starts (the `play`/`loadstart` events), or
  // explicitly on dismiss — so all writes stay in event handlers (never a bare
  // effect body).
  const [ended, setEnded] = useState(false);
  // Flags that focus should return to the player controls once the card hides
  // (set by the dismiss / replay handlers; the countdown navigates away instead).
  const restoreFocus = useRef(false);

  const [paused, setPaused] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState<Array<[number, number]>>([]);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Picture-in-Picture (PLAY-05). pipSupported is resolved in an effect (reads
  // document.pictureInPictureEnabled — a client-only global), so it starts false
  // for SSR + the first client render (no hydration mismatch) and the button only
  // appears once support is confirmed. pipActive mirrors the element's
  // enter/leave events, so it reflects PiP started or ended from the browser's
  // own UI too.
  const [pipSupported, setPipSupported] = useState(false);
  const [pipActive, setPipActive] = useState(false);

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
      if (typeof el.fastSeek === "function") el.fastSeek(time);
      else el.currentTime = time;
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

  const togglePip = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (document.pictureInPictureElement) {
      void document.exitPictureInPicture().catch(() => {});
    } else {
      void el.requestPictureInPicture?.().catch(() => {});
    }
  }, [videoRef]);

  // In-bar autoplay-next toggle (YouTube parity). Flips the per-session
  // preference the end card honours (toggleAutoplay); and, when a signed-in
  // user's per-user settings are loaded (hydrated ⇒ signed in AND settled),
  // mirrors the new value to the account with a fire-and-forget merge-PUT,
  // exactly like PlayerSettingsView. Silent on failure — the session value has
  // already applied, so a dropped PUT never surfaces to the viewer. Anonymous /
  // unsettled users skip the PUT (there is no account to write to).
  const onToggleAutoplay = useCallback(() => {
    const next = !readStoredAutoplay();
    toggleAutoplay();
    if (arePlayerSettingsHydrated()) {
      void api.updatePlayerSettings({ autoplay_next: next }).catch(() => {});
    }
  }, []);

  // End-card actions (PLAY-08). Replay restarts the finished video from the top;
  // dismiss just closes the card. Both hand focus back to the player controls.
  const replayVideo = useCallback(() => {
    restoreFocus.current = true;
    setEnded(false); // the `play` event also clears it — this keeps the UI snappy
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = 0;
    void el.play().catch(() => {});
  }, [videoRef]);

  const dismissEndCard = useCallback(() => {
    restoreFocus.current = true;
    setEnded(false);
  }, []);

  // When the card hides after a dismiss/replay, return focus to the first player
  // control (the card had focus, so it must not be dropped to <body>).
  useEffect(() => {
    if (ended || !restoreFocus.current) return;
    restoreFocus.current = false;
    const btn = containerRef.current?.querySelector<HTMLElement>(
      '[data-testid="player-controls"] button',
    );
    btn?.focus();
  }, [ended]);

  // ---- start-on-open (config-parity W5) ----

  // One playback attempt per video while enabled (watch variant only). The
  // guard ref resets when the video changes so navigating watch→watch can
  // auto-start again, but a viewer's explicit pause is never fought — once
  // attempted, this never plays again for the same video. The attempt is
  // best-effort: the browser may still block it (autoplay policy) and the
  // rejection is swallowed, leaving the normal click-to-play surface.
  const startAttempted = useRef(false);
  useEffect(() => {
    startAttempted.current = false;
  }, [video.id]);
  useEffect(() => {
    primeInstanceDefaults();
    if (variant !== "watch" || !startOnOpen || startAttempted.current) return;
    const el = videoRef.current;
    if (!el || !el.paused) return;
    startAttempted.current = true;
    // el.play() may return undefined in non-browser test DOMs.
    void el.play()?.catch(() => {});
  }, [startOnOpen, variant, video.id, videoRef]);

  // ---- media-element state subscription (mounted once) ----

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onPlayEv = () => {
      setPaused(false);
      setEnded(false); // any (re)start clears the end card
      bump(); // playback started → begin the auto-hide countdown
      cbRef.current.onPlay?.();
    };
    const onPauseEv = () => {
      setPaused(true);
      window.clearTimeout(idleRef.current); // pause pins the controls visible
      cbRef.current.onPause?.();
    };
    const onEndedEv = () => {
      setEnded(true);
      window.clearTimeout(idleRef.current); // the end card takes over the surface
    };
    // A new source (navigation to another video within the page, or an
    // HLS→original fallback) resets the element, so drop any stale end card.
    const onLoadStartEv = () => setEnded(false);
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
    el.addEventListener("ended", onEndedEv);
    el.addEventListener("loadstart", onLoadStartEv);
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
      el.removeEventListener("ended", onEndedEv);
      el.removeEventListener("loadstart", onLoadStartEv);
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

  // Apply the per-user default quality (PLAY-07) once the HLS levels parse, once
  // per video: a stored rung this video actually offers switches to it; "auto"
  // (or an unavailable rung) stays adaptive. Guarded per video id so a later
  // manual pick in the quality menu is never overridden.
  const appliedQualityRef = useRef<string | null>(null);
  useEffect(() => {
    if (appliedQualityRef.current === video.id) return;
    if (playback.levels.length === 0) return; // levels not parsed yet
    appliedQualityRef.current = video.id;
    const target = matchQualityLevel(settings.default_quality, playback.levels);
    if (!isAutoQuality(target)) playback.setQuality(target);
  }, [playback, settings.default_quality, video.id]);

  // Apply the per-user "captions on by default" (PLAY-07) once per video when a
  // caption track exists: show the first track. Guarded per video id so turning
  // captions back off (or a later track change) doesn't re-enable them.
  const appliedCaptionsRef = useRef<string | null>(null);
  useEffect(() => {
    if (!settings.captions_default) return;
    if (tracks.length === 0) return;
    if (appliedCaptionsRef.current === video.id) return;
    const el = videoRef.current;
    if (!el) return;
    const list = Array.from(el.textTracks);
    if (list.length === 0) return; // <track>s not attached yet — retry on change
    appliedCaptionsRef.current = video.id;
    for (const t of list) t.mode = "disabled";
    list[0].mode = "showing";
    setCaptionsOn(true);
  }, [settings.captions_default, tracks.length, video.id, videoRef]);

  // Reflect fullscreen changes (including exits via Esc / browser UI) on the
  // container so the toggle's aria-pressed / icon stay truthful.
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Resolve PiP support (client-only) and mirror the element's PiP state from its
  // own enter/leave events — so the button hides where PiP is unavailable (not
  // disabled-forever) and its aria-pressed follows PiP toggled from the browser UI.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    setPipSupported(
      typeof document !== "undefined" &&
        document.pictureInPictureEnabled === true &&
        !el.disablePictureInPicture,
    );
    setPipActive(document.pictureInPictureElement === el);
    const onEnter = () => setPipActive(true);
    const onLeave = () => setPipActive(false);
    el.addEventListener("enterpictureinpicture", onEnter);
    el.addEventListener("leavepictureinpicture", onLeave);
    return () => {
      el.removeEventListener("enterpictureinpicture", onEnter);
      el.removeEventListener("leavepictureinpicture", onLeave);
    };
  }, [videoRef, playback.src]);

  // Player keyboard shortcuts (the full PLAY-09 set — see lib/player-shortcuts).
  // Ignored while typing / operating another control (SHORTCUT_IGNORE_SELECTOR)
  // or on a modified press. Volume arrows act only while the player region holds
  // focus (otherwise the page keeps its scroll); frame-stepping only while
  // paused — both gated inside shortcutForKey via the context. Fullscreen and
  // theater target the container / page layout (the custom chrome survives).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      const target = e.target;
      if (target instanceof HTMLElement && target.isContentEditable) return;
      if (target instanceof Element && target.closest(SHORTCUT_IGNORE_SELECTOR)) return;
      const el = videoRef.current;
      if (!el) return;
      const playerFocused = containerRef.current?.contains(document.activeElement) ?? false;
      const shortcut = shortcutForKey(e, { playerFocused, paused: el.paused });
      if (!shortcut) return;
      e.preventDefault();
      switch (shortcut.kind) {
        case "toggle-play":
          togglePlay();
          break;
        case "seek-by":
        case "frame-step":
          el.currentTime = clampSeekTarget(el.currentTime, shortcut.seconds, el.duration);
          break;
        case "seek-to-fraction": {
          const t = seekTargetForFraction(shortcut.fraction, el.duration);
          if (t !== null) el.currentTime = t;
          break;
        }
        case "volume-by":
          applyVolume(stepVolume(el.muted ? 0 : el.volume, shortcut.deltaPercent));
          break;
        case "speed-step":
          setSpeed(stepPlaybackRate(el.playbackRate, shortcut.direction));
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
        case "toggle-theater":
          // Theater is a watch-page layout mode; the embed shell has none.
          if (variant === "watch") toggleTheater();
          break;
        case "toggle-pip":
          // Only where the browser supports PiP (the button is hidden otherwise).
          if (pipSupported) togglePip();
          break;
      }
    }
    document.addEventListener("keydown", onKeyDown);
    // Readiness stamp: the controls are in the DOM from the render commit, but
    // this document-level listener only exists once the (post-paint) effect has
    // run — a keypress in that gap is silently lost. Mark the container so the
    // e2e suite can wait for the shortcuts to actually be live before pressing.
    // The attribute is not in the JSX, so React never touches it after this.
    containerRef.current?.setAttribute("data-shortcuts", "ready");
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    videoRef,
    togglePlay,
    toggleMute,
    toggleFullscreen,
    toggleCaptions,
    togglePip,
    applyVolume,
    setSpeed,
    variant,
    pipSupported,
  ]);

  function onContainerBlur(e: React.FocusEvent<HTMLDivElement>) {
    const c = containerRef.current;
    if (c && e.relatedTarget instanceof Node && c.contains(e.relatedTarget)) return;
    setFocusWithin(false);
  }

  const posterUrl =
    poster ?? (video.has_thumbnail ? videoThumbnailUrl(video.id, playbackToken) : undefined);
  // The chapter the playhead is currently inside (CORE-15) — shown, muted and
  // truncated, beside the time readout. Null before the first chapter / no chapters.
  const currentChapterTitle = chapters?.chapterAt(currentTime)?.title ?? null;

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
          the bar's Play button are the real, accessible controls. Suppressed once
          the end card takes over the surface. */}
      {paused && !ended ? (
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
          storyboard={storyboard}
          chapters={chapters}
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

          {/* Current chapter title (CORE-15): muted + truncated, held off the
              narrowest phone bar (< sm) so it never crowds the core controls. */}
          {currentChapterTitle ? (
            <span className="hidden min-w-0 max-w-[8rem] truncate px-0.5 text-[11px] text-white/70 sm:inline-block md:max-w-[14rem]">
              {currentChapterTitle}
            </span>
          ) : null}

          <div className="flex-1" />

          {/* Autoplay-next toggle (YouTube parity): leads the right-hand cluster
              (YouTube's autoplay switch sits just before captions/settings). A
              watch-page concern — an embed must never auto-chain to another
              video — so it is held off the embed shell. pressed = autoplay on;
              its snapshot flows through the same useSyncExternalStore wiring as
              the end card, so SSR/first-client render is stable. */}
          {variant === "watch" ? (
            <OverlayButton
              label={autoplayEnabled ? "Autoplay next is on" : "Autoplay next is off"}
              pressed={autoplayEnabled}
              onClick={onToggleAutoplay}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M10 9.5v5l4-2.5z" fill="currentColor" stroke="none" />
              </svg>
            </OverlayButton>
          ) : null}

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
            currentQuality={playback.currentQuality}
            activeHeight={playback.activeHeight}
            pending={playback.pending}
            onSelect={playback.setQuality}
            variant="overlay"
          />

          {/* Theater is a watch-page layout mode and only reflows the two-column
              stage at lg+, so the toggle appears only there (below lg the page is
              already single-column — the button would be a no-op, and it would
              crowd the phone control bar). display:contents keeps it a flush flex
              item without an extra box. */}
          {variant === "watch" ? (
            <div className="hidden lg:contents">
              <OverlayButton
                label="Theater mode"
                pressed={theater}
                onClick={() => toggleTheater()}
              >
                {theater ? (
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="6" y="7" width="12" height="10" rx="1.5" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="6" width="18" height="12" rx="1.5" />
                  </svg>
                )}
              </OverlayButton>
            </div>
          ) : null}

          {/* PiP hidden (not disabled) where the browser can't support it; also
              held off the narrowest phone bar (< sm) so it never crowds the
              always-visible core controls. */}
          {pipSupported ? (
            <div className="hidden sm:contents">
              <OverlayButton
                label={pipActive ? "Exit picture-in-picture" : "Picture-in-picture"}
                pressed={pipActive}
                onClick={togglePip}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <rect x="11" y="11" width="8" height="5" rx="1" fill="currentColor" stroke="none" />
                </svg>
              </OverlayButton>
            </div>
          ) : null}

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

      {/* End-of-playback card (PLAY-08): autoplay-next countdown when a next
          video is available, else a plain replay affordance. Media-overlay zone. */}
      {ended ? (
        <EndCard
          nextVideo={nextVideo}
          autoplayEnabled={autoplayEnabled}
          onToggleAutoplay={toggleAutoplay}
          onReplay={replayVideo}
          onDismiss={dismissEndCard}
        />
      ) : null}

      {/* IPFS fetching/error surface (DR5) — the topmost layer, over the video
          and controls. Content is owned by WatchView (peer-free copy). */}
      {overlay}
    </div>
  );
}
