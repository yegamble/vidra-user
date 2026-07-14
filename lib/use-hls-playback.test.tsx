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
    autoLevelCapping: number;
    bandwidthEstimate: number;
    destroyed: boolean;
    source: string | null;
    levels: Array<{ height: number }>;
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
    autoLevelCapping = -1;
    bandwidthEstimate = 7_500_000;
    destroyed = false;
    source: string | null = null;
    levels: Array<{ height: number }> = [];
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

    act(() => result.current.setLevel(2));
    expect(hlsMock.instances[0].nextLevel).toBe(2);
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

    act(() => result.current.setLevel(1));
    expect(hlsMock.instances[0].nextLevel).toBe(1);
    expect(hlsMock.instances[0].currentLevel).toBe(-1);
  });
});
