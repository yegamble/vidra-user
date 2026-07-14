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
    destroyed: boolean;
  }>,
}));

vi.mock("hls.js", () => {
  class MockHls {
    static Events = {
      MANIFEST_PARSED: "manifestParsed",
      LEVEL_SWITCHED: "levelSwitched",
      ERROR: "error",
    };
    static ErrorTypes = { NETWORK_ERROR: "networkError", MEDIA_ERROR: "mediaError" };
    static isSupported() {
      return true;
    }

    config: Record<string, unknown>;
    currentLevel = -1;
    nextLevel = -1;
    destroyed = false;
    levels: Array<{ height: number }> = [];

    constructor(config: Record<string, unknown> = {}) {
      this.config = config;
      hlsMock.instances.push(this);
    }

    on(event: string, handler: (...args: unknown[]) => void) {
      void event;
      void handler;
    }
    loadSource(source: string) {
      void source;
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
      useHlsPlayback(videoRef, { id: "video-1", hls_url: "/master.m3u8" }, 12),
    );

    await waitFor(() => expect(hlsMock.instances).toHaveLength(1));
    expect(hlsMock.instances[0].config).toMatchObject({
      startPosition: 12,
      backBufferLength: 90,
      capLevelToPlayerSize: true,
      capLevelOnFPSDrop: true,
    });

    act(() => result.current.setLevel(2));
    expect(hlsMock.instances[0].nextLevel).toBe(2);
  });

  it("uses the shorter live buffer and switches quality without a hard flush", async () => {
    const videoRef = { current: document.createElement("video") };
    const { result } = renderHook(() => useLivePlayback(videoRef, "live-1"));

    await waitFor(() => expect(hlsMock.instances).toHaveLength(1));
    expect(hlsMock.instances[0].config).toMatchObject({
      backBufferLength: 30,
      capLevelToPlayerSize: true,
      capLevelOnFPSDrop: true,
    });

    act(() => result.current.setLevel(1));
    expect(hlsMock.instances[0].nextLevel).toBe(1);
    expect(hlsMock.instances[0].currentLevel).toBe(-1);
  });
});
