import { describe, expect, it } from "vitest";

import {
  buildLevelMenu,
  canPlayNativeHls,
  choosePlaybackMode,
  levelIndexForHeightCap,
  qualityIdOfLevel,
  qualityLabel,
  resolveLevelIndex,
  type LevelOption,
  type MenuLevel,
} from "./hls";
import { AUTO_QUALITY, qualityKey, type QualityId } from "./quality-id";

// A menu row, spelled the way buildLevelMenu spells it, so an expectation reads
// as the identity it asserts rather than as three coupled fields.
function row(id: QualityId | typeof AUTO_QUALITY, label: string): LevelOption {
  return { value: qualityKey(id), id, label };
}

const AUTO_ROW = row(AUTO_QUALITY, "Auto");

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

describe("qualityIdOfLevel", () => {
  it("mints height, codec family and — where the tree names one — the representation", () => {
    expect(
      qualityIdOfLevel({
        height: 720,
        codecSet: "avc1,mp4a",
        uri: "https://cdn.test/v/abc/hls/media_3.m3u8?v=2",
      }),
    ).toEqual({ height: 720, codecFamily: "avc1,mp4a", repId: 3 });
  });

  it("leaves repId absent on the MPEG-TS ladder's uris — nothing may require it", () => {
    expect(
      qualityIdOfLevel({ height: 720, codecSet: "avc1,mp4a", uri: "/v/abc/hls/720p/playlist.m3u8" }),
    ).toEqual({ height: 720, codecFamily: "avc1,mp4a" });
  });

  it("is null for a level with no usable height (audio-only/malformed)", () => {
    expect(qualityIdOfLevel(undefined)).toBeNull();
    expect(qualityIdOfLevel({})).toBeNull();
    expect(qualityIdOfLevel({ height: 0 })).toBeNull();
  });
});

describe("buildLevelMenu", () => {
  it("returns Auto plus one entry per height, tallest first", () => {
    // hls.js sorts levels by height ascending: 480p is index 0, 720p index 1.
    const levels = [{ height: 480 }, { height: 720 }];
    expect(buildLevelMenu(levels)).toEqual([
      AUTO_ROW,
      row({ height: 720 }, "720p"),
      row({ height: 480 }, "480p"),
    ]);
    // …and each entry still resolves back to its own hls.js index.
    expect(resolveLevelIndex(levels, { height: 720 })).toBe(1);
    expect(resolveLevelIndex(levels, { height: 480 })).toBe(0);
  });

  it("dedupes duplicate heights, resolving to the later (higher-bitrate) level", () => {
    const levels = [{ height: 720 }, { height: 720 }];
    expect(buildLevelMenu(levels)).toEqual([AUTO_ROW, row({ height: 720 }, "720p")]);
    expect(resolveLevelIndex(levels, { height: 720 })).toBe(1);
  });

  it("skips levels without a usable height", () => {
    const levels = [{}, { height: 0 }, { height: 240 }];
    expect(buildLevelMenu(levels)).toEqual([AUTO_ROW, row({ height: 240 }, "240p")]);
    expect(resolveLevelIndex(levels, { height: 240 })).toBe(2);
  });

  it("yields an empty menu (no selector) when no level has a height", () => {
    expect(buildLevelMenu([])).toEqual([]);
    expect(buildLevelMenu([{}])).toEqual([]);
  });

  it("keys every entry by its canonical id string — the menu/React key", () => {
    const menu = buildLevelMenu([
      { height: 480, codecSet: "avc1,mp4a", uri: "media_0.m3u8" },
      { height: 1080, codecSet: "avc1,mp4a", uri: "media_1.m3u8" },
    ]);
    expect(menu.map((o) => o.value)).toEqual([
      "auto",
      "1080p|avc1,mp4a|r1",
      "480p|avc1,mp4a|r0",
    ]);
    // The keys are distinct — React would collide otherwise.
    expect(new Set(menu.map((o) => o.value)).size).toBe(menu.length);
  });
});

