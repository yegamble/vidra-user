// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";
import type { PlaybackSession, QoEEventInput } from "@/lib/api/types";

import {
  QOE_MAX_BATCH,
  RENDITION_UNKNOWN,
  RENDITION_UNSUPPORTED,
  beaconSourceUrl,
  buildQoEEvent,
  finalFetchUrl,
  flushPlaybackEvents,
  hlsErrorClass,
  mediaErrorClass,
  qoeSubject,
  resetPlaybackQoEForTest,
  trackPlaybackEvent,
  type QoESubject,
} from "./playback-qoe";

const SUBJECT: QoESubject = {
  videoId: "11111111-1111-1111-1111-111111111111",
  sessionId: "22222222-2222-2222-2222-222222222222",
  engine: "hls-js",
  packagingFormat: "cmaf",
};

const START = { type: "playback.start", ttffMs: 1234, rendition: 720 } as const;

beforeEach(() => {
  resetPlaybackQoEForTest();
});

afterEach(() => {
  resetPlaybackQoEForTest();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("the rendition model", () => {
  it("never lets native HLS report a rung — not even one it was handed", () => {
    // The browser owns variant selection there through the manifest SCORE
    // attribute and exposes no hook, so any height would be a fabrication. The
    // server agrees strongly enough to 422 the whole batch over it.
    const native: QoESubject = { ...SUBJECT, engine: "native-hls" };
    const event = buildQoEEvent(native, { ...START, rendition: 1080 });
    expect("rendition_height" in event).toBe(false);
  });

  it("omits the field for both unknowns rather than sending a null", () => {
    // A null in the payload reads as a bug or as zero. The absence plus
    // engine=native-hls is what the server turns into "this engine cannot
    // answer" instead of "no data".
    for (const rendition of [RENDITION_UNSUPPORTED, RENDITION_UNKNOWN] as const) {
      const event = buildQoEEvent(SUBJECT, { ...START, rendition });
      expect("rendition_height" in event).toBe(false);
      expect(JSON.stringify(event)).not.toContain("rendition_height");
    }
  });

  it("reports a real rung from an engine that can name one", () => {
    expect(buildQoEEvent(SUBJECT, START).rendition_height).toBe(720);
    // Out-of-range values are dropped, not clamped into a lie.
    expect(buildQoEEvent(SUBJECT, { ...START, rendition: 99_999 }).rendition_height).toBeUndefined();
  });
});

describe("buildQoEEvent", () => {
  it("carries only the measurement its own type is allowed to carry", () => {
    const start = buildQoEEvent(SUBJECT, START);
    expect(start).toMatchObject({
      type: "playback.start",
      video_id: SUBJECT.videoId,
      session_id: SUBJECT.sessionId,
      engine: "hls-js",
      packaging_format: "cmaf",
      ttff_ms: 1234,
    });
    expect(start.rebuffer_ms).toBeUndefined();
    expect(start.error_class).toBeUndefined();

    const rebuffer = buildQoEEvent(SUBJECT, {
      type: "playback.rebuffer",
      rebufferMs: 480.6,
      rendition: RENDITION_UNKNOWN,
      trigger: "seek",
    });
    expect(rebuffer.rebuffer_ms).toBe(481);
    expect(rebuffer.ttff_ms).toBeUndefined();
    expect(rebuffer.metadata).toMatchObject({ trigger: "seek" });

    const error = buildQoEEvent(SUBJECT, {
      type: "playback.error",
      errorClass: "manifest",
      rendition: RENDITION_UNKNOWN,
    });
    expect(error.error_class).toBe("manifest");
    expect(error.ttff_ms).toBeUndefined();
  });

  it("clamps a measurement into the range the endpoint accepts", () => {
    const wild = buildQoEEvent(SUBJECT, { ...START, ttffMs: 9_999_999 });
    expect(wild.ttff_ms).toBe(3_600_000);
    const negative = buildQoEEvent(SUBJECT, { ...START, ttffMs: -5 });
    expect(negative.ttff_ms).toBe(0);
  });

  it("sends a playback token only when the session issued one", () => {
    expect(buildQoEEvent(SUBJECT, START).playback_token).toBeUndefined();
    const attested = buildQoEEvent({ ...SUBJECT, playbackToken: "pt-abc" }, START);
    expect(attested.playback_token).toBe("pt-abc");
  });

  it("reports a URL, never a delivery source", () => {
    const event = buildQoEEvent(SUBJECT, START, {
      sourceUrl: "https://cdn.example.com/media/v/seg_1.m4s?pt=secret&v=gen1",
    });
    // The origin+path the server classifies — with the credential-bearing query
    // stripped, because telemetry is the last place a `?pt=` belongs.
    expect(event.source_url).toBe("https://cdn.example.com/media/v/seg_1.m4s");
    expect(JSON.stringify(event)).not.toContain("secret");
    expect(JSON.stringify(event)).not.toContain("delivery_source");
  });
});

describe("beaconSourceUrl", () => {
  it("keeps scheme+host+path so a path-mounted CDN base still matches", () => {
    expect(beaconSourceUrl("https://example.com/cdn/o/seg.ts?sig=abc#x")).toBe(
      "https://example.com/cdn/o/seg.ts",
    );
  });

  it("leaves an origin-relative fetch relative — the server reads that as api-proxy", () => {
    expect(beaconSourceUrl("/api/v1/videos/v1/hls/master.m3u8?v=gen1")).toBe(
      "/api/v1/videos/v1/hls/master.m3u8",
    );
  });

  it("drops what names no origin at all", () => {
    expect(beaconSourceUrl("blob:http://localhost/abc")).toBeUndefined();
    expect(beaconSourceUrl("mediasource:x")).toBeUndefined();
    expect(beaconSourceUrl("")).toBeUndefined();
    expect(beaconSourceUrl(null)).toBeUndefined();
    expect(beaconSourceUrl("ftp://example.com/x")).toBeUndefined();
    expect(beaconSourceUrl(`https://example.com/${"a".repeat(2100)}`)).toBeUndefined();
  });
});

describe("finalFetchUrl", () => {
  it("prefers the post-redirect URL an XHR resolved to", () => {
    // The redirect is the whole point: a 307 to a CDN is invisible in the URL we
    // asked for, and is exactly what the delivery dimension exists to record.
    expect(
      finalFetchUrl({ responseURL: "https://cdn.example.com/seg.ts", url: "/seg.ts" }),
    ).toBe("https://cdn.example.com/seg.ts");
    expect(finalFetchUrl({ url: "https://origin.example/seg.ts" })).toBe(
      "https://origin.example/seg.ts",
    );
    expect(finalFetchUrl(undefined)).toBeNull();
    expect(finalFetchUrl({})).toBeNull();
  });
});

describe("error classification", () => {
  it("reads hls.js details before its type — a dead playlist is not a dead segment", () => {
    expect(hlsErrorClass("networkError", "manifestLoadError")).toBe("manifest");
    expect(hlsErrorClass("networkError", "fragLoadTimeOut")).toBe("timeout");
    expect(hlsErrorClass("networkError", "fragLoadError")).toBe("network");
    expect(hlsErrorClass("mediaError", "bufferStalledError")).toBe("media");
    expect(hlsErrorClass("keySystemError", "keySystemNoKeys")).toBe("decrypt");
    expect(hlsErrorClass("otherError")).toBe("other");
  });

  it("maps a media element's error, and treats an abort as no failure", () => {
    expect(mediaErrorClass(1)).toBeNull(); // MEDIA_ERR_ABORTED: the viewer left
    expect(mediaErrorClass(2)).toBe("network");
    expect(mediaErrorClass(3)).toBe("media");
    expect(mediaErrorClass(4)).toBe("media");
    expect(mediaErrorClass(undefined)).toBe("other");
  });
});

describe("qoeSubject", () => {
  const videoSession: PlaybackSession = {
    session_id: SUBJECT.sessionId,
    video_id: SUBJECT.videoId,
    packaging_format: "hls-ts",
    hls_url: "/api/v1/videos/v1/hls/master.m3u8",
  };

  it("measures a video session", () => {
    expect(qoeSubject(videoSession, "hls-js")).toEqual({
      videoId: SUBJECT.videoId,
      sessionId: SUBJECT.sessionId,
      engine: "hls-js",
      packagingFormat: "hls-ts",
    });
  });

  it("does not measure a LIVE session — the ingest endpoint has no live path", () => {
    // It carries live_stream_id and no video_id. One rejected event fails the
    // WHOLE batch, so a live event would take a page of VOD measurements with it.
    const live: PlaybackSession = {
      session_id: SUBJECT.sessionId,
      live_stream_id: "33333333-3333-3333-3333-333333333333",
      packaging_format: "hls-ts",
      hls_url: "/api/v1/live/s1/hls/master.m3u8",
    };
    expect(qoeSubject(live, "hls-js")).toBeNull();
  });

  it("does not measure without a session, or without a format to attribute to", () => {
    expect(qoeSubject(null, "hls-js")).toBeNull();
    expect(qoeSubject(videoSession, null)).toBeNull();
    const noFormat: PlaybackSession = { ...videoSession, packaging_format: undefined };
    expect(qoeSubject(noFormat, "hls-js")).toBeNull();
    // ...except progressive, where the flat original file IS the format.
    expect(qoeSubject(noFormat, "progressive")?.packagingFormat).toBe("progressive");
  });

  it("carries the session's token so the server can attest the session id", () => {
    const locked: PlaybackSession = { ...videoSession, playback_token: "pt-xyz" };
    expect(qoeSubject(locked, "hls-js")?.playbackToken).toBe("pt-xyz");
    expect(qoeSubject(videoSession, "hls-js")?.playbackToken).toBeUndefined();
  });
});

describe("the beacon transport", () => {
  const event = (n: number): QoEEventInput => ({
    ...buildQoEEvent(SUBJECT, { ...START, ttffMs: n }),
  });

  it("holds a partial batch and flushes it on the interval tick", async () => {
    vi.useFakeTimers();
    const post = vi.spyOn(api, "postQoEEvents").mockResolvedValue(undefined);
    trackPlaybackEvent(event(1));
    trackPlaybackEvent(event(2));
    expect(post).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5_000);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toHaveLength(2);
  });

  it("flushes immediately once the batch is full, and never sends an oversized one", async () => {
    const post = vi.spyOn(api, "postQoEEvents").mockResolvedValue(undefined);
    for (let i = 0; i < QOE_MAX_BATCH + 3; i += 1) trackPlaybackEvent(event(i));
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toHaveLength(QOE_MAX_BATCH);

    // The remainder stays queued and drains on the next flush.
    flushPlaybackEvents();
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][0]).toHaveLength(3);
  });

  it("flushes with keepalive when the tab is hidden or unloaded", () => {
    const post = vi.spyOn(api, "postQoEEvents").mockResolvedValue(undefined);
    trackPlaybackEvent(event(1));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(post).toHaveBeenCalledWith(expect.any(Array), { keepalive: true });

    trackPlaybackEvent(event(2));
    window.dispatchEvent(new Event("pagehide"));
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][1]).toEqual({ keepalive: true });
  });

  it("drops the batch in silence when the endpoint fails, and never throws", async () => {
    // Telemetry is called from hls.js and media-element handlers. A throw or an
    // unhandled rejection here would surface as a broken player, so a rejected
    // POST — and a transport that throws synchronously — are both swallowed.
    const post = vi.spyOn(api, "postQoEEvents").mockRejectedValue(new Error("502"));
    trackPlaybackEvent(event(1));
    expect(() => flushPlaybackEvents()).not.toThrow();
    await Promise.resolve();
    expect(post).toHaveBeenCalledTimes(1);

    post.mockImplementation(() => {
      throw new Error("network stack is on fire");
    });
    trackPlaybackEvent(event(2));
    expect(() => flushPlaybackEvents()).not.toThrow();
    expect(post).toHaveBeenCalledTimes(2);

    // ...and neither dropped batch is retried: no queue grows behind a failing
    // endpoint, which is how best-effort telemetry becomes a request storm.
    post.mockClear();
    post.mockResolvedValue(undefined);
    flushPlaybackEvents();
    expect(post).not.toHaveBeenCalled();
  });
});
