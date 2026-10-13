// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ recordPlaybackBeacon: vi.fn() }));
vi.mock("@/lib/api", () => ({
  api: { recordPlaybackBeacon: mocks.recordPlaybackBeacon },
}));

import { usePlaybackBeacon } from "@/lib/use-playback-beacon";

describe("usePlaybackBeacon", () => {
  beforeEach(() =>
    mocks.recordPlaybackBeacon.mockReset().mockResolvedValue(undefined),
  );

  function setup() {
    const el = { currentTime: 0 } as HTMLVideoElement;
    const ref = { current: el };
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
    expect(mocks.recordPlaybackBeacon.mock.calls[0]).toEqual([
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
    expect(mocks.recordPlaybackBeacon).toHaveBeenCalledWith("v1", {
      position_seconds: 600,
      watched_seconds: 0,
      started: true,
    });
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
});
