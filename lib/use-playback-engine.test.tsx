// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";
import type { PlaybackSession, QoEEventInput } from "@/lib/api/types";
import { flushPlaybackEvents, resetPlaybackQoEForTest } from "@/lib/playback-qoe";

import { useHlsPlayback, useLivePlayback, useRemotePlayback } from "./use-playback-engine";

const hlsMock = vi.hoisted(() => ({
  // What hls.js itself answers to isSupported(). It is the AUTHORITY on whether
  // that engine can run here, and it lives inside the chunk — which is why a
  // "no" arrives asynchronously, after selection has provisionally picked it.
  supported: true,
  instances: [] as Array<{
    config: Record<string, unknown>;
    currentLevel: number;
    nextLevel: number;
    // ABR's own opening pick, which hls.js exposes as a getter. -1 until it has
    // decided — the value the adapter must survive, not special-case.
    firstAutoLevel: number;
    autoLevelCapping: number;
    bandwidthEstimate: number;
    destroyed: boolean;
    source: string | null;
    levels: Array<{ height: number; codecSet?: string; uri?: string }>;
    emit: (event: string, ...args: unknown[]) => void;
  }>,
}));

vi.mock("hls.js", () => {
  class MockHls {
    static Events = {
      MANIFEST_PARSED: "manifestParsed",
      LEVEL_SWITCHED: "levelSwitched",
      FRAG_BUFFERED: "fragBuffered",
      FRAG_LOADED: "fragLoaded",
      ERROR: "error",
    };
    static ErrorTypes = { NETWORK_ERROR: "networkError", MEDIA_ERROR: "mediaError" };
    static isSupported() {
      return hlsMock.supported;
    }

    config: Record<string, unknown>;
    currentLevel = -1;
    nextLevel = -1;
    firstAutoLevel = -1;
    autoLevelCapping = -1;
    bandwidthEstimate = 7_500_000;
    destroyed = false;
    source: string | null = null;
    levels: Array<{ height: number; codecSet?: string; uri?: string }> = [];
    handlers: Record<string, Array<(...args: unknown[]) => void>> = {};

    constructor(config: Record<string, unknown> = {}) {
      this.config = config;
      hlsMock.instances.push(this);
    }

    on(event: string, handler: (...args: unknown[]) => void) {
      this.handlers[event] = [...(this.handlers[event] ?? []), handler];
    }
    emit(event: string, ...args: unknown[]) {
      for (const handler of this.handlers[event] ?? []) handler(event, ...args);
    }
    loadSource(source: string) {
      this.source = source;
    }
    attachMedia(media: HTMLMediaElement) {
      void media;
    }
    startLoad() {}
    recoverMediaError() {}
    destroy() {
      this.destroyed = true;
    }
  }

  return { default: MockHls };
});

// The playback session every surface now opens before it plays. Mutable so a
// test can change what the server answers — the same shape as hlsMock above.
const sessionMock: {
  video: Partial<PlaybackSession> | null;
  live: Partial<PlaybackSession> | null;
} = { video: null, live: null };

/** Every QoE event the beacon queued, captured at the transport boundary. */
let beaconed: QoEEventInput[] = [];

beforeEach(() => {
  hlsMock.instances.length = 0;
  hlsMock.supported = true;
  localStorage.clear();
  Reflect.deleteProperty(navigator, "connection");
  Object.defineProperty(window, "MediaSource", {
    configurable: true,
    value: class MediaSource {},
  });
  // Defaults that reproduce what these fixtures always played: the session
  // advertises the same master the detail used to.
  sessionMock.video = {
    session_id: "22222222-2222-2222-2222-222222222222",
    packaging_format: "hls-ts",
    hls_url: "/master.m3u8",
  };
  sessionMock.live = {
    session_id: "44444444-4444-4444-4444-444444444444",
    live_stream_id: "live-1",
    packaging_format: "hls-ts",
  };
  vi.spyOn(api, "createVideoPlaybackSession").mockImplementation((id: string) =>
    sessionMock.video
      ? Promise.resolve({ video_id: id, ...sessionMock.video } as PlaybackSession)
      : Promise.reject(new Error("no session")),
  );
  vi.spyOn(api, "createLivePlaybackSession").mockImplementation((id: string) =>
    sessionMock.live
      ? Promise.resolve({ live_stream_id: id, ...sessionMock.live } as PlaybackSession)
      : Promise.reject(new Error("no session")),
  );
  beaconed = [];
  resetPlaybackQoEForTest();
  vi.spyOn(api, "postQoEEvents").mockImplementation((events) => {
    beaconed.push(...events);
    return Promise.resolve(undefined);
  });
});

afterEach(() => {
  cleanup();
  resetPlaybackQoEForTest();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, "MediaSource");
});

