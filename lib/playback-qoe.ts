"use client";

// The playback quality (QoE) beacon — phase-4 delivery item 4's client half.
//
// Transport is deliberately the SAME shape as lib/search-events.ts, which solved
// this problem once already: a bounded batch, an interval flush, an immediate
// flush when the batch fills, a keepalive flush on visibilitychange→hidden and
// pagehide, and a failure that drops the batch in silence. Ingest is
// POST /api/v1/qoe/events — ≤20 per batch, an all-or-nothing type allowlist, 202
// whether or not a row landed.
//
// THREE RULES THIS MODULE EXISTS TO KEEP:
//
// 1. THE CLIENT NEVER NAMES THE DELIVERY SOURCE. It reports `source_url`, the
//    final URL it actually fetched media from, and the server classifies that
//    origin against its own configured CDN base / IPFS gateway / object store /
//    public origin, folding everything it does not recognise into one `other`
//    bucket. That server-side mapping is what keeps the dimension bounded: a
//    client cannot invent a new value by naming a new host. So there is no
//    delivery-source vocabulary in this file, and there must never be one.
//
//    What this module DOES do to the URL is strip its query and fragment. The
//    server ignores them when classifying (it compares scheme+host+path), and a
//    media URL's query is precisely where the secrets live — a `?pt=` playback
//    token, a presigned signature. Telemetry is the last place either belongs.
//
// 2. "SELECTED RENDITION" IS UNKNOWABLE ON NATIVE HLS, PERMANENTLY. The browser
//    owns variant selection there through the manifest's SCORE attribute and
//    exposes no hook to read or set it, so the adapter can neither report the
//    rung nor honestly guess it. That is modelled as a first-class value —
//    RENDITION_UNSUPPORTED — and kept distinct from RENDITION_UNKNOWN ("this
//    engine can report a rung, but has not yet"). Both omit `rendition_height`
//    on the wire, and the server turns engine=native-hls into
//    `rendition_reporting_supported: false`, so the admin view reads "this engine
//    cannot answer" rather than "no data". A null would have read as a bug and a
//    synthesized height would have been a lie the server rejects outright (it
//    422s a native-hls event that claims a rendition).
//
// 3. NOTHING HERE MAY FAIL OR DELAY PLAYBACK. Every entry point is void, catches
//    everything, and returns immediately; a failed POST is dropped with no retry
//    (a retry queue is how best-effort telemetry becomes a memory leak and a
//    request storm on an origin that is already unwell). No playback path ever
//    awaits this module.
//
// SSR-safe: with no window there is no queue and every function no-ops.

import { api } from "@/lib/api";
import type {
  PlaybackSession,
  QoEEngine,
  QoEErrorClass,
  QoEEventInput,
  QoEPackagingFormat,
} from "@/lib/api/types";
import { logger } from "@/lib/logger";

/** The endpoint's per-request cap. A batch is a network optimisation, not a bulk channel. */
export const QOE_MAX_BATCH = 20;
const FLUSH_INTERVAL_MS = 5_000;
/** The server's own ceiling on any measured duration (1 hour), clamped here too. */
export const QOE_MAX_MEASUREMENT_MS = 3_600_000;
/** The server's `source_url` length fence. A longer URL is dropped, not truncated. */
const MAX_SOURCE_URL_LENGTH = 2048;

/**
 * This engine cannot name the rung it is playing, and never will. Native HLS:
 * the browser picks the variant and tells nobody. Distinct from a missing value.
 */
export const RENDITION_UNSUPPORTED = "unsupported" as const;
/** The engine can name a rung but has not reported one yet (no LEVEL_SWITCHED). */
export const RENDITION_UNKNOWN = "unknown" as const;

/** A rung height in pixels, or one of the two reasons there is no number. */
export type QoERendition =
  | number
  | typeof RENDITION_UNSUPPORTED
  | typeof RENDITION_UNKNOWN;

/**
 * What stays constant for one playback: which video, which session, which engine
 * and which packaging. All of it comes from the playback session — no session,
 * no subject, no measurement (the beacon is keyed by the session id, so an event
 * without one would be a number nothing can be correlated with).
 */
export interface QoESubject {
  videoId: string;
  sessionId: string;
  /**
   * The session's playback token, when the subject had one (password privacy).
   * The server verifies it and records `session_verified`, which is how an admin
   * learns what fraction of the numbers are attested. NEVER fabricate one, and
   * never substitute a token minted by anything but this session — the session
   * id is inside this token's signature and nowhere else.
   */
  playbackToken?: string;
  engine: QoEEngine;
  packagingFormat: QoEPackagingFormat;
}

