import { describe, expect, it } from "vitest";

import {
  HLS_ENGINES,
  canPlayNativeHls,
  pickEngine,
  selectEngines,
  type EngineSources,
} from "./player-engine";

const MASTER = "https://vidra.test/hls/master.m3u8";
const ORIGINAL = "https://vidra.test/original";

/** A local VOD video's sources: the ladder for both HLS engines, plus /original. */
const VOD: EngineSources = { hlsJs: MASTER, nativeHls: MASTER, progressive: ORIGINAL };
/** A video with no transcode ready yet: the progressive file is all there is. */
const ORIGINAL_ONLY: EngineSources = { progressive: ORIGINAL };
/** A live stream (or a federated .m3u8): a ladder and nothing to degrade to. */
const LADDER_ONLY: EngineSources = { hlsJs: MASTER, nativeHls: MASTER };

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

describe("selectEngines", () => {
  it("offers only the progressive engine when the detail carries no hls_url", () => {
    expect(
      selectEngines(ORIGINAL_ONLY, { mseSupported: true, nativeHls: true }),
    ).toEqual(["progressive"]);
  });

  it("ranks hls.js first whenever MSE exists — it is the only quality-selectable path", () => {
    expect(selectEngines(VOD, { mseSupported: true, nativeHls: false })).toEqual([
      "hls-js",
      "progressive",
    ]);
    // Even where the browser ALSO claims native HLS (Safari desktop, some
    // Chromium builds), hls.js is asked first so the quality menu works.
    expect(selectEngines(VOD, { mseSupported: true, nativeHls: true })).toEqual([
      "hls-js",
      "native-hls",
      "progressive",
    ]);
  });

  it("keeps native HLS ahead of the progressive file, not behind it", () => {
    // The bandwidth cliff this replaces: an MSE-less (or MSE-partial) Apple
    // browser used to be routed straight to the whole progressive file.
    expect(selectEngines(VOD, { mseSupported: false, nativeHls: true })).toEqual([
      "native-hls",
      "progressive",
    ]);
  });

  it("falls back to the progressive file with no HLS capability at all", () => {
    expect(selectEngines(VOD, { mseSupported: false, nativeHls: false })).toEqual([
      "progressive",
    ]);
  });

  it("selects nothing for a ladder no engine here can read", () => {
    expect(selectEngines(LADDER_ONLY, { mseSupported: false, nativeHls: false })).toEqual(
      [],
    );
    expect(selectEngines({}, { mseSupported: true, nativeHls: true })).toEqual([]);
  });
});

describe("pickEngine", () => {
  const full = selectEngines(VOD, { mseSupported: true, nativeHls: true });

  it("takes the first candidate when nothing has dropped out", () => {
    expect(pickEngine(full, [])).toBe("hls-js");
  });

  it("promotes native HLS when hls.js alone declines", () => {
    // hls.js answering isSupported() false says nothing about the stream, and
    // the browser already told us it plays HLS natively.
    expect(pickEngine(full, ["hls-js"])).toBe("native-hls");
  });

  it("drops to the progressive file when the PLAYLIST is what failed", () => {
    expect(pickEngine(full, HLS_ENGINES)).toBe("progressive");
  });

  it("is null once every candidate is out", () => {
    expect(pickEngine(selectEngines(LADDER_ONLY, { mseSupported: true, nativeHls: true }), HLS_ENGINES)).toBeNull();
    expect(pickEngine([], [])).toBeNull();
  });
});
