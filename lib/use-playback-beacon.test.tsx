// @vitest-environment jsdom
import { renderHook, act, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ recordPlaybackBeacon: vi.fn() }));
vi.mock("@/lib/api", () => ({
  api: { recordPlaybackBeacon: mocks.recordPlaybackBeacon },
}));

import { usePlaybackBeacon } from "@/lib/use-playback-beacon";

let lastRef: { current: HTMLVideoElement | null };

describe("usePlaybackBeacon", () => {
  afterEach(cleanup);
  beforeEach(() =>
    mocks.recordPlaybackBeacon.mockReset().mockResolvedValue(undefined),
  );

  function setup() {
    const el = { currentTime: 0 } as HTMLVideoElement;
    const ref = { current: el };
    lastRef = ref;
    const hook = renderHook(() => usePlaybackBeacon("v1", ref));
    return { el, hook };
  }

  it("sends a sample after 10 s of continuous playback, marked started once", () => {
    const { el, hook } = setup();
    act(() => hook.result.current.onPlay());
    for (let t = 1; t <= 21; t++) {
      el.currentTime = t;
      act(() => hook.result.current.onTimeUpdate());
    }
    expect(mocks.recordPlaybackBeacon).toHaveBeenCalledTimes(2);
    expect(mocks.recordPlaybackBeacon.mock.calls[0].slice(0, 2)).toEqual([
      "v1",
      { position_seconds: 10, watched_seconds: 10, started: true },
    ]);
    expect(mocks.recordPlaybackBeacon.mock.calls[1][1].started).toBe(false);
  });

  it("does not count a seek as watch time", () => {
    const { el, hook } = setup();
    act(() => hook.result.current.onPlay());
    el.currentTime = 600;
    act(() => hook.result.current.onTimeUpdate());
    act(() => hook.result.current.onPause());
    // Nothing watched, but the play itself is reported once.
    expect(mocks.recordPlaybackBeacon.mock.calls[0].slice(0, 2)).toEqual([
      "v1",
      { position_seconds: 600, watched_seconds: 0, started: true },
    ]);
  });

  it("flushes the partial sample on pause and sends only anonymous fields", () => {
    const { el, hook } = setup();
    act(() => hook.result.current.onPlay());
    for (let t = 1; t <= 4; t++) {
      el.currentTime = t;
      act(() => hook.result.current.onTimeUpdate());
    }
    act(() => hook.result.current.onPause());
    const [, body] = mocks.recordPlaybackBeacon.mock.calls[0];
    expect(Object.keys(body).sort()).toEqual([
      "position_seconds",
      "started",
      "watched_seconds",
    ]);
    expect(body.watched_seconds).toBe(4);
  });

  it("flushes on unmount with keepalive even though the element ref is already null", () => {
    const { el, hook } = setup();
    act(() => hook.result.current.onPlay());
    for (let t = 1; t <= 4; t++) {
      el.currentTime = t;
      act(() => hook.result.current.onTimeUpdate());
    }
    // React clears refs before running unmount cleanups.
    lastRef.current = null;
    hook.unmount();
    expect(mocks.recordPlaybackBeacon).toHaveBeenCalledWith(
      "v1",
      { position_seconds: 4, watched_seconds: 4, started: true },
      { keepalive: true },
    );
  });

  it("does not report a play that never started", () => {
    const { hook } = setup();
    hook.unmount();
    expect(mocks.recordPlaybackBeacon).not.toHaveBeenCalled();
  });

  it("flushes with keepalive when the tab is hidden and on pagehide", () => {
    const { el, hook } = setup();
    act(() => hook.result.current.onPlay());
    el.currentTime = 1;
    act(() => hook.result.current.onTimeUpdate());
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(mocks.recordPlaybackBeacon).toHaveBeenCalledTimes(1);
    expect(mocks.recordPlaybackBeacon.mock.calls[0][2]).toEqual({
      keepalive: true,
    });
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });

    el.currentTime = 2;
    act(() => hook.result.current.onPlay());
    el.currentTime = 3;
    act(() => hook.result.current.onTimeUpdate());
    window.dispatchEvent(new Event("pagehide"));
    expect(mocks.recordPlaybackBeacon).toHaveBeenCalledTimes(2);
    expect(mocks.recordPlaybackBeacon.mock.calls[1][2]).toEqual({
      keepalive: true,
    });
  });

  it("never claims more than 12 s in one sample", () => {
    const { el, hook } = setup();
    act(() => hook.result.current.onPlay());
    for (let t = 1; t <= 10; t++) {
      el.currentTime = t;
      act(() => hook.result.current.onTimeUpdate());
    }
    for (const [, body] of mocks.recordPlaybackBeacon.mock.calls) {
      expect(body.watched_seconds).toBeLessThanOrEqual(12);
    }
  });
});