/**
 * qoeSubject derives what to measure from the playback session, or null for a
 * playback that must not be measured. Null in three cases, each deliberate:
 *
 *   - NO SESSION. The beacon is keyed by the session id and the packaging format
 *     comes off the session, so a playback with no session has nothing to
 *     correlate and nothing to attribute. Measuring it would be inventing.
 *   - A LIVE SESSION (live_stream_id, no video_id). The ingest endpoint requires
 *     a video_id and does not read live_stream_id yet — live segments never enter
 *     the delivery resolver, so no origin classification can honestly produce
 *     `origin-live` today. One bad event rejects the WHOLE batch (validation is
 *     all-or-nothing), so a live event would take a page of VOD measurements
 *     down with it. When core accepts live, this test is the only thing to relax.
 *   - AN HLS PLAYBACK WHOSE SESSION NAMES NO PACKAGING FORMAT. hls-ts and cmaf
 *     are indistinguishable from the client — both serve HLS off master.m3u8 —
 *     so there is no guess to make. A progressive playback needs no session
 *     field: the flat original file IS the format, whatever the ladder was
 *     packaged as.
 */
export function qoeSubject(
  session: PlaybackSession | null | undefined,
  engine: QoEEngine | null,
): QoESubject | null {
  if (!session || !engine) return null;
  const { session_id: sessionId, video_id: videoId } = session;
  if (!sessionId || !videoId) return null;
  const packagingFormat: QoEPackagingFormat | undefined =
    engine === "progressive" ? "progressive" : session.packaging_format;
  if (!packagingFormat) return null;
  return {
    videoId,
    sessionId,
    ...(session.playback_token ? { playbackToken: session.playback_token } : {}),
    engine,
    packagingFormat,
  };
}

/** One thing that happened, with exactly the fields its type is allowed to carry. */
export type QoEMeasurement =
  | { type: "playback.start"; ttffMs: number; rendition: QoERendition }
  | {
      type: "playback.rebuffer";
      rebufferMs: number;
      rendition: QoERendition;
      trigger: "playback" | "seek";
    }
  | { type: "playback.bitrate_switch"; rendition: QoERendition; switchCount: number }
  | { type: "playback.error"; errorClass: QoEErrorClass; rendition: QoERendition };

/** The bits of the environment a measurement is explained by, not identified by. */
export interface QoEContext {
  /** The final URL media actually came from. Classified server-side, never stored. */
  sourceUrl?: string;
  /** Was the tab visible? A backgrounded tab stalls for reasons that are not delivery. */
  visible?: boolean;
}

/**
 * beaconSourceUrl reduces a fetched URL to what the classifier reads: scheme,
 * host and path, or a leading-slash path for a same-origin relative fetch (which
 * the server classifies as api-proxy by definition). Query and fragment are
 * dropped — they carry `?pt=` tokens and presigned signatures and the server
 * ignores them anyway. Returns undefined for anything empty, unparseable or
 * longer than the endpoint accepts, so the caller simply omits the field.
 */
export function beaconSourceUrl(raw: string | null | undefined): string | undefined {
  const value = (raw ?? "").trim();
  if (!value) return undefined;
  // A blob:/data: URL is hls.js's MSE object URL on the media element — it names
  // no origin and says nothing about delivery.
  if (/^(?:blob|data|mediasource):/i.test(value)) return undefined;
  const cut = (s: string) => s.split("#")[0].split("?")[0];
  let out: string;
  if (/^https?:\/\//i.test(value)) {
    out = cut(value);
  } else if (value.startsWith("/") && !value.startsWith("//")) {
    out = cut(value);
  } else {
    return undefined;
  }
  if (!out || out.length > MAX_SOURCE_URL_LENGTH) return undefined;
  return out;
}

/**
 * finalFetchUrl digs the URL a request ACTUALLY resolved to out of hls.js's
 * `networkDetails` — the XHR (`responseURL`, which follows redirects) or the
 * fetch Response (`url`). The redirect is the whole point: a 307 to a CDN or a
 * presigned object store is invisible in the URL we asked for and is exactly the
 * fact the delivery-source dimension exists to record.
 */
export function finalFetchUrl(networkDetails: unknown): string | null {
  if (!networkDetails || typeof networkDetails !== "object") return null;
  const details = networkDetails as { responseURL?: unknown; url?: unknown };
  if (typeof details.responseURL === "string" && details.responseURL) {
    return details.responseURL;
  }
  if (typeof details.url === "string" && details.url) return details.url;
  return null;
}

/**
 * hlsErrorClass maps an hls.js error onto the closed class vocabulary. Details
 * are consulted before the type because they are more specific: hls.js files
 * every manifest problem under NETWORK_ERROR, and "the playlist was unreachable"
 * and "a segment was unreachable" are different failures to an operator.
 */
export function hlsErrorClass(type: string, details?: string): QoEErrorClass {
  const detail = details ?? "";
  if (/^manifest/i.test(detail)) return "manifest";
  if (/timeout/i.test(detail)) return "timeout";
  switch (type) {
    case "networkError":
      return "network";
    case "mediaError":
    case "muxError":
      return "media";
    case "keySystemError":
      return "decrypt";
    default:
      return "other";
  }
}

/**
 * mediaErrorClass maps a media element's MediaError code (the native-HLS and
 * progressive paths, where there is no engine to ask) onto the vocabulary.
 * MEDIA_ERR_ABORTED is null: the viewer navigated away, which is not a failure.
 */