describe("hls.js playback tuning", () => {
  it("bounds the VOD back-buffer and caps ABR to player/decode capacity", async () => {
    // The SESSION advertises the generation-versioned master now; the detail's
    // copy is stale the moment a re-transcode bumps the generation. A public
    // video no longer WAITS for that answer, so it opens on the detail's copy
    // and the session's answer replaces it: the session still decides what
    // plays, it just no longer decides when playback may begin.
    sessionMock.video = { ...sessionMock.video, hls_url: "/master.m3u8?v=generation-1" };
    const videoRef = { current: document.createElement("video") };
    const { result } = renderHook(() =>
      useHlsPlayback(
        videoRef,
        { id: "video-1", hls_url: "/master.m3u8?v=generation-0" },
        12,
      ),
    );

    await waitFor(() =>
      expect(hlsMock.instances.at(-1)?.source).toBe(
        "http://localhost:8080/master.m3u8?v=generation-1",
      ),
    );
    // A pick made from the parsed menu is an engine-neutral id; the adapter is
    // the only thing that turns it back into an hls.js level index.
    const hls = hlsMock.instances.at(-1)!;
    expect(hls.config).toMatchObject({
      startPosition: 12,
      backBufferLength: 90,
      // Forward-buffer headroom above hls.js's 30s floor, without moving the
      // maxBufferSize/maxMaxBufferLength memory ceiling.
      maxBufferLength: 60,
      capLevelToPlayerSize: true,
      capLevelOnFPSDrop: true,
      abrEwmaDefaultEstimate: 2_000_000,
    });
    // Tightened stall detection. The retry sub-objects MUST be hls.js's own
    // defaults: mergeConfig replaces the whole LoadPolicy when it is named, so
    // omitting them would silently drop every fragment retry.
    expect(hls.config.fragLoadPolicy).toEqual({
      default: {
        maxTimeToFirstByteMs: 5_000,
        maxLoadTimeMs: 30_000,
        timeoutRetry: { maxNumRetry: 4, retryDelayMs: 0, maxRetryDelayMs: 0 },
        errorRetry: { maxNumRetry: 6, retryDelayMs: 1_000, maxRetryDelayMs: 8_000 },
      },
    });

    hls.levels = [{ height: 480 }, { height: 720 }, { height: 1080 }];
    act(() => hls.emit("manifestParsed"));
    const pinned = result.current.levels.find((l) => l.label === "1080p")!;
    act(() => result.current.setQuality(pinned.id));
    expect(hls.nextLevel).toBe(2);
    expect(result.current.currentQuality).toEqual({ height: 1080 });
    expect(result.current.pending).toBe(true);

    // The engine landing on that rendition confirms the pick and clears "busy".
    act(() => hls.emit("levelSwitched", { level: 2 }));
    expect(result.current.pending).toBe(false);
    expect(result.current.activeHeight).toBe(1080);

    // Back to adaptive: the sentinel is a state of the player, and -1 is written
    // only to the engine.
    act(() => result.current.setQuality("auto"));
    expect(hls.nextLevel).toBe(-1);
    expect(result.current.currentQuality).toBe("auto");
    expect(result.current.pending).toBe(false);
  });

  it("ignores a rung this ladder does not offer instead of guessing one", async () => {
    const videoRef = { current: document.createElement("video") };
    const { result } = renderHook(() =>
      useHlsPlayback(videoRef, { id: "video-1", hls_url: "/master.m3u8" }, null),
    );

    await waitFor(() => expect(hlsMock.instances).toHaveLength(1));
    const hls = hlsMock.instances[0];
    hls.levels = [{ height: 480 }, { height: 720 }];
    act(() => hls.emit("manifestParsed"));

    act(() => result.current.setQuality({ height: 2160 }));
    expect(hls.nextLevel).toBe(-1); // untouched
    expect(result.current.currentQuality).toBe("auto");
  });

  it("exposes no quality entries on the native branch — the browser owns selection", async () => {
    // iOS Safari: no MSE, native HLS. Variant selection is the browser's,
    // steered by the SCORE attribute on each variant; nothing can read or set
    // it, so the honest answer is an empty menu (QualityMenu then renders null).
    Reflect.deleteProperty(window, "MediaSource");
    const canPlayType = vi
      .spyOn(HTMLMediaElement.prototype, "canPlayType")
      .mockReturnValue("maybe");
    const videoRef = { current: document.createElement("video") };
    const { result } = renderHook(() =>
      useHlsPlayback(videoRef, { id: "video-1", hls_url: "/master.m3u8" }, null),
    );

    await waitFor(() => expect(result.current.mode).toBe("native-hls"));
    expect(result.current.levels).toEqual([]);
    expect(result.current.activeHeight).toBeNull();
    expect(result.current.src).toBe("http://localhost:8080/master.m3u8");
    // hls.js is never even loaded on this path.
    expect(hlsMock.instances).toHaveLength(0);
    canPlayType.mockRestore();
  });

  it("caps Auto after the manifest and persists server-path throughput", async () => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { effectiveType: "3g" },
    });
    const videoRef = { current: document.createElement("video") };
    renderHook(() =>
      useHlsPlayback(videoRef, { id: "video-1", hls_url: "/master.m3u8" }, null),
    );

    await waitFor(() => expect(hlsMock.instances).toHaveLength(1));
    const hls = hlsMock.instances[0];
    hls.levels = [{ height: 1080 }, { height: 480 }, { height: 720 }];
    act(() => hls.emit("manifestParsed"));
    expect(hls.autoLevelCapping).toBe(2);

    act(() => hls.emit("fragBuffered"));
    expect(localStorage.getItem("vidra:hls-bandwidth-estimate:v1")).toContain("7500000");
  });

  it("keeps the quality menu inside the codec family hls.js is playing", async () => {
    const videoRef = { current: document.createElement("video") };
    const { result } = renderHook(() =>
      useHlsPlayback(videoRef, { id: "video-1", hls_url: "/master.m3u8" }, null),
    );

    await waitFor(() => expect(hlsMock.instances).toHaveLength(1));
    const hls = hlsMock.instances[0];
    // A multi-codec master as hls.js sorts it: height ascending, preferred codec
    // last. Manifest order is inert — these are the indices hls.js exposes.
    hls.levels = [
      { height: 480, codecSet: "avc1,mp4a", uri: "media_0.m3u8" },
      { height: 480, codecSet: "hvc1,mp4a", uri: "media_1.m3u8" },
      { height: 1080, codecSet: "avc1,mp4a", uri: "media_2.m3u8" },
      { height: 1080, codecSet: "hvc1,mp4a", uri: "media_3.m3u8" },
    ];
    // ABR opens on the H.264 rung → the menu offers only H.264 rungs, so picking
    // 1080p cannot force a cross-codec (changeType) switch.
    hls.firstAutoLevel = 0;
    act(() => hls.emit("manifestParsed"));
    expect(result.current.levels.map((l) => l.id)).toEqual([
      "auto",
      { height: 1080, codecFamily: "avc1,mp4a", repId: 2 },
      { height: 480, codecFamily: "avc1,mp4a", repId: 0 },
    ]);
    const at1080 = result.current.levels.find((l) => l.label === "1080p")!;
    act(() => result.current.setQuality(at1080.id));
    expect(hls.nextLevel).toBe(2); // the H.264 1080p, never index 3

    // The engine itself lands in the HEVC family: the menu follows it.
    act(() => hls.emit("levelSwitched", { level: 3 }));
    expect(result.current.levels.map((l) => l.id)).toEqual([
      "auto",
      { height: 1080, codecFamily: "hvc1,mp4a", repId: 3 },
      { height: 480, codecFamily: "hvc1,mp4a", repId: 1 },
    ]);
    expect(result.current.activeHeight).toBe(1080);
    // A switch into ANOTHER family is not the rung that was asked for, so the
    // manual pick stays busy rather than falsely reading as confirmed.
    expect(result.current.pending).toBe(true);
  });

  it("builds the menu inside hls.js's preferred family when ABR has not picked yet", async () => {
    const videoRef = { current: document.createElement("video") };
    const { result } = renderHook(() =>
      useHlsPlayback(videoRef, { id: "video-1", hls_url: "/master.m3u8" }, null),
    );

    await waitFor(() => expect(hlsMock.instances).toHaveLength(1));
    const hls = hlsMock.instances[0];
    hls.levels = [
      { height: 720, codecSet: "avc1,mp4a" },
      { height: 720, codecSet: "hvc1,mp4a" },
    ];
    // firstAutoLevel is -1 until ABR decides. That is not an index into the
    // level list, so the menu falls back to the preferred-last family (HEVC).
    hls.firstAutoLevel = -1;
    act(() => hls.emit("manifestParsed"));
    expect(result.current.levels.map((l) => l.id)).toEqual([
      "auto",
      { height: 720, codecFamily: "hvc1,mp4a" },
    ]);
  });

  it("does not reuse or persist the server estimate for an IPFS mirror", async () => {
    localStorage.setItem(
      "vidra:hls-bandwidth-estimate:v1",
      JSON.stringify({ bitsPerSecond: 12_000_000, measuredAt: Date.now() }),
    );
    const videoRef = { current: document.createElement("video") };
    renderHook(() =>
      useHlsPlayback(
        videoRef,
        { id: "video-1", hls_url: "/master.m3u8" },
        null,
        "https://ipfs.test/master.m3u8",
      ),
    );

    await waitFor(() => expect(hlsMock.instances).toHaveLength(1));
    const hls = hlsMock.instances[0];
    expect(hls.config.abrEwmaDefaultEstimate).toBe(2_000_000);
    hls.bandwidthEstimate = 3_000_000;
    act(() => hls.emit("fragBuffered"));
    expect(localStorage.getItem("vidra:hls-bandwidth-estimate:v1")).toContain("12000000");
  });

  it("uses the shorter live buffer and switches quality without a hard flush", async () => {
    const videoRef = { current: document.createElement("video") };
    const { result } = renderHook(() => useLivePlayback(videoRef, "live-1"));

    await waitFor(() => expect(hlsMock.instances).toHaveLength(1));
    expect(hlsMock.instances[0].config).toMatchObject({
      lowLatencyMode: false,
      backBufferLength: 30,
      capLevelToPlayerSize: true,
      capLevelOnFPSDrop: true,
    });

    const hls = hlsMock.instances[0];
    hls.levels = [{ height: 480 }, { height: 720 }];
    act(() => hls.emit("manifestParsed"));
    const pinned = result.current.levels.find((l) => l.label === "720p")!;
    act(() => result.current.setQuality(pinned.id));
    expect(hls.nextLevel).toBe(1);
    expect(hls.currentLevel).toBe(-1);
  });

  it("keeps the live quality menu inside the codec family too (PR #58 reached VOD only)", async () => {
    const videoRef = { current: document.createElement("video") };
    const { result } = renderHook(() => useLivePlayback(videoRef, "live-1"));

    await waitFor(() => expect(hlsMock.instances).toHaveLength(1));
    const hls = hlsMock.instances[0];
    hls.levels = [
      { height: 720, codecSet: "avc1,mp4a" },
      { height: 720, codecSet: "hvc1,mp4a" },
      { height: 1080, codecSet: "avc1,mp4a" },
      { height: 1080, codecSet: "hvc1,mp4a" },
    ];
    hls.firstAutoLevel = 0;
    act(() => hls.emit("manifestParsed"));
    expect(result.current.levels.map((l) => l.id)).toEqual([
      "auto",
      { height: 1080, codecFamily: "avc1,mp4a" },
      { height: 720, codecFamily: "avc1,mp4a" },
    ]);
    const at1080 = result.current.levels.find((l) => l.label === "1080p")!;
    act(() => result.current.setQuality(at1080.id));
    expect(hls.nextLevel).toBe(2); // the H.264 1080p, never the HEVC index 3

    // …and it follows the engine when ABR settles in the other family.
    act(() => hls.emit("levelSwitched", { level: 3 }));
    expect(result.current.levels.map((l) => l.id)).toEqual([
      "auto",
      { height: 1080, codecFamily: "hvc1,mp4a" },
      { height: 720, codecFamily: "hvc1,mp4a" },
    ]);
  });
});