describe("buildLevelMenu on a multi-codec master", () => {
  const AVC = "avc1,mp4a";
  const AV1 = "av01,mp4a";
  const HEVC = "hvc1,mp4a";
  // The same 3-rung ladder in three codec families, in the order hls.js exposes
  // it: height ascending, then its own codec preference with the PREFERRED codec
  // last (avc1 1 → av01 0.8 → hvc1 0.75). Manifest order is inert.
  const LEVELS: MenuLevel[] = [
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

  const ladder = (codecFamily: string) => [
    AUTO_ROW,
    row({ height: 1080, codecFamily }, "1080p"),
    row({ height: 720, codecFamily }, "720p"),
    row({ height: 360, codecFamily }, "360p"),
  ];

  it("shows one entry per height, all from the active codec family", () => {
    // Playing H.264: three rungs, all avc1 — not the 9 levels, and each resolves
    // back to the avc1 index, not the trailing index at that height.
    expect(buildLevelMenu(LEVELS, AVC)).toEqual(ladder(AVC));
    expect(
      buildLevelMenu(LEVELS, AVC)
        .filter((o) => o.id !== AUTO_QUALITY)
        .map((o) => resolveLevelIndex(LEVELS, o.id as QualityId)),
    ).toEqual([6, 3, 0]);
  });

  it("never offers a rung outside the active family (the cross-codec switch bug)", () => {
    // The old height dedupe kept the LAST index at each height, so picking
    // "720p" while H.264 played handed hls.js index 5 (HEVC) — a changeType
    // switch its own ABR would never make.
    const menu = buildLevelMenu(LEVELS, AVC);
    const at720 = menu.find((o) => o.label === "720p")?.id as QualityId;
    expect(resolveLevelIndex(LEVELS, at720)).toBe(3);
    for (const option of menu.filter((o) => o.id !== AUTO_QUALITY)) {
      expect((option.id as QualityId).codecFamily).toBe(AVC);
      expect(LEVELS[resolveLevelIndex(LEVELS, option.id as QualityId)!].codecSet).toBe(AVC);
    }
  });

  it("follows the engine onto whichever family it is playing", () => {
    expect(buildLevelMenu(LEVELS, HEVC)).toEqual(ladder(HEVC));
    expect(
      buildLevelMenu(LEVELS, HEVC)
        .filter((o) => o.id !== AUTO_QUALITY)
        .map((o) => resolveLevelIndex(LEVELS, o.id as QualityId)),
    ).toEqual([8, 5, 2]);
    expect(buildLevelMenu(LEVELS, AV1)).toEqual(ladder(AV1));
    expect(
      buildLevelMenu(LEVELS, AV1)
        .filter((o) => o.id !== AUTO_QUALITY)
        .map((o) => resolveLevelIndex(LEVELS, o.id as QualityId)),
    ).toEqual([7, 4, 1]);
  });

  it("falls back to the family hls.js prefers when none is active yet", () => {
    // No active family (pre-manifest, ABR has not picked, or a family this
    // master does not carry): hls.js sorts its preferred codec last, so the last
    // level names the family it will settle on — here HEVC.
    expect(buildLevelMenu(LEVELS)).toEqual(ladder(HEVC));
    expect(buildLevelMenu(LEVELS, undefined)).toEqual(ladder(HEVC));
    expect(buildLevelMenu(LEVELS, "vp09,mp4a")).toEqual(ladder(HEVC));
  });

  it("leaves a single-codec master exactly as it was before (no restriction)", () => {
    const codecless = [{ height: 480 }, { height: 720 }, { height: 720 }];
    const singleCodec = codecless.map((l) => ({ ...l, codecSet: AVC }));
    // One family (or none): every level stays a candidate and the later
    // (higher-bitrate) index still wins the height tie, whatever is playing.
    const expected = (codecFamily?: string) => [
      AUTO_ROW,
      row(codecFamily ? { height: 720, codecFamily } : { height: 720 }, "720p"),
      row(codecFamily ? { height: 480, codecFamily } : { height: 480 }, "480p"),
    ];
    expect(buildLevelMenu(codecless)).toEqual(expected());
    expect(buildLevelMenu(codecless, AVC)).toEqual(expected());
    expect(buildLevelMenu(singleCodec)).toEqual(expected(AVC));
    expect(buildLevelMenu(singleCodec, AVC)).toEqual(expected(AVC));
    expect(buildLevelMenu(singleCodec, HEVC)).toEqual(expected(AVC));
    expect(resolveLevelIndex(codecless, { height: 720 })).toBe(2);
    expect(resolveLevelIndex(singleCodec, { height: 720, codecFamily: AVC })).toBe(2);
  });
});

describe("resolveLevelIndex", () => {
  const AVC = "avc1,mp4a";
  const HEVC = "hvc1,mp4a";
  const CMAF: MenuLevel[] = [
    { height: 720, codecSet: AVC, uri: "https://cdn.test/hls/media_0.m3u8" },
    { height: 720, codecSet: HEVC, uri: "https://cdn.test/hls/media_1.m3u8" },
    { height: 1080, codecSet: AVC, uri: "https://cdn.test/hls/media_2.m3u8" },
    { height: 1080, codecSet: HEVC, uri: "https://cdn.test/hls/media_3.m3u8" },
  ];

  it("pins the exact representation when the id carries one", () => {
    expect(resolveLevelIndex(CMAF, { height: 1080, codecFamily: HEVC, repId: 3 })).toBe(3);
    expect(resolveLevelIndex(CMAF, { height: 720, codecFamily: AVC, repId: 0 })).toBe(0);
  });

  it("falls back to height-within-family when the rep no longer matches", () => {
    // A stale rep number (the tree was repacked) must not lose the rung.
    expect(resolveLevelIndex(CMAF, { height: 1080, codecFamily: AVC, repId: 99 })).toBe(2);
  });

  it("never crosses the codec family", () => {
    const avcOnly = CMAF.filter((l) => l.codecSet === AVC);
    expect(resolveLevelIndex(avcOnly, { height: 1080, codecFamily: HEVC })).toBeNull();
  });

  it("is null when this ladder has no such rung", () => {
    expect(resolveLevelIndex(CMAF, { height: 2160, codecFamily: AVC })).toBeNull();
    expect(resolveLevelIndex([], { height: 720 })).toBeNull();
  });
});

describe("levelIndexForHeightCap", () => {
  // hls.js orders height-ascending, so the last index at or below the cap admits
  // every family up to that height.
  const levels = [{ height: 360 }, { height: 480 }, { height: 720 }, { height: 1080 }];

  it("caps at the tallest rung within the height cap", () => {
    expect(levelIndexForHeightCap(levels, 480)).toBe(1);
    expect(levelIndexForHeightCap(levels, 720)).toBe(2);
    expect(levelIndexForHeightCap(levels, 4320)).toBe(3);
  });

  it("still allows the lowest rung when the whole ladder is above the cap", () => {
    expect(levelIndexForHeightCap([{ height: 1080 }, { height: 2160 }], 480)).toBe(0);
  });

  it("is null with nothing to cap", () => {
    expect(levelIndexForHeightCap([], 480)).toBeNull();
    expect(levelIndexForHeightCap([{}], 480)).toBeNull();
  });
});

describe("qualityLabel", () => {
  const LEVELS = buildLevelMenu([{ height: 480 }, { height: 720 }, { height: 1080 }]);
  const at = (height: number) =>
    LEVELS.find((l) => l.label === `${height}p`)!.id as QualityId;

  it("reads 'Auto' on the adaptive selection with no known active rung", () => {
    expect(
      qualityLabel({ levels: LEVELS, selected: AUTO_QUALITY, activeHeight: null, pending: false }),
    ).toBe("Auto");
  });

  it("reads 'Auto (Np)' once the active ABR rung height is known", () => {
    expect(
      qualityLabel({ levels: LEVELS, selected: AUTO_QUALITY, activeHeight: 720, pending: false }),
    ).toBe("Auto (720p)");
  });

  it("shows the pinned rung once the switch is confirmed", () => {
    expect(
      qualityLabel({ levels: LEVELS, selected: at(720), activeHeight: 720, pending: false }),
    ).toBe("720p");
  });

  it("shows the target rung with a busy ellipsis while a manual switch is pending", () => {
    expect(
      qualityLabel({ levels: LEVELS, selected: at(480), activeHeight: 720, pending: true }),
    ).toBe("480p…");
  });

  it("ignores a pending flag on Auto (ABR is never 'busy')", () => {
    expect(
      qualityLabel({ levels: LEVELS, selected: AUTO_QUALITY, activeHeight: 480, pending: true }),
    ).toBe("Auto (480p)");
  });

  it("reads 'Auto' for a selection this menu no longer offers", () => {
    expect(
      qualityLabel({
        levels: LEVELS,
        selected: { height: 2160 },
        activeHeight: null,
        pending: false,
      }),
    ).toBe("Auto");
  });
});
