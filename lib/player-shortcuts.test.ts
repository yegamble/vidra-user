import { describe, expect, it } from "vitest";

import {
  FRAME_STEP_SECONDS,
  clampSeekTarget,
  seekTargetForFraction,
  shortcutForKey,
} from "./player-shortcuts";

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

  it("maps T/I (either case) to theater and picture-in-picture", () => {
    expect(shortcutForKey({ key: "t" })).toEqual({ kind: "toggle-theater" });
    expect(shortcutForKey({ key: "T" })).toEqual({ kind: "toggle-theater" });
    expect(shortcutForKey({ key: "i" })).toEqual({ kind: "toggle-pip" });
    expect(shortcutForKey({ key: "I" })).toEqual({ kind: "toggle-pip" });
  });

  it("maps < / > to a speed-ladder step (Shift is a legitimate modifier for these glyphs)", () => {
    expect(shortcutForKey({ key: "<" })).toEqual({ kind: "speed-step", direction: -1 });
    expect(shortcutForKey({ key: ">" })).toEqual({ kind: "speed-step", direction: 1 });
    // Shift on its own never disqualifies (< and > require it); ctrl/meta/alt do.
    expect(shortcutForKey({ key: ">", metaKey: true })).toBeNull();
  });

  it("maps the number keys 0–9 to decile seeks", () => {
    expect(shortcutForKey({ key: "0" })).toEqual({ kind: "seek-to-fraction", fraction: 0 });
    expect(shortcutForKey({ key: "5" })).toEqual({ kind: "seek-to-fraction", fraction: 0.5 });
    expect(shortcutForKey({ key: "9" })).toEqual({ kind: "seek-to-fraction", fraction: 0.9 });
  });

  it("maps Home/End to the timeline ends", () => {
    expect(shortcutForKey({ key: "Home" })).toEqual({ kind: "seek-to-fraction", fraction: 0 });
    expect(shortcutForKey({ key: "End" })).toEqual({ kind: "seek-to-fraction", fraction: 1 });
  });

  it("scopes ArrowUp/Down volume to a focused player (page scroll wins otherwise)", () => {
    expect(shortcutForKey({ key: "ArrowUp" }, { playerFocused: true })).toEqual({
      kind: "volume-by",
      deltaPercent: 5,
    });
    expect(shortcutForKey({ key: "ArrowDown" }, { playerFocused: true })).toEqual({
      kind: "volume-by",
      deltaPercent: -5,
    });
    // Not focused → the arrows are not shortcuts (the page keeps its scroll).
    expect(shortcutForKey({ key: "ArrowUp" })).toBeNull();
    expect(shortcutForKey({ key: "ArrowDown" }, { playerFocused: false })).toBeNull();
  });

  it("gates , / . frame-stepping on the paused state", () => {
    expect(shortcutForKey({ key: "," }, { paused: true })).toEqual({
      kind: "frame-step",
      seconds: -FRAME_STEP_SECONDS,
    });
    expect(shortcutForKey({ key: "." }, { paused: true })).toEqual({
      kind: "frame-step",
      seconds: FRAME_STEP_SECONDS,
    });
    // While playing, a frame-step is a no-op (and never a shortcut).
    expect(shortcutForKey({ key: "," })).toBeNull();
    expect(shortcutForKey({ key: "." }, { paused: false })).toBeNull();
  });

  it("ignores modified presses and unmapped keys", () => {
    expect(shortcutForKey({ key: "k", ctrlKey: true })).toBeNull();
    expect(shortcutForKey({ key: "m", metaKey: true })).toBeNull();
    expect(shortcutForKey({ key: "f", altKey: true })).toBeNull();
    expect(shortcutForKey({ key: "t", ctrlKey: true })).toBeNull();
    expect(shortcutForKey({ key: "5", metaKey: true })).toBeNull();
    expect(shortcutForKey({ key: "x" })).toBeNull();
    expect(shortcutForKey({ key: "Escape" })).toBeNull();
    // A shifted digit produces a symbol, not a decile seek.
    expect(shortcutForKey({ key: "%" })).toBeNull();
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

describe("seekTargetForFraction", () => {
  it("maps a 0..1 timeline fraction to an absolute time", () => {
    expect(seekTargetForFraction(0, 120)).toBe(0);
    expect(seekTargetForFraction(0.5, 120)).toBe(60);
    expect(seekTargetForFraction(1, 120)).toBe(120);
  });

  it("clamps out-of-range fractions to the ends", () => {
    expect(seekTargetForFraction(-1, 120)).toBe(0);
    expect(seekTargetForFraction(2, 120)).toBe(120);
  });

  it("returns null when the duration is unknown (leave currentTime untouched)", () => {
    expect(seekTargetForFraction(0.5, NaN)).toBeNull();
    expect(seekTargetForFraction(0.5, 0)).toBeNull();
    expect(seekTargetForFraction(0.5, Infinity)).toBeNull();
  });
});