// Selection is `probe → ask each engine → pick`, and the second half of the
// probe is asynchronous: only hls.js knows whether hls.js can run here, and it
// says so from inside the chunk. What it says must move the pick.
describe("engine selection", () => {
  const VIDEO = { id: "video-1", hls_url: "/master.m3u8" };

  it("promotes native HLS when hls.js declines — not the whole progressive file", async () => {
    // MSE-partial browser (ManagedMediaSource without MediaSource, or an hls.js
    // that does not drive it): the master playlist is still perfectly playable
    // by the browser itself. Routing this device to the progressive original is
    // a bandwidth cliff — the entire file instead of an ABR ladder.
    hlsMock.supported = false;
    const canPlayType = vi
      .spyOn(HTMLMediaElement.prototype, "canPlayType")
      .mockReturnValue("maybe");
    const videoRef = { current: document.createElement("video") };
    const { result } = renderHook(() => useHlsPlayback(videoRef, VIDEO, null));

    // hls.js won selection first (MSE is present) and the chunk WAS loaded —
    // there is no other way to ask it — but it built no instance.
    await waitFor(() => expect(result.current.mode).toBe("native-hls"));
    expect(hlsMock.instances).toHaveLength(0);
    expect(result.current.src).toBe("http://localhost:8080/master.m3u8");
    expect(result.current.levels).toEqual([]);
    canPlayType.mockRestore();
  });

  it("falls to the progressive file only when nothing here reads a playlist", async () => {
    // Same decline, but this browser makes no native-HLS claim at all
    // (jsdom's canPlayType is ""), so the progressive file really is next.
    hlsMock.supported = false;
    const videoRef = { current: document.createElement("video") };
    const { result } = renderHook(() => useHlsPlayback(videoRef, VIDEO, null));

    await waitFor(() => expect(result.current.mode).toBe("progressive"));
    expect(result.current.src).toBe("http://localhost:8080/api/v1/videos/video-1/original");
  });

  it("drops every HLS engine when the PLAYLIST is what failed", async () => {
    // A fatal error before MANIFEST_PARSED is evidence about the stream, not
    // about one engine — so a browser claiming native HLS must NOT be handed
    // the same broken master (Chromium's canPlayType claims HLS it cannot
    // play). VOD degrades to the progressive original, as it always has.
    const canPlayType = vi
      .spyOn(HTMLMediaElement.prototype, "canPlayType")
      .mockReturnValue("maybe");
    const videoRef = { current: document.createElement("video") };
    const { result } = renderHook(() => useHlsPlayback(videoRef, VIDEO, null));

    await waitFor(() => expect(hlsMock.instances).toHaveLength(1));
    const hls = hlsMock.instances[0];
    act(() => hls.emit("error", { fatal: true, type: "networkError" }));

    await waitFor(() => expect(result.current.mode).toBe("progressive"));
    expect(hls.destroyed).toBe(true);
    expect(result.current.src).toBe("http://localhost:8080/api/v1/videos/video-1/original");
    canPlayType.mockRestore();
  });
});

