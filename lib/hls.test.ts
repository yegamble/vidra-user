import { describe, expect, it } from "vitest";

import {
  AUTO_LEVEL,
  buildLevelMenu,
  canPlayNativeHls,
  choosePlaybackMode,
  qualityLabel,
  type LevelOption,
} from "./hls";

describe("choosePlaybackMode", () => {
  it("plays the original when the detail carries no hls_url", () => {
    expect(choosePlaybackMode({ hasHls: false, mseSupported: true, nativeHls: true })).toBe(
      "original",
    );
  });

  it("prefers hls.js (MSE) whenever it is available — it is the only quality-selectable path", () => {
    expect(choosePlaybackMode({ hasHls: true, mseSupported: true, nativeHls: false })).toBe(
      "hls-js",
    );
    // Even where the browser ALSO claims native HLS (Safari desktop, some
    // Chromium builds), hls.js wins so the quality menu works.
    expect(choosePlaybackMode({ hasHls: true, mseSupported: true, nativeHls: true })).toBe(
      "hls-js",
    );
  });

  it("falls back to native HLS without MSE (iOS Safari)", () => {
    expect(choosePlaybackMode({ hasHls: true, mseSupported: false, nativeHls: true })).toBe(
      "native-hls",
    );
  });

  it("falls back to the original with no HLS capability at all", () => {
    expect(choosePlaybackMode({ hasHls: true, mseSupported: false, nativeHls: false })).toBe(
      "original",
    );
  });
});

describe("canPlayNativeHls", () => {
  it("is true for maybe/probably and false for the empty string", () => {
    expect(canPlayNativeHls({ canPlayType: () => "maybe" })).toBe(true);
    expect(canPlayNativeHls({ canPlayType: () => "probably" })).toBe(true);
    expect(canPlayNativeHls({ canPlayType: () => "" })).toBe(false);
  });

  it("asks about the Apple HLS MIME type", () => {
    let asked = "";
    canPlayNativeHls({
      canPlayType: (t) => {
        asked = t;
        return "";
      },
    });
    expect(asked).toBe("application/vnd.apple.mpegurl");
  });
});

describe("buildLevelMenu", () => {
  it("returns Auto plus one entry per height, tallest first, keeping level indices", () => {
    // hls.js orders levels by ascending bitrate: 480p is index 0, 720p index 1.
    expect(buildLevelMenu([{ height: 480 }, { height: 720 }])).toEqual([
      { level: AUTO_LEVEL, label: "Auto" },
      { level: 1, label: "720p" },
      { level: 0, label: "480p" },
    ]);
  });

  it("dedupes duplicate heights keeping the later (higher-bitrate) level", () => {
    expect(buildLevelMenu([{ height: 720 }, { height: 720 }])).toEqual([
      { level: AUTO_LEVEL, label: "Auto" },
      { level: 1, label: "720p" },
    ]);
  });

  it("skips levels without a usable height", () => {
    expect(buildLevelMenu([{}, { height: 0 }, { height: 240 }])).toEqual([
      { level: AUTO_LEVEL, label: "Auto" },
      { level: 2, label: "240p" },
    ]);
  });

  it("yields an empty menu (no selector) when no level has a height", () => {
    expect(buildLevelMenu([])).toEqual([]);
    expect(buildLevelMenu([{}])).toEqual([]);
  });
});

describe("qualityLabel", () => {
  const LEVELS: LevelOption[] = [
    { level: AUTO_LEVEL, label: "Auto" },
    { level: 2, label: "1080p" },
    { level: 1, label: "720p" },
    { level: 0, label: "480p" },
  ];

  it("reads 'Auto' on the adaptive selection with no known active rung", () => {
    expect(
      qualityLabel({ levels: LEVELS, selected: AUTO_LEVEL, activeHeight: null, pending: false }),
    ).toBe("Auto");
  });

  it("reads 'Auto (Np)' once the active ABR rung height is known", () => {
    expect(
      qualityLabel({ levels: LEVELS, selected: AUTO_LEVEL, activeHeight: 720, pending: false }),
    ).toBe("Auto (720p)");
  });

  it("shows the pinned rung once the switch is confirmed", () => {
    expect(
      qualityLabel({ levels: LEVELS, selected: 1, activeHeight: 720, pending: false }),
    ).toBe("720p");
  });

  it("shows the target rung with a busy ellipsis while a manual switch is pending", () => {
    expect(qualityLabel({ levels: LEVELS, selected: 0, activeHeight: 720, pending: true })).toBe(
      "480p…",
    );
  });

  it("ignores a pending flag on Auto (ABR is never 'busy')", () => {
    expect(
      qualityLabel({ levels: LEVELS, selected: AUTO_LEVEL, activeHeight: 480, pending: true }),
    ).toBe("Auto (480p)");
  });
});
