import { describe, expect, it } from "vitest";

import { clampSeekTarget, shortcutForKey } from "./player-shortcuts";

describe("shortcutForKey", () => {
  it("maps space and K to play-pause", () => {
    expect(shortcutForKey({ key: " " })).toEqual({ kind: "toggle-play" });
    expect(shortcutForKey({ key: "k" })).toEqual({ kind: "toggle-play" });
    expect(shortcutForKey({ key: "K" })).toEqual({ kind: "toggle-play" });
  });

  it("maps J/L to ±10s and arrows to ±5s", () => {
    expect(shortcutForKey({ key: "j" })).toEqual({ kind: "seek-by", seconds: -10 });
    expect(shortcutForKey({ key: "l" })).toEqual({ kind: "seek-by", seconds: 10 });
    expect(shortcutForKey({ key: "ArrowLeft" })).toEqual({ kind: "seek-by", seconds: -5 });
    expect(shortcutForKey({ key: "ArrowRight" })).toEqual({ kind: "seek-by", seconds: 5 });
  });

  it("maps M/F/C to mute, fullscreen, and captions", () => {
    expect(shortcutForKey({ key: "m" })).toEqual({ kind: "toggle-mute" });
    expect(shortcutForKey({ key: "f" })).toEqual({ kind: "toggle-fullscreen" });
    expect(shortcutForKey({ key: "c" })).toEqual({ kind: "toggle-captions" });
  });

  it("ignores modified presses and unmapped keys", () => {
    expect(shortcutForKey({ key: "k", ctrlKey: true })).toBeNull();
    expect(shortcutForKey({ key: "m", metaKey: true })).toBeNull();
    expect(shortcutForKey({ key: "f", altKey: true })).toBeNull();
    expect(shortcutForKey({ key: "x" })).toBeNull();
    expect(shortcutForKey({ key: "Escape" })).toBeNull();
  });
});

describe("clampSeekTarget", () => {
  it("seeks relatively within [0, duration]", () => {
    expect(clampSeekTarget(30, 10, 120)).toBe(40);
    expect(clampSeekTarget(30, -10, 120)).toBe(20);
  });

  it("clamps at the start and the end", () => {
    expect(clampSeekTarget(3, -10, 120)).toBe(0);
    expect(clampSeekTarget(115, 10, 120)).toBe(120);
  });

  it("only clamps the lower bound when the duration is unknown", () => {
    expect(clampSeekTarget(3, -10, NaN)).toBe(0);
    expect(clampSeekTarget(3, 10, NaN)).toBe(13);
    expect(clampSeekTarget(3, 10, Infinity)).toBe(13);
  });
});