// Live and federated playback had no tests at all before they shared VOD's
// lifecycle. These assert the three behaviours the collapse was for.
describe("live playback", () => {
  it("reads the active rung out of LEVEL_SWITCHED, like VOD always has", async () => {
    const videoRef = { current: document.createElement("video") };
    const { result } = renderHook(() => useLivePlayback(videoRef, "live-1"));

    await waitFor(() => expect(hlsMock.instances).toHaveLength(1));
    const hls = hlsMock.instances[0];
    hls.levels = [{ height: 480 }, { height: 720 }];
    act(() => hls.emit("manifestParsed"));
    expect(result.current.activeHeight).toBeNull();

    act(() => hls.emit("levelSwitched", { level: 1 }));
    expect(result.current.activeHeight).toBe(720);
    expect(result.current.failed).toBe(false);
  });

  it("retries twice, then fails honestly — there is no original to degrade to", async () => {
    const videoRef = { current: document.createElement("video") };
    const { result } = renderHook(() => useLivePlayback(videoRef, "live-1"));

    await waitFor(() => expect(hlsMock.instances).toHaveLength(1));
    const hls = hlsMock.instances[0];
    hls.levels = [{ height: 720 }];
    act(() => hls.emit("manifestParsed"));

    act(() => hls.emit("error", { fatal: true, type: "networkError" }));
    act(() => hls.emit("error", { fatal: true, type: "mediaError" }));
    expect(result.current.failed).toBe(false);
    expect(hls.destroyed).toBe(false);

    act(() => hls.emit("error", { fatal: true, type: "networkError" }));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.mode).toBeNull();
    expect(hls.destroyed).toBe(true);
  });

  it("does not read or write the VOD path's remembered throughput", async () => {
    localStorage.setItem(
      "vidra:hls-bandwidth-estimate:v1",
      JSON.stringify({ bitsPerSecond: 12_000_000, measuredAt: Date.now() }),
    );
    const videoRef = { current: document.createElement("video") };
    renderHook(() => useLivePlayback(videoRef, "live-1"));

    await waitFor(() => expect(hlsMock.instances).toHaveLength(1));
    const hls = hlsMock.instances[0];
    // Nothing has ever measured the live edge, so hls.js's own default stands.
    expect(hls.config.abrEwmaDefaultEstimate).toBeUndefined();
    hls.bandwidthEstimate = 3_000_000;
    act(() => hls.emit("fragBuffered"));
    expect(localStorage.getItem("vidra:hls-bandwidth-estimate:v1")).toContain("12000000");
  });
});

