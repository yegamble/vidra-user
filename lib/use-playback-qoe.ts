"use client";

// THE CAPTURE POINT for playback quality (phase-4 delivery item 4's client half).
//
// It is one hook because there is one engine adapter (lib/use-playback-engine.ts,
// item 3): VOD, live and federated playback all run the same lifecycle, so
// instrumenting it once instruments every surface — which is exactly why item 4
// was sequenced behind item 3 rather than wired into three near-identical hooks.
//
// WHAT IS MEASURED, and where each number comes from:
//   TTFF              — the clock starts when this player is pointed at a source
//                       and stops at the first frame (`loadeddata`, or `playing`
//                       when a browser skips straight there). Engine-neutral on
//                       purpose: it is what the VIEWER waited, not what the
//                       winning engine took, so an hls.js decline that hands over
//                       to native HLS does not restart it.
//   rebuffer + count  — `waiting` after the first frame, closed by `playing`.
//                       A stall the viewer PAUSED through is dropped, not
//                       reported: we cannot know how long it would have lasted.
//   bitrate switches  — every effective rung change after the opening pick. The
//                       opening pick is not a switch; it rides on playback.start.
//   selected rendition— see the rendition model in lib/playback-qoe.ts.
//   playback errors   — fatal engine errors (reported in by the adapter) and
//                       media-element errors on the engines that have no adapter
//                       to report for them.
//   delivery source   — NOT computed here. The final URL is observed and the
//                       SERVER classifies its origin.
//
// NOTHING HERE MAY FAIL OR DELAY PLAYBACK. Every entry point is void and
// try/caught, nothing is awaited on a playback path, and the whole hook collapses
// to a no-op when there is no session to key measurements on.

import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";

import type { PlaybackSession, QoEErrorClass } from "@/lib/api/types";
import type { EngineId } from "@/lib/player-engine";
import {
  RENDITION_UNKNOWN,
  RENDITION_UNSUPPORTED,
  beaconSourceUrl,
  buildQoEEvent,
  flushPlaybackEvents,
  mediaErrorClass,
  qoeSubject,
  trackPlaybackEvent,
  type QoEMeasurement,
  type QoERendition,
  type QoESubject,
} from "@/lib/playback-qoe";

/**
 * A stall shorter than this is not a rebuffer. Browsers fire `waiting` on almost
 * every seek even with the data already buffered, and a dip the viewer cannot
 * perceive is measurement noise that would drown the stalls that matter.
 */
const MIN_REBUFFER_MS = 150;

/**
 * A hard ceiling on events from one playback session. ABR that flaps, or a
 * viewer scrubbing for ten minutes, must not turn best-effort telemetry into a
 * request storm. Dropping past the cap is silent and deliberate: the first 120
 * events already describe the playback.
 */
const MAX_EVENTS_PER_SESSION = 120;

/**
 * What the engine adapter reports IN — the three facts only the engine knows.
 * Everything else this hook observes from the media element itself.
 */
export interface PlaybackReporter {
  /**
   * The final URL a media request actually resolved to (hls.js `networkDetails`).
   * The redirect is the point: a 307 to a CDN or a presigned object store is
   * invisible in the URL we asked for.
   */
  observeFetch(url: string | null | undefined): void;
  /** The rung the engine is now playing (hls.js LEVEL_SWITCHED); null when unknown. */
  reportRendition(height: number | null): void;
  /** A fatal engine error, already mapped to the closed class vocabulary. */
  reportError(errorClass: QoEErrorClass): void;
}

interface MeasurementState {
  sessionId: string | null;
  subject: QoESubject | null;
  engine: EngineId | null;
  /** When this player was pointed at a source; null until it was. */
  anchorMs: number | null;
  firstFrame: boolean;
  rebufferStartMs: number | null;
  rebufferTrigger: "playback" | "seek";
  /** Last rung reported by the engine; null until one is (the opening pick). */
  height: number | null;
  switches: number;
  emitted: number;
  /**
   * A TTFF measured before this playback had a session to key it on, held until
   * one arrives. Public playback no longer waits for its session (see
   * videoNeedsPlaybackToken), so on a fast path the first frame can beat the
   * session response — and a start event is the one measurement that cannot be
   * taken again later. null when there is nothing held.
   */
  pendingStartTtffMs: number | null;
  /** The URL handed to the engine, and the final URL media actually came from. */
  sourceUrl?: string;
  fetchedUrl?: string;
}

