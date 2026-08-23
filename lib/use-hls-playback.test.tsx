// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useHlsPlayback } from "./use-hls-playback";
import { useLivePlayback } from "./use-live-playback";

const hlsMock = vi.hoisted(() => ({
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
      ERROR: "error",
    };
    static ErrorTypes = { NETWORK_ERROR: "networkError", MEDIA_ERROR: "mediaError" };
    static isSupported() {
      return true;
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

beforeEach(() => {
  hlsMock.instances.length = 0;
  localStorage.clear();
  Reflect.deleteProperty(navigator, "connection");
  Object.defineProperty(window, "MediaSource", {
    configurable: true,
    value: class MediaSource {},
  });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "MediaSource");
});

describe("hls.js playback tuning", () => {
  it("bounds the VOD back-buffer and caps ABR to player/decode capacity", async () => {
    const videoRef = { current: document.createElement("video") };
    const { result } = renderHook(() =>
      useHlsPlayback(
        videoRef,
        { id: "video-1", hls_url: "/master.m3u8?v=generation-1" },
        12,
      ),
    );

    await waitFor(() => expect(hlsMock.instances).toHaveLength(1));
    expect(hlsMock.instances[0].config).toMatchObject({
      startPosition: 12,
      backBufferLength: 90,
      capLevelToPlayerSize: true,
      capLevelOnFPSDrop: true,
      abrEwmaDefaultEstimate: 5_000_000,
    });
    expect(hlsMock.instances[0].source).toBe(
      "http://localhost:8080/master.m3u8?v=generation-1",
    );

    // A pick made from the parsed menu is an engine-neutral id; the adapter is
    // the only thing that turns it back into an hls.js level index.
    const hls = hlsMock.instances[0];
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

    expect(result.current.mode).toBe("native-hls");
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
    expect(hls.config.abrEwmaDefaultEstimate).toBe(5_000_000);
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