describe("federated playback", () => {
  const REMOTE = { id: "remote-1", stream_url: "https://origin.example/v/master.m3u8" };

  it("gets the ABR tuning it previously had none of", async () => {
    // The whole defect: `new Hls()` with no config at all, so an open federated
    // watch retained the entire played stream in MSE and downloaded renditions
    // the rendered player could not use.
    const videoRef = { current: document.createElement("video") };
    const { result } = renderHook(() => useRemotePlayback(videoRef, REMOTE));

    await waitFor(() => expect(hlsMock.instances).toHaveLength(1));
    expect(hlsMock.instances[0].config).toMatchObject({
      backBufferLength: 90,
      capLevelToPlayerSize: true,
      capLevelOnFPSDrop: true,
    });
    expect(hlsMock.instances[0].source).toBe(REMOTE.stream_url);
    expect(result.current.mode).toBe("hls-js");
    expect(result.current.src).toBeUndefined();
  });

  it("caps Auto on a metered connection, like every other surface", async () => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { effectiveType: "3g" },
    });
    const videoRef = { current: document.createElement("video") };
    renderHook(() => useRemotePlayback(videoRef, REMOTE));

    await waitFor(() => expect(hlsMock.instances).toHaveLength(1));
    const hls = hlsMock.instances[0];
    hls.levels = [{ height: 1080 }, { height: 480 }, { height: 720 }];
    act(() => hls.emit("manifestParsed"));
    expect(hls.autoLevelCapping).toBe(2); // the 720p rung
  });

  it("retries a fatal error twice before giving up on the origin", async () => {
    // It used to destroy on the FIRST fatal error, so one dropped segment
    // request took the viewer to the link-out panel while VOD and live both
    // recovered from the same blip.
    const videoRef = { current: document.createElement("video") };
    const { result } = renderHook(() => useRemotePlayback(videoRef, REMOTE));

    await waitFor(() => expect(hlsMock.instances).toHaveLength(1));
    const hls = hlsMock.instances[0];
    hls.levels = [{ height: 720 }];
    act(() => hls.emit("manifestParsed"));

    act(() => hls.emit("error", { fatal: true, type: "networkError" }));
    act(() => hls.emit("error", { fatal: true, type: "mediaError" }));
    expect(result.current.mode).toBe("hls-js");
    expect(hls.destroyed).toBe(false);

    // Exhausted: an origin we do not control has no fallback here, so the page
    // keeps its "Watch on <origin>" link as the honest path.
    act(() => hls.emit("error", { fatal: true, type: "networkError" }));
    await waitFor(() => expect(result.current.mode).toBeNull());
    expect(result.current.src).toBeUndefined();
    expect(hls.destroyed).toBe(true);
  });

  it("plays a direct file with no engine chunk at all", () => {
    const videoRef = { current: document.createElement("video") };
    const { result } = renderHook(() =>
      useRemotePlayback(videoRef, { id: "remote-2", stream_url: "https://origin.example/f.mp4" }),
    );

    expect(result.current.mode).toBe("progressive");
    expect(result.current.src).toBe("https://origin.example/f.mp4");
    expect(hlsMock.instances).toHaveLength(0);
  });

  it("selects nothing when the origin advertised no stream", () => {
    const videoRef = { current: document.createElement("video") };
    const { result } = renderHook(() => useRemotePlayback(videoRef, { id: "remote-3" }));

    expect(result.current.mode).toBeNull();
    expect(result.current.src).toBeUndefined();
  });
});