function freshMeasurement(sessionId: string | null): MeasurementState {
  return {
    sessionId,
    subject: null,
    engine: null,
    anchorMs: null,
    firstFrame: false,
    rebufferStartMs: null,
    rebufferTrigger: "playback",
    height: null,
    switches: 0,
    emitted: 0,
    pendingStartTtffMs: null,
  };
}

function now(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

/**
 * currentRendition answers "which rung is playing?" for the engine in play.
 * Native HLS is UNSUPPORTED rather than unknown — the browser owns variant
 * selection and exposes no hook, so this is a capability gap and not a gap in
 * the data. Progressive playback reports the decoded frame height, which is not a
 * guess: there is exactly one flat file and that is its height.
 */
function currentRendition(
  state: MeasurementState,
  el: HTMLVideoElement | null,
): QoERendition {
  if (state.engine === "native-hls") return RENDITION_UNSUPPORTED;
  if (state.engine === "progressive") {
    const height = el?.videoHeight ?? 0;
    return height > 0 ? height : RENDITION_UNKNOWN;
  }
  return state.height ?? RENDITION_UNKNOWN;
}

/**
 * usePlaybackQoE instruments one playback. It measures only when the session
 * gives it something to key on (see qoeSubject): a federated video, a live
 * stream, or a session that never arrived is silently not measured rather than
 * measured with invented dimensions.
 */
export function usePlaybackQoE(args: {
  videoRef: RefObject<HTMLVideoElement | null>;
  /** The engine actually playing, or null while nothing is. */
  engine: EngineId | null;
  /** The playback session, or null when there is none. */
  session: PlaybackSession | null;
  /** The URL this engine was pointed at (the pre-redirect fallback source). */
  sourceUrl: string | undefined;
}): PlaybackReporter {
  const { videoRef, engine, session, sourceUrl } = args;
  const stateRef = useRef<MeasurementState>(freshMeasurement(null));

  const emit = useCallback(
    (build: (rendition: QoERendition) => QoEMeasurement) => {
      const state = stateRef.current;
      if (!state.subject) return;
      if (state.emitted >= MAX_EVENTS_PER_SESSION) return;
      state.emitted += 1;
      try {
        trackPlaybackEvent(
          buildQoEEvent(state.subject, build(currentRendition(state, videoRef.current)), {
            sourceUrl: state.fetchedUrl ?? state.sourceUrl,
            visible:
              typeof document === "undefined"
                ? undefined
                : document.visibilityState === "visible",
          }),
        );
      } catch {
        // Telemetry is best-effort and is called from playback event handlers:
        // a throw here would surface as a broken player.
      }
    },
    [videoRef],
  );

  // Keep the measurement state in step with the playback it describes. A new
  // session (a new video) resets everything — a fresh watch is a fresh
  // measurement, never a continuation of the last one.
  const sessionId = session?.session_id ?? null;
  useEffect(() => {
    const state = stateRef.current;
    if (state.sessionId === null && sessionId !== null) {
      // The session for a playback that has ALREADY STARTED. Since public
      // playback stopped waiting for its session, this is the ordinary case —
      // adopt the id into the running measurement rather than resetting, or the
      // clock that has been ticking since the engine got its source (and any
      // first frame already reached against it) would be thrown away and TTFF
      // would be re-measured from the session's arrival, which is neither what
      // the viewer waited nor, on a first frame already past, measurable at all.
      state.sessionId = sessionId;
    } else if (state.sessionId !== sessionId) {
      stateRef.current = freshMeasurement(sessionId);
    }
    const next = stateRef.current;
    if (next.engine !== engine) {
      next.engine = engine;
      // Anything observed so far was fetched down the PREVIOUS engine's path; a
      // new engine fetches from wherever its own source points, and attributing
      // its bytes to the old one would misreport the delivery source.
      next.fetchedUrl = undefined;
    }
    next.subject = qoeSubject(session, engine);
    next.sourceUrl = beaconSourceUrl(sourceUrl);
    if (engine && sourceUrl && next.anchorMs === null) next.anchorMs = now();
    // Release a start held back for want of a subject (see pendingStartTtffMs).
    // The number is the one measured at the first frame, not a fresh one: TTFF
    // is what the VIEWER waited, and the session landing afterwards did not
    // change that.
    const heldTtffMs = next.pendingStartTtffMs;
    if (heldTtffMs !== null && next.subject) {
      next.pendingStartTtffMs = null;
      emit((rendition) => ({ type: "playback.start", ttffMs: heldTtffMs, rendition }));
    }
  }, [sessionId, session, engine, sourceUrl, emit]);

  // Observe the media element. Re-attached per session so a navigation to
  // another video starts from a clean set of handlers.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const firstFrame = () => {
      const state = stateRef.current;
      if (state.firstFrame) return;
      state.firstFrame = true;
      const anchor = state.anchorMs;
      if (anchor === null) return;
      const ttffMs = now() - anchor;
      // No subject yet means the session has not landed — hold the measurement
      // instead of emitting it into nothing. `firstFrame` is already latched
      // above, so this is the only chance to keep it.
      if (!state.subject) {
        state.pendingStartTtffMs = ttffMs;
        return;
      }
      emit((rendition) => ({ type: "playback.start", ttffMs, rendition }));
    };

    const closeRebuffer = () => {
      const state = stateRef.current;
      const started = state.rebufferStartMs;
      if (started === null) return;
      state.rebufferStartMs = null;
      const rebufferMs = now() - started;
      if (rebufferMs < MIN_REBUFFER_MS) return;
      const trigger = state.rebufferTrigger;
      emit((rendition) => ({ type: "playback.rebuffer", rebufferMs, rendition, trigger }));
    };

    const onWaiting = () => {
      const state = stateRef.current;
      // Buffering before the first frame is start-up latency — it is already
      // being measured as TTFF, and counting it twice would report every
      // playback as beginning with a rebuffer.
      if (!state.firstFrame || state.rebufferStartMs !== null) return;
      state.rebufferStartMs = now();
      state.rebufferTrigger = el.seeking ? "seek" : "playback";
    };

    const onPlaying = () => {
      if (!stateRef.current.firstFrame) {
        firstFrame();
        return;
      }
      closeRebuffer();
    };

    // A viewer who pauses mid-stall ends the measurement, not the stall: how long
    // it would have taken is unknowable, so the pending rebuffer is dropped.
    const onPause = () => {
      stateRef.current.rebufferStartMs = null;
    };

    const onError = () => {
      const state = stateRef.current;
      // In MSE mode the element's src is a blob and hls.js owns error reporting
      // (it reports in through reportError); counting both would double the
      // error rate on exactly the engine most viewers use.
      if (state.engine === "hls-js") return;
      const errorClass = mediaErrorClass(el.error?.code);
      if (!errorClass) return;
      emit((rendition) => ({ type: "playback.error", errorClass, rendition }));
    };

    el.addEventListener("loadeddata", firstFrame);
    el.addEventListener("playing", onPlaying);
    el.addEventListener("waiting", onWaiting);
    el.addEventListener("pause", onPause);
    el.addEventListener("error", onError);
    return () => {
      el.removeEventListener("loadeddata", firstFrame);
      el.removeEventListener("playing", onPlaying);
      el.removeEventListener("waiting", onWaiting);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("error", onError);
    };
  }, [videoRef, sessionId, emit]);

  // Send what is queued when the player goes away (an SPA navigation fires no
  // pagehide). Fire-and-forget, like every other path into the beacon.
  useEffect(() => () => flushPlaybackEvents(), []);

  return useMemo<PlaybackReporter>(
    () => ({
      observeFetch(url) {
        const reduced = beaconSourceUrl(url);
        if (reduced) stateRef.current.fetchedUrl = reduced;
      },
      reportRendition(height) {
        const state = stateRef.current;
        const previous = state.height;
        state.height = height;
        // The first rung the engine lands on is the OPENING PICK, not a switch —
        // it is reported on playback.start. Only a change after that is a switch.
        if (height === null || previous === null || previous === height) return;
        state.switches += 1;
        const switchCount = state.switches;
        emit((rendition) => ({ type: "playback.bitrate_switch", rendition, switchCount }));
      },
      reportError(errorClass) {
        emit((rendition) => ({ type: "playback.error", errorClass, rendition }));
      },
    }),
    [emit],
  );
}