export function mediaErrorClass(code: number | undefined): QoEErrorClass | null {
  switch (code) {
    case 1:
      return null; // MEDIA_ERR_ABORTED
    case 2:
      return "network";
    case 3:
    case 4:
      return "media";
    default:
      return "other";
  }
}

/** Clamp a measured duration into the range the endpoint accepts. */
function clampMs(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.round(value), QOE_MAX_MEASUREMENT_MS);
}

/**
 * renditionHeight turns the rendition model into the wire field. Both
 * non-numeric spellings omit it, and native HLS can never produce a number even
 * if a caller passes one — the server rejects a native-hls event that claims a
 * rendition, and it is right to: the browser never told us.
 */
function renditionHeight(engine: QoEEngine, rendition: QoERendition): number | undefined {
  if (engine === "native-hls") return undefined;
  if (typeof rendition !== "number") return undefined;
  if (!Number.isFinite(rendition) || rendition <= 0 || rendition > 8640) return undefined;
  return Math.round(rendition);
}

/**
 * buildQoEEvent assembles one wire event. Pure — every rule above is applied
 * here so it is provable without a browser: per-type field discipline, the
 * rendition model, URL reduction, and the metadata allowlist the server keeps
 * (anything not on it is discarded server-side, so nothing else is sent).
 */
export function buildQoEEvent(
  subject: QoESubject,
  measurement: QoEMeasurement,
  context: QoEContext = {},
): QoEEventInput {
  const metadata: Record<string, unknown> = {};
  if (context.visible !== undefined) metadata.visible = context.visible;
  const source = beaconSourceUrl(context.sourceUrl);
  const event: QoEEventInput = {
    type: measurement.type,
    video_id: subject.videoId,
    session_id: subject.sessionId,
    engine: subject.engine,
    packaging_format: subject.packagingFormat,
    ...(subject.playbackToken ? { playback_token: subject.playbackToken } : {}),
    ...(source ? { source_url: source } : {}),
  };
  const height = renditionHeight(subject.engine, measurement.rendition);
  if (height !== undefined) event.rendition_height = height;
  switch (measurement.type) {
    case "playback.start":
      event.ttff_ms = clampMs(measurement.ttffMs);
      break;
    case "playback.rebuffer":
      event.rebuffer_ms = clampMs(measurement.rebufferMs);
      metadata.trigger = measurement.trigger;
      break;
    case "playback.bitrate_switch":
      metadata.switch_count = measurement.switchCount;
      break;
    case "playback.error":
      event.error_class = measurement.errorClass;
      metadata.fatal = true;
      break;
  }
  if (Object.keys(metadata).length > 0) event.metadata = metadata;
  return event;
}

let queue: QoEEventInput[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let listenersBound = false;

function bindLifecycleListeners(): void {
  if (listenersBound || typeof window === "undefined") return;
  listenersBound = true;
  // Flush on backgrounding/unload with fetch keepalive, so the last measurements
  // of a watch survive the transition. visibilitychange is the reliable signal on
  // mobile; pagehide covers desktop tab close and navigation.
  const onHide = () => {
    if (document.visibilityState === "hidden") flushPlaybackEvents({ keepalive: true });
  };
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", () => flushPlaybackEvents({ keepalive: true }));
}

function scheduleFlush(): void {
  if (flushTimer !== null || typeof window === "undefined") return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushPlaybackEvents();
  }, FLUSH_INTERVAL_MS);
}

/**
 * trackPlaybackEvent enqueues one measurement. A full batch (20) flushes at
 * once; a partial batch waits for the interval tick or a page-hide. No-op on the
 * server. Never throws — a playback path calls this and must never be able to
 * fail because of it.
 */
export function trackPlaybackEvent(event: QoEEventInput): void {
  if (typeof window === "undefined") return;
  bindLifecycleListeners();
  queue.push(event);
  if (queue.length >= QOE_MAX_BATCH) {
    flushPlaybackEvents();
  } else {
    scheduleFlush();
  }
}

/**
 * flushPlaybackEvents sends up to 20 queued events now and clears the timer.
 * Drops the batch silently on ANY error — including a synchronous throw out of
 * the API layer, which is why the call itself is wrapped: a beacon that threw
 * into an hls.js event handler would take playback with it. `keepalive` uses
 * fetch keepalive so a flush survives a page unload.
 */
export function flushPlaybackEvents(opts: { keepalive?: boolean } = {}): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (queue.length === 0) return;
  const batch = queue.slice(0, QOE_MAX_BATCH);
  queue = queue.slice(QOE_MAX_BATCH);
  const drop = (err: unknown) => {
    logger.debug("qoe events flush failed", {
      dropped: batch.length,
      error: err instanceof Error ? err.message : String(err),
    });
  };
  try {
    void api.postQoEEvents(batch, { keepalive: opts.keepalive }).catch(drop);
  } catch (err) {
    drop(err);
  }
  // More than one batch queued: keep draining on the next tick rather than
  // sending an oversized request the endpoint would reject wholesale.
  if (queue.length > 0) scheduleFlush();
}

/** Test-only: clear the in-memory queue and any pending timer. */
export function resetPlaybackQoEForTest(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  queue = [];
}