// Phase-4 item 1: the session is the front door. It decides what plays, and it
// is the ONLY place a media credential may come from.
describe("the playback session drives the source", () => {
  const VIDEO = { id: "video-1", hls_url: "/detail/master.m3u8" };

  it("plays the session's manifest, not the detail's", async () => {
    sessionMock.video = { ...sessionMock.video, hls_url: "/session/master.m3u8?v=gen7" };
    const videoRef = { current: document.createElement("video") };
    renderHook(() => useHlsPlayback(videoRef, VIDEO, null));

    await waitFor(() =>
      expect(hlsMock.instances.at(-1)?.source).toBe(
        "http://localhost:8080/session/master.m3u8?v=gen7",
      ),
    );
  });

  it("starts a public video on the detail's manifest without waiting for the session", async () => {
    // The wait used to be unconditional and sat on the critical path of EVERY
    // play: up to PLAYBACK_SESSION_WAIT_MS before hls.js was so much as
    // imported. A public video's session carries no credential and re-states the
    // manifest the detail already gave us, so there is nothing here to wait for.
    vi.spyOn(api, "createVideoPlaybackSession").mockReturnValue(new Promise(() => {}));
    const videoRef = { current: document.createElement("video") };
    const { result } = renderHook(() => useHlsPlayback(videoRef, VIDEO, null));

    await waitFor(() => expect(hlsMock.instances).toHaveLength(1));
    expect(hlsMock.instances[0].source).toBe("http://localhost:8080/detail/master.m3u8");
    expect(result.current.mode).toBe("hls-js");
    // And nothing was credentialed on the way — the whole reason the token is
    // conditional.
    expect(hlsMock.instances[0].config.xhrSetup).toBeUndefined();
  });

  it("waits for the session on a password video rather than starting uncredentialed", async () => {
    // The one case where the session carries something playback cannot begin
    // without: the `?pt=` that opens the master, the variants and every segment
    // — and which, on native HLS, has to be in the URL before the media element
    // is pointed anywhere at all.
    const LOCKED = { ...VIDEO, privacy: "password" };
    let release: (session: PlaybackSession) => void = () => {};
    vi.spyOn(api, "createVideoPlaybackSession").mockReturnValue(
      new Promise<PlaybackSession>((resolve) => {
        release = resolve;
      }),
    );
    const videoRef = { current: document.createElement("video") };
    const { result } = renderHook(() => useHlsPlayback(videoRef, LOCKED, null));

    // Nothing picked, nothing loaded, no progressive fallback started.
    expect(result.current.mode).toBeNull();
    expect(result.current.src).toBeUndefined();
    expect(hlsMock.instances).toHaveLength(0);

    await act(async () => {
      release({
        session_id: "22222222-2222-2222-2222-222222222222",
        video_id: "video-1",
        packaging_format: "cmaf",
        hls_url: "/session/master.m3u8",
      });
    });
    await waitFor(() => expect(hlsMock.instances).toHaveLength(1));
    expect(hlsMock.instances[0].source).toBe("http://localhost:8080/session/master.m3u8");
  });

  it("falls back to the detail when no session arrived — playback is never blocked", async () => {
    sessionMock.video = null; // the endpoint is unreachable / refuses
    const videoRef = { current: document.createElement("video") };
    const { result } = renderHook(() => useHlsPlayback(videoRef, VIDEO, null));

    await waitFor(() => expect(hlsMock.instances).toHaveLength(1));
    expect(hlsMock.instances[0].source).toBe("http://localhost:8080/detail/master.m3u8");
    expect(result.current.mode).toBe("hls-js");
  });

  it("attaches NO credential when the session issued none", async () => {
    // The constraint that protects delivery: any `?pt=` or Authorization header
    // marks a media request credentialed, which forces no-store and blocks every
    // CDN/presign redirect. A public video must carry neither.
    const canPlayType = vi
      .spyOn(HTMLMediaElement.prototype, "canPlayType")
      .mockReturnValue("maybe");
    Reflect.deleteProperty(window, "MediaSource");
    const videoRef = { current: document.createElement("video") };
    const { result } = renderHook(() => useHlsPlayback(videoRef, VIDEO, null));

    await waitFor(() => expect(result.current.mode).toBe("native-hls"));
    expect(result.current.src).not.toContain("pt=");
    canPlayType.mockRestore();

    Object.defineProperty(window, "MediaSource", {
      configurable: true,
      value: class MediaSource {},
    });
    cleanup();
    const second = { current: document.createElement("video") };
    renderHook(() => useHlsPlayback(second, VIDEO, null));
    await waitFor(() => expect(hlsMock.instances.length).toBeGreaterThan(0));
    expect(hlsMock.instances.at(-1)!.config.xhrSetup).toBeUndefined();
  });

  it("uses the session's token where the server issued one, over the unlock token", async () => {
    // Both open the video's bytes; only the session's has this session's id
    // signed into it, which is what lets the beacon be attested.
    sessionMock.video = { ...sessionMock.video, playback_token: "pt-session", expires_in: 21_600 };
    const videoRef = { current: document.createElement("video") };
    renderHook(() => useHlsPlayback(videoRef, VIDEO, null, null, "pt-unlock"));

    await waitFor(() => expect(hlsMock.instances).toHaveLength(1));
    const xhrSetup = hlsMock.instances[0].config.xhrSetup as (xhr: {
      setRequestHeader: (k: string, v: string) => void;
    }) => void;
    const headers: Record<string, string> = {};
    xhrSetup({ setRequestHeader: (k, v) => void (headers[k] = v) });
    expect(headers.Authorization).toBe("Bearer pt-session");
  });

  it("surfaces dash_url without letting it touch engine selection", async () => {
    // There is no DASH engine (item 3c is unbuilt). The manifest is carried, not
    // consumed — hls.js still plays the HLS master off the same CMAF segments.
    sessionMock.video = {
      ...sessionMock.video,
      packaging_format: "cmaf",
      dash_url: "/api/v1/videos/video-1/hls/cmaf/stream.mpd",
    };
    const videoRef = { current: document.createElement("video") };
    const { result } = renderHook(() => useHlsPlayback(videoRef, VIDEO, null));

    await waitFor(() =>
      expect(result.current.dashUrl).toBe("/api/v1/videos/video-1/hls/cmaf/stream.mpd"),
    );
    expect(result.current.mode).toBe("hls-js");
    expect(hlsMock.instances.at(-1)!.source).toBe("http://localhost:8080/master.m3u8");
  });

  it("gives a private live stream its `?pt=` and its Bearer header, and a public one neither", async () => {
    sessionMock.live = { ...sessionMock.live, playback_token: "pt-live", expires_in: 21_600 };
    const videoRef = { current: document.createElement("video") };
    renderHook(() => useLivePlayback(videoRef, "live-1"));

    await waitFor(() => expect(hlsMock.instances).toHaveLength(1));
    // hls.js requests the master itself and carries the token as a header; the
    // media element cannot set one, so its URL carries `?pt=` (the API rewrites
    // the rolling playlist's segment URIs to keep it).
    expect(hlsMock.instances[0].source).toContain("pt=pt-live");
    expect(hlsMock.instances[0].config.xhrSetup).toBeDefined();

    cleanup();
    hlsMock.instances.length = 0;
    sessionMock.live = {
      session_id: "44444444-4444-4444-4444-444444444444",
      packaging_format: "hls-ts",
    };
    const publicRef = { current: document.createElement("video") };
    renderHook(() => useLivePlayback(publicRef, "live-2"));
    await waitFor(() => expect(hlsMock.instances).toHaveLength(1));
    expect(hlsMock.instances[0].source).not.toContain("pt=");
    expect(hlsMock.instances[0].config.xhrSetup).toBeUndefined();
  });

  it("does not call the live player failed while its session is still in flight", async () => {
    vi.spyOn(api, "createLivePlaybackSession").mockReturnValue(new Promise(() => {}));
    const videoRef = { current: document.createElement("video") };
    const { result } = renderHook(() => useLivePlayback(videoRef, "live-1"));
    // mode is null because nothing has been tried yet — that is not a dead feed,
    // and flashing "Can't play this live stream" over it would be a lie.
    expect(result.current.mode).toBeNull();
    expect(result.current.failed).toBe(false);
  });
});

