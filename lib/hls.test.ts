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
    // hls.js sorts levels by height ascending: 480p is index 0, 720p index 1.
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

describe("buildLevelMenu on a multi-codec master", () => {
  const AVC = "avc1,mp4a";
  const AV1 = "av01,mp4a";
  const HEVC = "hvc1,mp4a";
  // The same 3-rung ladder in three codec families, in the order hls.js exposes
  // it: height ascending, then its own codec preference with the PREFERRED codec
  // last (avc1 1 → av01 0.8 → hvc1 0.75). Manifest order is inert.
  const LEVELS = [
    { height: 360, codecSet: AVC }, // 0
    { height: 360, codecSet: AV1 }, // 1
    { height: 360, codecSet: HEVC }, // 2
    { height: 720, codecSet: AVC }, // 3
    { height: 720, codecSet: AV1 }, // 4
    { height: 720, codecSet: HEVC }, // 5
    { height: 1080, codecSet: AVC }, // 6
    { height: 1080, codecSet: AV1 }, // 7
    { height: 1080, codecSet: HEVC }, // 8
  ];

  it("shows one entry per height, all from the active level's codec family", () => {
    // Playing 720p H.264 (index 3): three rungs, all avc1 — not the 9 levels,
    // and not the trailing index at each height.
    expect(buildLevelMenu(LEVELS, 3)).toEqual([
      { level: AUTO_LEVEL, label: "Auto" },
      { level: 6, label: "1080p" },
      { level: 3, label: "720p" },
      { level: 0, label: "360p" },
    ]);
  });

  it("never offers a rung outside the active family (the cross-codec switch bug)", () => {
    // The old height dedupe kept the LAST index at each height, so picking
    // "720p" while H.264 played handed hls.js index 5 (HEVC) — a changeType
    // switch its own ABR would never make.
    const menu = buildLevelMenu(LEVELS, 3);
    expect(menu.find((o) => o.label === "720p")?.level).toBe(3);
    for (const option of menu.filter((o) => o.level !== AUTO_LEVEL)) {
      expect(LEVELS[option.level].codecSet).toBe(AVC);
    }
  });

  it("follows the engine onto whichever family it is playing", () => {
    expect(buildLevelMenu(LEVELS, 5)).toEqual([
      { level: AUTO_LEVEL, label: "Auto" },
      { level: 8, label: "1080p" },
      { level: 5, label: "720p" },
      { level: 2, label: "360p" },
    ]);
    expect(buildLevelMenu(LEVELS, 7)).toEqual([
      { level: AUTO_LEVEL, label: "Auto" },
      { level: 7, label: "1080p" },
      { level: 4, label: "720p" },
      { level: 1, label: "360p" },
    ]);
  });

  it("falls back to the family hls.js prefers when no rung is active yet", () => {
    // No active level (pre-manifest, or a caller that does not track it): hls.js
    // sorts its preferred codec last, so the last level names the family it will
    // settle on — here HEVC.
    const preferred = [
      { level: AUTO_LEVEL, label: "Auto" },
      { level: 8, label: "1080p" },
      { level: 5, label: "720p" },
      { level: 2, label: "360p" },
    ];
    expect(buildLevelMenu(LEVELS)).toEqual(preferred);
    expect(buildLevelMenu(LEVELS, AUTO_LEVEL)).toEqual(preferred);
    expect(buildLevelMenu(LEVELS, 99)).toEqual(preferred);
  });

  it("leaves a single-codec master exactly as it was before (no restriction)", () => {
    const codecless = [{ height: 480 }, { height: 720 }, { height: 720 }];
    const singleCodec = codecless.map((l) => ({ ...l, codecSet: AVC }));
    // One family (or none): every level stays a candidate and the later
    // (higher-bitrate) index still wins the height tie, whatever is playing.
    const expected = [
      { level: AUTO_LEVEL, label: "Auto" },
      { level: 2, label: "720p" },
      { level: 0, label: "480p" },
    ];
    expect(buildLevelMenu(codecless)).toEqual(expected);
    expect(buildLevelMenu(codecless, 1)).toEqual(expected);
    expect(buildLevelMenu(singleCodec)).toEqual(expected);
    expect(buildLevelMenu(singleCodec, 0)).toEqual(expected);
    expect(buildLevelMenu(singleCodec, 2)).toEqual(expected);
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