// Phase-4 item 4: the adapter is the single capture point, so one set of
// assertions covers every surface.
describe("quality telemetry", () => {
  const VIDEO = { id: "video-1", hls_url: "/master.m3u8" };

  /** Drive the element far enough to produce a first frame, then drain the queue. */
  const firstFrame = async (el: HTMLVideoElement) => {
    await act(async () => {
      el.dispatchEvent(new Event("loadeddata"));
    });
    flushPlaybackEvents();
  };

  it("measures TTFF once, keyed on the session, and reports where the bytes came from", async () => {
    const videoRef = { current: document.createElement("video") };
    renderHook(() => useHlsPlayback(videoRef, VIDEO, null));
    await waitFor(() => expect(hlsMock.instances).toHaveLength(1));
    const hls = hlsMock.instances[0];
    hls.levels = [{ height: 480 }, { height: 720 }];
    act(() => hls.emit("manifestParsed"));
    act(() => hls.emit("levelSwitched", { level: 1 }));
    // A fragment that was REDIRECTED to a CDN. The client reports the final URL
    // and nothing else — the server maps that origin onto its own vocabulary.
    act(() =>
      hls.emit("fragLoaded", {
        networkDetails: { responseURL: "https://cdn.example.test/o/seg_1.ts?sig=xyz" },
      }),
    );

    await firstFrame(videoRef.current);
    expect(beaconed).toHaveLength(1);
    expect(beaconed[0]).toMatchObject({
      type: "playback.start",
      video_id: "video-1",
      session_id: "22222222-2222-2222-2222-222222222222",
      engine: "hls-js",
      packaging_format: "hls-ts",
      rendition_height: 720,
      source_url: "https://cdn.example.test/o/seg_1.ts",
    });
    expect(beaconed[0].ttff_ms).toBeGreaterThanOrEqual(0);
    // No delivery source is named by the client, ever.
    expect(JSON.stringify(beaconed[0])).not.toContain("delivery_source");

    // A second first-frame event does not produce a second start.
    await firstFrame(videoRef.current);
    expect(beaconed).toHaveLength(1);
  });

  it("still reports TTFF when the first frame beats the session it is keyed on", async () => {
    // Public playback no longer waits for its session, so on a warm path the
    // first frame can land first. A start event cannot be taken again later, so
    // it is HELD until there is a subject to key it on — and the number kept is
    // the one measured at the frame, because TTFF is what the viewer waited and
    // the session arriving afterwards did not change that.
    let release: (session: PlaybackSession) => void = () => {};
    vi.spyOn(api, "createVideoPlaybackSession").mockReturnValue(
      new Promise<PlaybackSession>((resolve) => {
        release = resolve;
      }),
    );
    const videoRef = { current: document.createElement("video") };
    renderHook(() => useHlsPlayback(videoRef, VIDEO, null));
    await waitFor(() => expect(hlsMock.instances).toHaveLength(1));

    await firstFrame(videoRef.current);
    // Nothing is invented while there is no session: an unkeyed measurement is
    // not sent with a fabricated subject.
    expect(beaconed).toHaveLength(0);

    await act(async () => {
      release({
        session_id: "22222222-2222-2222-2222-222222222222",
        video_id: "video-1",
        packaging_format: "hls-ts",
        hls_url: "/master.m3u8",
      });
    });
    flushPlaybackEvents();
    expect(beaconed).toHaveLength(1);
    expect(beaconed[0]).toMatchObject({
      type: "playback.start",
      video_id: "video-1",
      session_id: "22222222-2222-2222-2222-222222222222",
      engine: "hls-js",
    });
    expect(beaconed[0].ttff_ms).toBeGreaterThanOrEqual(0);

    // And the release does not re-open the measurement: a later frame is still
    // not a second start.
    await firstFrame(videoRef.current);
    expect(beaconed).toHaveLength(1);
  });

  it("reports rendition as unknowable on native HLS rather than as a null or a guess", async () => {
    Reflect.deleteProperty(window, "MediaSource");
    const canPlayType = vi
      .spyOn(HTMLMediaElement.prototype, "canPlayType")
      .mockReturnValue("maybe");
    const el = document.createElement("video");
    // The element knows its decoded height — and it is STILL not the rung the
    // browser selected, so it must not be reported as one.
    Object.defineProperty(el, "videoHeight", { configurable: true, value: 1080 });
    const videoRef = { current: el };
    const { result } = renderHook(() => useHlsPlayback(videoRef, VIDEO, null));
    await waitFor(() => expect(result.current.mode).toBe("native-hls"));

    await firstFrame(el);
    expect(beaconed).toHaveLength(1);
    expect(beaconed[0].engine).toBe("native-hls");
    expect("rendition_height" in beaconed[0]).toBe(false);
    expect(JSON.stringify(beaconed[0])).not.toContain("rendition_height");
    canPlayType.mockRestore();
  });

  it("counts a rung CHANGE as a switch, and the opening pick as none", async () => {
    const videoRef = { current: document.createElement("video") };
    renderHook(() => useHlsPlayback(videoRef, VIDEO, null));
    await waitFor(() => expect(hlsMock.instances).toHaveLength(1));
    const hls = hlsMock.instances[0];
    hls.levels = [{ height: 480 }, { height: 720 }];
    act(() => hls.emit("manifestParsed"));

    act(() => hls.emit("levelSwitched", { level: 0 })); // the opening pick
    flushPlaybackEvents();
    expect(beaconed).toHaveLength(0);

    act(() => hls.emit("levelSwitched", { level: 1 })); // ABR moved up
    act(() => hls.emit("levelSwitched", { level: 1 })); // ...and stayed there
    flushPlaybackEvents();
    expect(beaconed).toHaveLength(1);
    expect(beaconed[0]).toMatchObject({
      type: "playback.bitrate_switch",
      rendition_height: 720,
      metadata: { switch_count: 1 },
    });
  });

  it("classifies a fatal engine error, and measures a rebuffer that ended", async () => {
    const el = document.createElement("video");
    const videoRef = { current: el };
    renderHook(() => useHlsPlayback(videoRef, VIDEO, null));
    await waitFor(() => expect(hlsMock.instances).toHaveLength(1));
    const hls = hlsMock.instances[0];
    hls.levels = [{ height: 720 }];
    act(() => hls.emit("manifestParsed"));
    await firstFrame(el);
    beaconed = [];

    act(() => hls.emit("error", { fatal: true, type: "networkError", details: "fragLoadError" }));
    await act(async () => {
      el.dispatchEvent(new Event("waiting"));
    });
    await new Promise((resolve) => setTimeout(resolve, 160));
    await act(async () => {
      el.dispatchEvent(new Event("playing"));
    });
    flushPlaybackEvents();

    expect(beaconed.map((e) => e.type)).toEqual(["playback.error", "playback.rebuffer"]);
    expect(beaconed[0].error_class).toBe("network");
    expect(beaconed[1].rebuffer_ms).toBeGreaterThanOrEqual(150);
    expect(beaconed[1].metadata).toMatchObject({ trigger: "playback" });
  });

  it("measures nothing without a session — the beacon is keyed by one", async () => {
    sessionMock.video = null;
    const videoRef = { current: document.createElement("video") };
    const { result } = renderHook(() => useHlsPlayback(videoRef, VIDEO, null));
    await waitFor(() => expect(result.current.mode).toBe("hls-js"));

    await firstFrame(videoRef.current);
    expect(beaconed).toHaveLength(0);
  });

  it("measures nothing for LIVE or FEDERATED playback", async () => {
    // Live: the ingest endpoint requires a video_id and a live session has none.
    // Federated: this instance neither brokers nor delivers those bytes.
    const liveRef = { current: document.createElement("video") };
    renderHook(() => useLivePlayback(liveRef, "live-1"));
    await waitFor(() => expect(hlsMock.instances).toHaveLength(1));
    await firstFrame(liveRef.current);
    expect(beaconed).toHaveLength(0);

    cleanup();
    const remoteRef = { current: document.createElement("video") };
    renderHook(() =>
      useRemotePlayback(remoteRef, {
        id: "remote-1",
        stream_url: "https://origin.example/v/master.m3u8",
      }),
    );
    await firstFrame(remoteRef.current);
    expect(beaconed).toHaveLength(0);
  });
});
